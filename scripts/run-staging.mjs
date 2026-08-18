import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const STAGING_ENV_FILE = ".env.staging.local";
const LOCAL_ENV_FILE = ".env.local";
const EXAMPLE_ENV_FILE = ".env.example";
const KNOWN_PRODUCTION_SUPABASE_REFS = ["svusqfcmwinvvpizdctj"];
const GHL_PRIVATE_TOKEN_KEYS = [
  "GHL_MIAMI_PRIVATE_TOKEN",
  "GHL_TAMPA_PRIVATE_TOKEN",
  "GHL_JACKSONVILLE_PRIVATE_TOKEN"
];
const REQUIRED_STAGING_KEYS = [
  "APP_ENV",
  "APP_URL",
  "PATIENT_PORTAL_URL",
  "APP_VERSION",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CRON_SECRET",
  "LEAD_CAPTURE_API_TOKEN",
  "STRIPE_WEBHOOK_SECRET",
  "ALLOW_DEMO_SEED",
  "GHL_ALLOW_WRITES",
  "GHL_READ_SYNC_ENABLED",
  "GHL_INTEGRATION_MODE"
];
const ADDITIONAL_KNOWN_KEYS = [
  "AI_OPERATING_MODE",
  "GHL_OAUTH_REFRESH_ENABLED",
  "GHL_WORKER_HEARTBEAT_ONLY",
  "GHL_WORKER_MAX_CYCLES",
  "GHL_WORKER_MAX_JOBS_PER_POLL",
  "GHL_WORKER_POLL_TIMEOUT_MS",
  "GHL_WORKER_DELAY_MS",
  "GHL_WORKER_IDLE_DELAY_MS",
  "TELEPHONY_MODE"
];
const PRESERVED_SYSTEM_ENV_KEYS = [
  "APPDATA",
  "ComSpec",
  "COMSPEC",
  "HOME",
  "LOCALAPPDATA",
  "NUMBER_OF_PROCESSORS",
  "Path",
  "PATH",
  "PATHEXT",
  "PROCESSOR_ARCHITECTURE",
  "SystemRoot",
  "SYSTEMROOT",
  "TEMP",
  "TMP",
  "USERDOMAIN",
  "USERNAME",
  "USERPROFILE",
  "WINDIR"
];

function parseEnvFile(path) {
  const values = new Map();
  if (!existsSync(path)) return values;

  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values.set(match[1], value);
  }

  return values;
}

function isPlaceholder(value) {
  const trimmed = value.trim();
  return (
    !trimmed ||
    trimmed.includes("__FILL") ||
    /^your[-_]/i.test(trimmed) ||
    /^replace[-_]/i.test(trimmed) ||
    trimmed.includes("your-project-ref")
  );
}

function decodeJwtPayload(value) {
  const parts = String(value ?? "").split(".");
  if (parts.length !== 3) return null;

  try {
    let normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (normalized.length % 4 !== 0) normalized += "=";
    return JSON.parse(Buffer.from(normalized, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function supabaseProjectRefFromUrl(value) {
  try {
    const host = new URL(value).hostname;
    return host.endsWith(".supabase.co") ? host.split(".")[0] : null;
  } catch {
    return null;
  }
}

function describeSupabaseApiKey(value) {
  const key = String(value ?? "").trim();
  const payload = decodeJwtPayload(key);
  const format = key.startsWith("sb_secret_")
    ? "sb_secret"
    : key.startsWith("sb_publishable_")
      ? "sb_publishable"
      : payload
        ? "jwt"
        : "unknown";
  const role = typeof payload?.role === "string" ? payload.role : null;
  const projectRef = typeof payload?.ref === "string" ? payload.ref : null;

  return {
    format,
    role,
    projectRef,
    isServerAdminKey: format === "sb_secret" || role === "service_role",
    isBrowserPublishableKey: format === "sb_publishable" || role === "anon"
  };
}

function fail(message) {
  console.error(`Staging startup refused: ${message}`);
  process.exit(1);
}

function buildBaseProcessEnvironment() {
  const baseEnv = {};

  for (const key of PRESERVED_SYSTEM_ENV_KEYS) {
    if (process.env[key] !== undefined) {
      baseEnv[key] = process.env[key];
    }
  }

  return baseEnv;
}

function buildStagingEnvironment() {
  const cwd = process.cwd();
  const stagingPath = resolve(cwd, STAGING_ENV_FILE);
  const localPath = resolve(cwd, LOCAL_ENV_FILE);
  const examplePath = resolve(cwd, EXAMPLE_ENV_FILE);

  if (!existsSync(stagingPath)) {
    fail(`${STAGING_ENV_FILE} was not found in ${cwd}`);
  }

  const stagingValues = parseEnvFile(stagingPath);
  const knownKeys = new Set([
    ...parseEnvFile(localPath).keys(),
    ...parseEnvFile(examplePath).keys(),
    ...stagingValues.keys(),
    ...ADDITIONAL_KNOWN_KEYS
  ]);
  const childEnv = buildBaseProcessEnvironment();

  for (const key of knownKeys) {
    childEnv[key] = stagingValues.has(key) ? stagingValues.get(key) ?? "" : "";
  }

  childEnv.APP_ENV = stagingValues.get("APP_ENV") ?? "";
  childEnv.NODE_ENV = "development";

  return { childEnv, stagingValues, stagingPath };
}

function validateStagingEnvironment(stagingValues) {
  for (const key of REQUIRED_STAGING_KEYS) {
    const value = stagingValues.get(key) ?? "";
    if (isPlaceholder(value)) fail(`${key} is missing or still contains a placeholder in ${STAGING_ENV_FILE}`);
  }

  if (stagingValues.get("APP_ENV") !== "staging") fail("APP_ENV must be exactly staging");
  if (stagingValues.get("ALLOW_DEMO_SEED") !== "false") fail("ALLOW_DEMO_SEED must be exactly false");
  if (stagingValues.get("GHL_ALLOW_WRITES") !== "false") fail("GHL_ALLOW_WRITES must be exactly false");
  if (stagingValues.get("GHL_READ_SYNC_ENABLED") !== "false") fail("GHL_READ_SYNC_ENABLED must remain false for manual local staging startup");

  for (const key of GHL_PRIVATE_TOKEN_KEYS) {
    if ((stagingValues.get(key) ?? "").trim()) {
      fail(`${key} must be blank until an explicit staging GHL token is approved`);
    }
  }

  const supabaseUrl = stagingValues.get("NEXT_PUBLIC_SUPABASE_URL") ?? "";
  let parsedUrl;
  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    fail("NEXT_PUBLIC_SUPABASE_URL is not a valid URL");
  }

  if (parsedUrl.protocol !== "https:") fail("NEXT_PUBLIC_SUPABASE_URL must use https");
  if (!parsedUrl.hostname.endsWith(".supabase.co")) fail("NEXT_PUBLIC_SUPABASE_URL must point to a Supabase project URL");

  const supabaseProjectRef = supabaseProjectRefFromUrl(supabaseUrl);
  const publishableKey = describeSupabaseApiKey(stagingValues.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ?? "");
  const serviceRoleKey = describeSupabaseApiKey(stagingValues.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

  if (!publishableKey.isBrowserPublishableKey) {
    const detected = publishableKey.format === "jwt" ? `jwt:${publishableKey.role ?? "unknown"}` : publishableKey.format;
    fail(`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a Supabase Publishable key beginning with sb_publishable_ or a legacy anon JWT. Detected safe key type: ${detected}`);
  }

  if (!serviceRoleKey.isServerAdminKey) {
    const detected = serviceRoleKey.format === "jwt" ? `jwt:${serviceRoleKey.role ?? "unknown"}` : serviceRoleKey.format;
    fail(`SUPABASE_SERVICE_ROLE_KEY must be a Supabase Secret key beginning with sb_secret_ or a legacy service_role JWT from the staging project. Detected safe key type: ${detected}`);
  }

  if (supabaseProjectRef && publishableKey.projectRef && publishableKey.projectRef !== supabaseProjectRef) {
    fail("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY belongs to a different Supabase project than NEXT_PUBLIC_SUPABASE_URL");
  }

  if (supabaseProjectRef && serviceRoleKey.projectRef && serviceRoleKey.projectRef !== supabaseProjectRef) {
    fail("SUPABASE_SERVICE_ROLE_KEY belongs to a different Supabase project than NEXT_PUBLIC_SUPABASE_URL");
  }

  const lowerUrl = supabaseUrl.toLowerCase();
  const matchedProductionRef = KNOWN_PRODUCTION_SUPABASE_REFS.find((ref) => lowerUrl.includes(ref));
  if (matchedProductionRef) {
    fail("NEXT_PUBLIC_SUPABASE_URL matches the known production Supabase project ref");
  }

  return {
    supabaseProjectRef,
    publishableKeyType: publishableKey.format === "jwt" ? `jwt:${publishableKey.role ?? "unknown"}` : publishableKey.format,
    serviceRoleKeyType: serviceRoleKey.format === "jwt" ? `jwt:${serviceRoleKey.role ?? "unknown"}` : serviceRoleKey.format,
    publishableJwtMatchesUrl: publishableKey.projectRef ? publishableKey.projectRef === supabaseProjectRef : null,
    serviceJwtMatchesUrl: serviceRoleKey.projectRef ? serviceRoleKey.projectRef === supabaseProjectRef : null
  };
}

function commandForTarget(target) {
  const nextCli = resolve(process.cwd(), "node_modules", "next", "dist", "bin", "next");

  if (target === "dev") return {
    command: process.execPath,
    args: [nextCli, "dev", "--turbopack"]
  };

  if (target === "ghl:continuous-worker") return {
    command: process.execPath,
    args: ["scripts/ghl-sync-worker.mjs", "--confirm-read-only-import", "--continuous"]
  };

  fail("unknown staging target. Use dev or ghl:continuous-worker");
}

const target = process.argv[2] ?? "dev";
const { childEnv, stagingValues, stagingPath } = buildStagingEnvironment();
const supabaseDiagnostics = validateStagingEnvironment(stagingValues);

const command = commandForTarget(target);
console.log(`Starting Dev Dashboard staging target "${target}" with ${STAGING_ENV_FILE}.`);
console.log(`Staging env path: ${stagingPath}`);
console.log("Safety gates: APP_ENV=staging GHL_ALLOW_WRITES=false ALLOW_DEMO_SEED=false GHL tokens blank");
console.log(`Staging Supabase diagnostics: projectRef=${supabaseDiagnostics.supabaseProjectRef ?? "unknown"} publishableKeyType=${supabaseDiagnostics.publishableKeyType} serviceRoleKeyType=${supabaseDiagnostics.serviceRoleKeyType} publishableJwtMatchesUrl=${supabaseDiagnostics.publishableJwtMatchesUrl ?? "opaque"} serviceJwtMatchesUrl=${supabaseDiagnostics.serviceJwtMatchesUrl ?? "opaque"}`);

let childExited = false;
const child = spawn(command.command, command.args, {
  cwd: process.cwd(),
  env: childEnv,
  stdio: "inherit",
  shell: false,
  windowsHide: false
});

function stopChild(signal) {
  if (!childExited && child.pid) {
    child.kill(signal);
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    stopChild(signal);
  });
}

process.once("exit", () => {
  stopChild("SIGTERM");
});

child.on("error", (error) => {
  childExited = true;
  console.error(`Staging startup failed: ${error.message}`);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  childExited = true;
  if (signal) {
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
