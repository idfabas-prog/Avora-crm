import { checkRateLimit, defaultRateLimitRules } from "@/lib/security/rate-limit";
import { rateLimited, requestIp, requireInternalRequest } from "@/lib/security/request-guard";
import { getGhlWorkerQueueDiagnostics, processGhlSyncJobs, queueDueGhlIncrementalReconciliation } from "@/lib/integrations/gohighlevel/importer";
import { refreshDueGhlOAuthInstallations } from "@/lib/integrations/gohighlevel/oauth";
import { createAdminClient } from "@/lib/supabase/admin";

function safeWorkerError(error: unknown) {
  if (error instanceof Error) {
    const message = error.message.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]").slice(0, 500);
    if (/invalid api key/i.test(message)) {
      return "Supabase admin API key was rejected while recording the worker heartbeat. Verify SUPABASE_SERVICE_ROLE_KEY is a staging Secret key beginning with sb_secret_ or a legacy service_role JWT for NEXT_PUBLIC_SUPABASE_URL.";
    }
    return message;
  }
  return "Unexpected GoHighLevel worker error";
}

function countByStatus(rows: { status?: string | null }[] | null) {
  return (rows ?? []).reduce<Record<string, number>>((counts, row) => {
    const status = String(row.status ?? "unknown");
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {});
}

function workerEnvironment() {
  const value = process.env.APP_ENV ?? process.env.NODE_ENV ?? "development";
  return ["development", "test", "staging", "production"].includes(value) ? value : "development";
}

async function heartbeatOrganizationId(supabase: ReturnType<typeof createAdminClient>) {
  const { data: avora, error: avoraError } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", "avora")
    .limit(1)
    .maybeSingle();
  if (avoraError) throw new Error(avoraError.message);
  if (typeof avora?.id === "string") return avora.id;

  const { data: first, error: firstError } = await supabase
    .from("organizations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (firstError) throw new Error(firstError.message);
  return typeof first?.id === "string" ? first.id : null;
}

async function recordGhlWorkerHeartbeat(
  supabase: ReturnType<typeof createAdminClient>,
  request: Request,
  mode: "heartbeat-only" | "sync-worker"
) {
  const now = new Date();
  const leaseSeconds = 180;
  const workerId = request.headers.get("x-worker-id") ?? `phase22-ghl-worker-${workerEnvironment()}`;
  const organizationId = await heartbeatOrganizationId(supabase);
  const { data, error } = await supabase
    .from("system_worker_heartbeats")
    .upsert({
      organization_id: organizationId,
      worker_id: workerId,
      worker_type: "ghl_continuous",
      environment: workerEnvironment(),
      status: "healthy",
      current_object_type: mode === "heartbeat-only" ? "heartbeat_only" : null,
      current_location_id: null,
      current_connection_id: null,
      last_heartbeat_at: now.toISOString(),
      lease_expires_at: new Date(now.getTime() + leaseSeconds * 1000).toISOString(),
      metadata_safe: {
        mode,
        read_only: true,
        writes_to_ghl: false,
        queue_incremental: false,
        provider_configured: Boolean(process.env.GHL_MIAMI_PRIVATE_TOKEN || process.env.GHL_TAMPA_PRIVATE_TOKEN || process.env.GHL_JACKSONVILLE_PRIVATE_TOKEN)
      }
    }, { onConflict: "worker_id" })
    .select("id,last_heartbeat_at,lease_expires_at,current_object_type")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    id: data?.id ?? null,
    organizationId,
    lastHeartbeatAt: data?.last_heartbeat_at ?? now.toISOString(),
    leaseExpiresAt: data?.lease_expires_at ?? null,
    currentObjectType: data?.current_object_type ?? null
  };
}

export async function POST(request: Request) {
  try {
    const authError = requireInternalRequest(request);
    if (authError) return authError;
    const limit = checkRateLimit(defaultRateLimitRules.internalJob, requestIp(request));
    if (!limit.allowed) return rateLimited(limit.resetAt);
    const supabase = createAdminClient();
    const url = new URL(request.url);
    const requestedJobs = Number(url.searchParams.get("maxJobs") ?? "");
    const diagnostic = url.searchParams.get("diagnostic") === "1";
    const queueIncremental = url.searchParams.get("queueIncremental") === "1";
    const heartbeatOnly = url.searchParams.get("heartbeatOnly") === "1";

    const heartbeat = await recordGhlWorkerHeartbeat(supabase, request, heartbeatOnly ? "heartbeat-only" : "sync-worker");

    if (heartbeatOnly) {
      return Response.json({
        ok: true,
        heartbeatOnly: true,
        diagnostic: false,
        readOnly: true,
        writesToGhl: false,
        adminClientReady: true,
        jobsProcessed: 0,
        claimed: 0,
        completed: 0,
        retried: 0,
        failed: 0,
        queuedNext: 0,
        incrementalQueued: 0,
        diagnostics: ["heartbeat_only_no_provider"],
        heartbeat
      });
    }

    if (diagnostic || requestedJobs === 0) {
      const { data: jobs, error } = await supabase
        .from("ghl_sync_jobs")
        .select("status")
        .in("status", ["queued", "running", "locked", "failed", "dead_letter"])
        .limit(500);
      if (error) throw new Error(error.message);
      const queue = await getGhlWorkerQueueDiagnostics(supabase);
      return Response.json({
        ok: true,
        diagnostic: true,
        readOnly: true,
        writesToGhl: false,
        adminClientReady: true,
        heartbeat,
        jobsProcessed: 0,
        queueStatus: countByStatus(jobs),
        queue
      });
    }

    const oauthRefresh = process.env.GHL_OAUTH_REFRESH_ENABLED === "true"
      ? await refreshDueGhlOAuthInstallations(supabase)
      : { checked: 0, due: 0, refreshed: 0, failed: 0, skippedReason: "oauth_refresh_disabled" };
    const incrementalQueued = queueIncremental ? await queueDueGhlIncrementalReconciliation(supabase) : 0;
    const result = await processGhlSyncJobs(supabase, {
      maxJobs: Number.isFinite(requestedJobs) && requestedJobs > 0 ? Math.min(25, requestedJobs) : undefined,
      workerId: request.headers.get("x-worker-id") ?? undefined
    });
    const queue = Number(result.claimed ?? 0) === 0 ? await getGhlWorkerQueueDiagnostics(supabase) : undefined;
    return Response.json({ ok: true, readOnly: true, writesToGhl: false, heartbeat, oauthRefresh, incrementalQueued, ...result, queue });
  } catch (error) {
    return Response.json({ ok: false, readOnly: true, writesToGhl: false, error: safeWorkerError(error) }, { status: 500 });
  }
}
