import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

export const DEFAULT_WORKER_MAX_JOBS_PER_POLL = 1;
export const DEFAULT_WORKER_POLL_TIMEOUT_MS = 10 * 60 * 1000;
export const DEFAULT_WORKER_TRANSIENT_BACKOFF_MS = 10 * 1000;
export const GHL_PRIVATE_TOKEN_KEYS = [
  "GHL_MIAMI_PRIVATE_TOKEN",
  "GHL_TAMPA_PRIVATE_TOKEN",
  "GHL_JACKSONVILLE_PRIVATE_TOKEN"
];

export function loadDotEnvLocal(env = process.env) {
  if (env.APP_ENV === "staging") return false;
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return false;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!/^[A-Z0-9_]+=/.test(line)) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index);
    const value = line.slice(index + 1);
    if (!(key in env)) env[key] = value;
  }
  return true;
}

function requiredEnv(name, env = process.env) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function realGhlProviderConfigured(env = process.env) {
  return GHL_PRIVATE_TOKEN_KEYS.some((key) => Boolean(env[key]?.trim()));
}

export function stagingHeartbeatOnlyMode(env = process.env) {
  return env.APP_ENV === "staging" && !realGhlProviderConfigured(env);
}

export function configureWorkerMode({ continuous = false, env = process.env } = {}) {
  const heartbeatOnly = continuous && stagingHeartbeatOnlyMode(env);

  if (heartbeatOnly) {
    env.GHL_READ_SYNC_ENABLED = "false";
    env.GHL_WORKER_HEARTBEAT_ONLY = "true";
    return {
      heartbeatOnly: true,
      readSyncEnabled: false,
      mode: "heartbeat-only"
    };
  }

  if (continuous) env.GHL_READ_SYNC_ENABLED = "true";
  env.GHL_WORKER_HEARTBEAT_ONLY = "false";
  return {
    heartbeatOnly: false,
    readSyncEnabled: env.GHL_READ_SYNC_ENABLED === "true",
    mode: env.GHL_READ_SYNC_ENABLED === "true" ? "continuous-sync" : "single-poll"
  };
}

export function workerUrl(maxJobs = DEFAULT_WORKER_MAX_JOBS_PER_POLL, options = {}) {
  const env = options.env ?? process.env;
  const appUrl = requiredEnv("APP_URL", env);
  const params = new URLSearchParams({ maxJobs: String(maxJobs) });
  const heartbeatOnly = options.heartbeatOnly ?? env.GHL_WORKER_HEARTBEAT_ONLY === "true";
  if (heartbeatOnly) {
    params.set("heartbeatOnly", "1");
  } else if (env.GHL_READ_SYNC_ENABLED === "true") {
    params.set("queueIncremental", "1");
  }
  return new URL(`/api/integrations/gohighlevel/sync?${params.toString()}`, appUrl);
}

function safeErrorMessage(error) {
  return String(error?.message ?? error ?? "Unknown worker error")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .slice(0, 500);
}

export function isTransientWorkerFetchError(error) {
  const code = error?.cause?.code ?? error?.code;
  if (["UND_ERR_HEADERS_TIMEOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN"].includes(String(code))) return true;
  if (error instanceof TypeError && /fetch failed/i.test(error.message)) return true;
  if (error?.name === "AbortError" || error?.name === "TimeoutError") return true;
  return false;
}

export function workerBackoffDelayMs(failureCount, baseMs = DEFAULT_WORKER_TRANSIENT_BACKOFF_MS) {
  const exponent = Math.min(Math.max(0, failureCount - 1), 5);
  return Math.min(baseMs * (2 ** exponent), 60 * 1000);
}

export function safeShutdownState(signal, currentCycle = null) {
  return {
    signal,
    currentCycle,
    acceptingNewWork: false,
    strategy: "finish-current-request-then-stop-polling"
  };
}

async function callWorker(options = {}) {
  const cronSecret = requiredEnv("CRON_SECRET");
  const maxJobs = Number(options.maxJobs ?? process.env.GHL_WORKER_MAX_JOBS_PER_POLL ?? DEFAULT_WORKER_MAX_JOBS_PER_POLL);
  const timeoutMs = Number(options.timeoutMs ?? process.env.GHL_WORKER_POLL_TIMEOUT_MS ?? DEFAULT_WORKER_POLL_TIMEOUT_MS);
  const heartbeatOnly = options.heartbeatOnly ?? process.env.GHL_WORKER_HEARTBEAT_ONLY === "true";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(workerUrl(maxJobs, { heartbeatOnly }), {
      method: "POST",
      headers: {
        authorization: `Bearer ${cronSecret}`,
        "x-cron-secret": cronSecret,
        "x-worker-id": `phase21-local-worker-${process.pid}`
      },
      signal: controller.signal
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      const permanent = response.status === 401 || response.status === 403;
      const error = new Error(payload?.error || `Worker returned HTTP ${response.status}`);
      error.permanent = permanent;
      throw error;
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

export async function runWorkerLoop() {
  loadDotEnvLocal();
  const continuous = process.argv.includes("--continuous");
  const workerMode = configureWorkerMode({ continuous });

  if (!process.argv.includes("--confirm-read-only-import")) {
    console.error("Refusing to run without --confirm-read-only-import.");
    process.exitCode = 1;
    return;
  }

  if (process.env.GHL_ALLOW_WRITES !== "false") {
    console.error("Refusing to run unless GHL_ALLOW_WRITES=false.");
    process.exitCode = 1;
    return;
  }

  const maxCycles = Number(process.env.GHL_WORKER_MAX_CYCLES ?? 0);
  const delayMs = Number(process.env.GHL_WORKER_DELAY_MS ?? 2000);
  const idleDelayMs = Number(process.env.GHL_WORKER_IDLE_DELAY_MS ?? delayMs);
  const maxJobsPerPoll = Number(process.env.GHL_WORKER_MAX_JOBS_PER_POLL ?? DEFAULT_WORKER_MAX_JOBS_PER_POLL);
  const timeoutMs = Number(process.env.GHL_WORKER_POLL_TIMEOUT_MS ?? DEFAULT_WORKER_POLL_TIMEOUT_MS);
  const endpoint = workerUrl(maxJobsPerPoll, { heartbeatOnly: workerMode.heartbeatOnly });
  let transientFailures = 0;
  let stopRequested = false;
  const requestStop = (signal) => {
    stopRequested = true;
    console.log(`Shutdown requested: ${JSON.stringify(safeShutdownState(signal))}`);
  };
  process.once("SIGINT", () => requestStop("SIGINT"));
  process.once("SIGTERM", () => requestStop("SIGTERM"));

  console.log("Starting GoHighLevel read-only worker loop.");
  console.log(`Environment: APP_URL present=${Boolean(process.env.APP_URL)} CRON_SECRET present=${Boolean(process.env.CRON_SECRET)} SUPABASE_SERVICE_ROLE_KEY present=${Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)} GHL_ALLOW_WRITES=false GHL_READ_SYNC_ENABLED=${process.env.GHL_READ_SYNC_ENABLED === "true"} GHL_PROVIDER_CONFIGURED=${realGhlProviderConfigured()}`);
  console.log(`Worker mode: ${workerMode.mode}`);
  console.log(`Worker endpoint: ${endpoint.origin}${endpoint.pathname}${endpoint.search}`);
  console.log(`Worker settings: maxCycles=${maxCycles === 0 ? "unbounded" : maxCycles} delayMs=${delayMs} idleDelayMs=${idleDelayMs} maxJobsPerPoll=${maxJobsPerPoll} pollTimeoutMs=${timeoutMs}`);

  for (let cycle = 1; !stopRequested && (maxCycles === 0 || cycle <= maxCycles); cycle += 1) {
    console.log(`cycle=${cycle} poll started`);
    try {
      const result = await callWorker({ maxJobs: maxJobsPerPoll, timeoutMs, heartbeatOnly: workerMode.heartbeatOnly });
      transientFailures = 0;
      console.log(`cycle=${cycle} heartbeatOnly=${Boolean(result.heartbeatOnly)} claimed=${result.claimed ?? 0} completed=${result.completed ?? 0} retried=${result.retried ?? 0} failed=${result.failed ?? 0} queuedNext=${result.queuedNext ?? 0}`);
      for (const diagnostic of result.diagnostics ?? []) {
        console.log(`cycle=${cycle} ${diagnostic}`);
      }
      const idle = !Number(result.claimed ?? 0) && !Number(result.queuedNext ?? 0);
      if (idle) console.log(`cycle=${cycle} no jobs due; polling will continue`);
      if (!stopRequested) await sleep(idle ? idleDelayMs : delayMs);
    } catch (error) {
      if (error?.permanent || !isTransientWorkerFetchError(error)) {
        console.error(`cycle=${cycle} permanent worker error: ${safeErrorMessage(error)}`);
        process.exitCode = 1;
        return;
      }
      transientFailures += 1;
      const backoffMs = workerBackoffDelayMs(transientFailures);
      const code = error?.cause?.code ?? error?.code ?? error?.name ?? "unknown";
      console.warn(`cycle=${cycle} transient worker transport error code=${code}: ${safeErrorMessage(error)}; retrying in ${backoffMs}ms`);
      if (!stopRequested) await sleep(backoffMs);
    }
  }

  console.log(stopRequested ? "GoHighLevel read-only worker loop stopped safely." : "GoHighLevel read-only worker loop finished.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await runWorkerLoop();
}
