import { getAppEnvironment, getAppVersion, validateEnvironment } from "../config/environment.ts";
import { redactMetadata } from "../observability/logger.ts";

export type OperationalStatus = "healthy" | "warning" | "degraded" | "down";

export type SyncCadenceKey =
  | "appointment"
  | "opportunity"
  | "contact"
  | "conversation"
  | "message"
  | "transaction"
  | "order"
  | "calendar"
  | "user"
  | "custom_field"
  | "tag"
  | "pipeline"
  | "drift_reconciliation";

export type SyncCadence = {
  objectType: SyncCadenceKey;
  label: string;
  everyMinutes: number;
  envVar: string;
};

export const PHASE_22_DEFAULT_SYNC_CADENCES: SyncCadence[] = [
  { objectType: "appointment", label: "Appointments", everyMinutes: 2, envVar: "GHL_SYNC_APPOINTMENT_EVERY_MINUTES" },
  { objectType: "opportunity", label: "Opportunities", everyMinutes: 5, envVar: "GHL_SYNC_OPPORTUNITY_EVERY_MINUTES" },
  { objectType: "contact", label: "Contacts", everyMinutes: 5, envVar: "GHL_SYNC_CONTACT_EVERY_MINUTES" },
  { objectType: "conversation", label: "Conversations", everyMinutes: 5, envVar: "GHL_SYNC_CONVERSATION_EVERY_MINUTES" },
  { objectType: "message", label: "Messages", everyMinutes: 5, envVar: "GHL_SYNC_MESSAGE_EVERY_MINUTES" },
  { objectType: "transaction", label: "Transactions", everyMinutes: 15, envVar: "GHL_SYNC_TRANSACTION_EVERY_MINUTES" },
  { objectType: "order", label: "Orders", everyMinutes: 15, envVar: "GHL_SYNC_ORDER_EVERY_MINUTES" },
  { objectType: "calendar", label: "Calendars", everyMinutes: 30, envVar: "GHL_SYNC_CALENDAR_EVERY_MINUTES" },
  { objectType: "user", label: "Users", everyMinutes: 30, envVar: "GHL_SYNC_USER_EVERY_MINUTES" },
  { objectType: "custom_field", label: "Custom Fields", everyMinutes: 30, envVar: "GHL_SYNC_CUSTOM_FIELD_EVERY_MINUTES" },
  { objectType: "tag", label: "Tags", everyMinutes: 30, envVar: "GHL_SYNC_TAG_EVERY_MINUTES" },
  { objectType: "pipeline", label: "Pipelines", everyMinutes: 30, envVar: "GHL_SYNC_PIPELINE_EVERY_MINUTES" },
  { objectType: "drift_reconciliation", label: "Drift Reconciliation", everyMinutes: 360, envVar: "GHL_DRIFT_RECONCILIATION_EVERY_MINUTES" }
];

export type WorkerHeartbeatInput = {
  lastHeartbeatAt: string | null;
  leaseExpiresAt?: string | null;
  status?: string | null;
};

export type SchedulerLockInput = {
  lockKey: string;
  workerId: string;
  leaseExpiresAt: string | null;
};

export type IncidentInput = {
  organizationId?: string | null;
  incidentType: string;
  severity: "SEV-1" | "SEV-2" | "SEV-3" | "SEV-4";
  source: string;
  message: string;
  metadata?: Record<string, unknown>;
};

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export function phase22SyncCadences(env: NodeJS.ProcessEnv = process.env) {
  return PHASE_22_DEFAULT_SYNC_CADENCES.map((cadence) => ({
    ...cadence,
    everyMinutes: positiveInteger(env[cadence.envVar], cadence.everyMinutes)
  }));
}

export function workerHealthStatus(input: WorkerHeartbeatInput, now = Date.now()): OperationalStatus {
  if (input.status === "down" || input.status === "stopping") return input.status === "down" ? "down" : "warning";
  if (!input.lastHeartbeatAt) return "down";

  const ageMs = now - new Date(input.lastHeartbeatAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return "warning";
  if (input.leaseExpiresAt && new Date(input.leaseExpiresAt).getTime() < now) return "degraded";
  if (ageMs > 15 * 60_000) return "down";
  if (ageMs > 5 * 60_000) return "degraded";
  if (ageMs > 2 * 60_000) return "warning";
  return "healthy";
}

export function schedulerLockClaimable(lock: SchedulerLockInput | null, workerId: string, now = Date.now()) {
  if (!lock) return true;
  if (lock.workerId === workerId) return true;
  if (!lock.leaseExpiresAt) return true;
  return new Date(lock.leaseExpiresAt).getTime() <= now;
}

export function productionWriteGateStatus(env: NodeJS.ProcessEnv = process.env) {
  const raw = env.GHL_ALLOW_WRITES;
  return {
    writesAllowed: raw === "true",
    rawValue: raw ?? "undefined",
    safe: raw !== "true"
  };
}

export function validatePhase22ProductionEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const validation = validateEnvironment(env);
  const warnings = [...validation.warnings];
  const missing = [...validation.missing];
  const environment = validation.environment;

  if ((environment === "production" || environment === "staging") && !env.APP_ENV) {
    warnings.push("APP_ENV must be explicit for production-like runtimes.");
  }
  if (environment === "production" && env.GHL_ALLOW_WRITES !== "false") {
    warnings.push("GHL_ALLOW_WRITES=false is required before production launch.");
  }
  if (environment === "production" && env.ALLOW_DEMO_SEED !== "false") {
    warnings.push("ALLOW_DEMO_SEED=false is required before production launch.");
  }

  return {
    ...validation,
    missing: Array.from(new Set(missing)),
    warnings: Array.from(new Set(warnings)),
    ok: validation.ok && !warnings.some((warning) => warning.includes("required") || warning.includes("must"))
  };
}

export function buildSystemIncident(input: IncidentInput) {
  return {
    organization_id: input.organizationId ?? null,
    incident_type: input.incidentType,
    severity: input.severity,
    status: "open",
    source: input.source,
    summary: input.message.slice(0, 240),
    message: input.message.slice(0, 1000),
    opened_at: new Date().toISOString(),
    metadata_safe: redactMetadata(input.metadata ?? {})
  };
}

export function summarizeOperationalStatus(statuses: OperationalStatus[]): OperationalStatus {
  if (statuses.includes("down")) return "down";
  if (statuses.includes("degraded")) return "degraded";
  if (statuses.includes("warning")) return "warning";
  return "healthy";
}

export function deploymentDiagnostics(env: NodeJS.ProcessEnv = process.env) {
  return {
    environment: getAppEnvironment(env),
    appVersion: getAppVersion(env),
    appUrlPresent: Boolean(env.APP_URL),
    cronSecretPresent: Boolean(env.CRON_SECRET),
    serviceRolePresent: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
    ghlMiamiTokenPresent: Boolean(env.GHL_MIAMI_PRIVATE_TOKEN),
    ghlWritesAllowed: env.GHL_ALLOW_WRITES === "true",
    demoSeedAllowed: env.ALLOW_DEMO_SEED === "true"
  };
}

export function safeShutdownState(receivedSignal: string, currentJobId: string | null) {
  return {
    acceptingNewWork: false,
    currentJobId,
    releaseStrategy: currentJobId ? "finish-current-batch-or-allow-lease-expiry" : "release-immediately",
    signal: receivedSignal
  };
}
