import { getAppEnvironment, getAppVersion, validateEnvironment } from "../config/environment.ts";
import { deploymentDiagnostics, phase22SyncCadences, summarizeOperationalStatus, workerHealthStatus, type OperationalStatus } from "./operations.ts";

type DatabaseError = { message?: string; code?: string } | null;
type DatabaseResponse<T = unknown> = { data: T | null; error?: DatabaseError; count?: number | null };

type SupabaseBuilder = {
  eq: (...args: unknown[]) => SupabaseBuilder;
  in: (...args: unknown[]) => SupabaseBuilder;
  order: (...args: unknown[]) => SupabaseBuilder;
  limit: (...args: unknown[]) => SupabaseBuilder;
};

type SupabaseLike = {
  from: (table: string) => { select: (columns?: string, options?: Record<string, unknown>) => SupabaseBuilder };
};

type ProfileLike = {
  organizationId: string;
  locations: Array<{ id: string; name: string; slug: string }>;
};

type SafeQueryResult<T> = {
  data: T;
  error: string | null;
};

function errorList(results: Array<SafeQueryResult<unknown>>) {
  return results
    .map((result) => result.error)
    .filter((error): error is string => Boolean(error));
}

async function safeQuery<T>(fallback: T, query: () => unknown): Promise<SafeQueryResult<T>> {
  try {
    const result = await query() as DatabaseResponse<T>;
    if (result.error) {
      const code = result.error.code ? `${result.error.code}: ` : "";
      return { data: fallback, error: `${code}${result.error.message ?? "Unknown database error"}` };
    }
    return { data: result.data ?? fallback, error: null };
  } catch (error) {
    return { data: fallback, error: error instanceof Error ? error.message : "Unknown database exception" };
  }
}

async function safeCount(supabase: SupabaseLike, table: string, filters: (query: SupabaseBuilder) => SupabaseBuilder) {
  try {
    const query = filters(supabase.from(table).select("id", { count: "exact", head: true }));
    const { count, error } = await query as unknown as DatabaseResponse;
    return { count: error ? 0 : count ?? 0, error: error?.message ?? null };
  } catch (error) {
    return { count: 0, error: error instanceof Error ? error.message : "Unknown count error" };
  }
}

function newestTimestamp(rows: Array<Record<string, unknown>>, keys: string[]) {
  const timestamps = rows
    .flatMap((row) => keys.map((key) => row[key]))
    .filter((value): value is string => typeof value === "string")
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);
  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

function statusFromCounts(input: { databaseErrors: number; deadJobs: number; staleJobs: number; unresolvedExceptions: number; workerStatuses: OperationalStatus[] }) {
  return summarizeOperationalStatus([
    input.databaseErrors > 0 ? "degraded" : "healthy",
    input.deadJobs > 0 ? "degraded" : "healthy",
    input.staleJobs > 0 ? "warning" : "healthy",
    input.unresolvedExceptions > 0 ? "warning" : "healthy",
    ...input.workerStatuses
  ]);
}

export async function getSystemHealthReport(profile: ProfileLike, supabaseClient: unknown, env: NodeJS.ProcessEnv = process.env) {
  const supabase = supabaseClient as SupabaseLike;
  const organizationId = profile.organizationId;
  const miami = profile.locations.find((location) => location.slug === "miami") ?? profile.locations[0] ?? null;
  const now = Date.now();

  const databaseProbe = await safeQuery<Record<string, unknown>[]>([], () => supabase.from("organizations").select("id").eq("id", organizationId).limit(1));

  const [
    healthChecks,
    incidents,
    heartbeats,
    locks,
    smokeRuns,
    deployments,
    ghlConnections,
    ghlRuns,
    ghlJobs,
    ghlExceptions
  ] = await Promise.all([
    safeQuery<Record<string, unknown>[]>([], () => supabase.from("system_health_checks").select("*").eq("organization_id", organizationId).order("category")),
    safeQuery<Record<string, unknown>[]>([], () => supabase.from("system_incidents").select("*").eq("organization_id", organizationId).in("status", ["open", "monitoring"]).order("opened_at", { ascending: false }).limit(20)),
    safeQuery<Record<string, unknown>[]>([], () => supabase.from("system_worker_heartbeats").select("*").eq("organization_id", organizationId).order("last_heartbeat_at", { ascending: false }).limit(20)),
    safeQuery<Record<string, unknown>[]>([], () => supabase.from("system_scheduler_locks").select("*").eq("organization_id", organizationId).order("lease_expires_at", { ascending: false }).limit(20)),
    safeQuery<Record<string, unknown>[]>([], () => supabase.from("system_smoke_test_runs").select("*").eq("organization_id", organizationId).order("started_at", { ascending: false }).limit(5)),
    safeQuery<Record<string, unknown>[]>([], () => supabase.from("system_deployment_events").select("*").eq("organization_id", organizationId).order("deployed_at", { ascending: false }).limit(5)),
    safeQuery<Record<string, unknown>[]>([], () => {
      let query = supabase.from("ghl_connections").select("*").eq("organization_id", organizationId);
      if (miami) query = query.eq("location_id", miami.id);
      return query.order("updated_at", { ascending: false });
    }),
    safeQuery<Record<string, unknown>[]>([], () => supabase.from("ghl_sync_runs").select("*").eq("organization_id", organizationId).order("started_at", { ascending: false }).limit(20)),
    safeQuery<Record<string, unknown>[]>([], () => supabase.from("ghl_sync_jobs").select("*").eq("organization_id", organizationId).in("status", ["queued", "locked", "running", "failed", "dead_letter"]).order("run_at", { ascending: true }).limit(100)),
    safeQuery<Record<string, unknown>[]>([], () => supabase.from("ghl_sync_exceptions").select("*").eq("organization_id", organizationId).in("status", ["open", "review"]).order("created_at", { ascending: false }).limit(100))
  ]);

  const ghlConnectionIds = ghlConnections.data
    .map((connection) => connection.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const ghlCursors = ghlConnectionIds.length > 0
    ? await safeQuery<Record<string, unknown>[]>([], () =>
      supabase
        .from("ghl_sync_cursors")
        .select("*")
        .in("connection_id", ghlConnectionIds)
        .order("last_sync_completed_at", { ascending: false })
        .limit(50)
    )
    : { data: [], error: null };

  const queueDepth = await safeCount(supabase, "ghl_sync_jobs", (query) => query.eq("organization_id", organizationId).eq("status", "queued"));
  const runningJobs = await safeCount(supabase, "ghl_sync_jobs", (query) => query.eq("organization_id", organizationId).in("status", ["locked", "running"]));
  const deadJobs = await safeCount(supabase, "ghl_sync_jobs", (query) => query.eq("organization_id", organizationId).eq("status", "dead_letter"));
  const unresolvedExceptions = await safeCount(supabase, "ghl_sync_exceptions", (query) => query.eq("organization_id", organizationId).in("status", ["open", "review"]));

  const workerStatuses = heartbeats.data.map((heartbeat) =>
    workerHealthStatus({
      lastHeartbeatAt: typeof heartbeat.last_heartbeat_at === "string" ? heartbeat.last_heartbeat_at : null,
      leaseExpiresAt: typeof heartbeat.lease_expires_at === "string" ? heartbeat.lease_expires_at : null,
      status: typeof heartbeat.status === "string" ? heartbeat.status : null
    }, now)
  );
  const staleJobs = ghlJobs.data.filter((job) => {
    if (job.status !== "running" && job.status !== "locked") return false;
    const updatedAt = typeof job.updated_at === "string" ? job.updated_at : null;
    return updatedAt ? now - new Date(updatedAt).getTime() > 15 * 60_000 : true;
  }).length;
  const connectivityErrors = errorList([databaseProbe]);
  const schemaErrors = errorList([healthChecks, incidents, heartbeats, locks, smokeRuns, deployments]);
  const syncErrors = errorList([ghlConnections, ghlRuns, ghlJobs, ghlExceptions, ghlCursors]);
  const countErrors = [queueDepth.error, runningJobs.error, deadJobs.error, unresolvedExceptions.error].filter((error): error is string => Boolean(error));
  const diagnosticErrors = [...connectivityErrors, ...schemaErrors, ...syncErrors, ...countErrors];

  const miamiConnection = ghlConnections.data.find((connection) => connection.ghl_location_id === "Y4e3rWEXVyXCZmZaCs8d")
    ?? ghlConnections.data.find((connection) => typeof connection.ghl_location_id === "string" && !connection.ghl_location_id.startsWith("ghl_mock_"))
    ?? null;
  const configuredGhlLocationId = typeof miamiConnection?.ghl_location_id === "string" ? miamiConnection.ghl_location_id : null;

  return {
    overallStatus: statusFromCounts({
      databaseErrors: connectivityErrors.length + schemaErrors.length,
      deadJobs: deadJobs.count,
      staleJobs,
      unresolvedExceptions: unresolvedExceptions.count,
      workerStatuses
    }),
    diagnostics: deploymentDiagnostics(env),
    environment: validateEnvironment(env),
    app: {
      environment: getAppEnvironment(env),
      version: getAppVersion(env),
      deploymentTimestamp: env.DEPLOYED_AT ?? env.VERCEL_DEPLOYMENT_ID ?? null,
      uptimeSeconds: typeof process.uptime === "function" ? Math.floor(process.uptime()) : null
    },
    database: {
      reachable: connectivityErrors.length === 0,
      errors: diagnosticErrors,
      connectivityErrors,
      schemaErrors,
      serviceRolePresent: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
      migrationStatus: schemaErrors.length > 0 ? "phase_22_migration_missing_or_incomplete" : "phase_22_tables_visible"
    },
    storage: {
      status: "manual_check_required",
      summary: "Manual Supabase bucket check required before production launch"
    },
    ghl: {
      miamiLocationId: configuredGhlLocationId,
      connection: miamiConnection,
      tokenPresent: Boolean(env.GHL_MIAMI_PRIVATE_TOKEN),
      writeGate: env.GHL_ALLOW_WRITES === "true" ? "enabled" : "disabled",
      lastApiSuccess: newestTimestamp(ghlRuns.data.filter((run) => run.status === "succeeded"), ["completed_at", "started_at"]),
      lastApiFailure: newestTimestamp(ghlRuns.data.filter((run) => run.status === "failed" || run.status === "partial"), ["completed_at", "started_at"])
    },
    sync: {
      cadences: phase22SyncCadences(env),
      cursors: ghlCursors.data,
      queueDepth: queueDepth.count,
      runningJobs: runningJobs.count,
      staleJobs,
      deadLetterJobs: deadJobs.count,
      unresolvedExceptions: unresolvedExceptions.count,
      nextScheduledRun: newestTimestamp(ghlJobs.data.filter((job) => job.status === "queued"), ["run_at"]),
      errors: [...syncErrors, ...countErrors]
    },
    workers: {
      heartbeats: heartbeats.data,
      statuses: workerStatuses,
      locks: locks.data
    },
    incidents: incidents.data,
    smokeRuns: smokeRuns.data,
    deployments: deployments.data,
    healthChecks: healthChecks.data,
    counts: {
      queueDepthError: queueDepth.error,
      runningJobsError: runningJobs.error,
      deadJobsError: deadJobs.error,
      exceptionsError: unresolvedExceptions.error
    }
  };
}
