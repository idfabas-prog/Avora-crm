export type AppEnvironment = "development" | "test" | "staging" | "production";

export type EnvVarRule = {
  name: string;
  group: string;
  requiredIn: AppEnvironment[];
  secret: boolean;
  serverOnly: boolean;
  public: boolean;
  description: string;
};

const appEnvironments = new Set(["development", "test", "staging", "production"]);

export const envVarRules: EnvVarRule[] = [
  { name: "NEXT_PUBLIC_SUPABASE_URL", group: "Supabase", requiredIn: ["development", "staging", "production"], secret: false, serverOnly: false, public: true, description: "Supabase project URL" },
  { name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", group: "Supabase", requiredIn: ["development", "staging", "production"], secret: false, serverOnly: false, public: true, description: "Supabase publishable or anon key" },
  { name: "SUPABASE_SERVICE_ROLE_KEY", group: "Supabase", requiredIn: ["staging", "production"], secret: true, serverOnly: true, public: false, description: "Server-only service role key for controlled admin operations" },
  { name: "APP_ENV", group: "Application", requiredIn: ["staging", "production"], secret: false, serverOnly: true, public: false, description: "Explicit application runtime environment" },
  { name: "APP_URL", group: "Application", requiredIn: ["staging", "production"], secret: false, serverOnly: true, public: false, description: "Canonical staff application URL" },
  { name: "APP_VERSION", group: "Application", requiredIn: ["staging", "production"], secret: false, serverOnly: true, public: false, description: "Application release version or commit SHA shown in health diagnostics" },
  { name: "PATIENT_PORTAL_URL", group: "Application", requiredIn: ["staging", "production"], secret: false, serverOnly: true, public: false, description: "Canonical patient portal URL" },
  { name: "CRON_SECRET", group: "Internal Jobs", requiredIn: ["staging", "production"], secret: true, serverOnly: true, public: false, description: "Bearer secret for scheduled/internal routes" },
  { name: "ALLOW_DEMO_SEED", group: "Database", requiredIn: ["production"], secret: false, serverOnly: true, public: false, description: "Production must keep development/demo seed execution disabled" },
  { name: "PAYMENTS_MODE", group: "Stripe", requiredIn: ["production"], secret: false, serverOnly: true, public: false, description: "Payments mode" },
  { name: "PAYMENTS_ALLOW_LIVE_CHARGES", group: "Stripe", requiredIn: ["production"], secret: false, serverOnly: true, public: false, description: "Master gate for live charges" },
  { name: "STRIPE_SECRET_KEY", group: "Stripe", requiredIn: [], secret: true, serverOnly: true, public: false, description: "Stripe server secret key" },
  { name: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", group: "Stripe", requiredIn: [], secret: false, serverOnly: false, public: true, description: "Stripe publishable key" },
  { name: "STRIPE_WEBHOOK_SECRET", group: "Stripe", requiredIn: ["staging", "production"], secret: true, serverOnly: true, public: false, description: "Stripe webhook signing secret" },
  { name: "COMMUNICATIONS_MODE", group: "Twilio", requiredIn: ["production"], secret: false, serverOnly: true, public: false, description: "Communications mode" },
  { name: "COMMUNICATIONS_ALLOW_LIVE_SEND", group: "Twilio", requiredIn: ["production"], secret: false, serverOnly: true, public: false, description: "Master gate for live SMS sends" },
  { name: "TELEPHONY_ALLOW_LIVE_CALLS", group: "Twilio", requiredIn: ["production"], secret: false, serverOnly: true, public: false, description: "Master gate for live calls" },
  { name: "TWILIO_ACCOUNT_SID", group: "Twilio", requiredIn: [], secret: false, serverOnly: true, public: false, description: "Twilio account SID" },
  { name: "TWILIO_AUTH_TOKEN", group: "Twilio", requiredIn: [], secret: true, serverOnly: true, public: false, description: "Twilio auth token" },
  { name: "AI_MODE", group: "OpenAI", requiredIn: ["production"], secret: false, serverOnly: true, public: false, description: "AI operating mode" },
  { name: "AI_LIVE_PROVIDER_ENABLED", group: "OpenAI", requiredIn: ["production"], secret: false, serverOnly: true, public: false, description: "Master gate for live AI provider usage" },
  { name: "OPENAI_API_KEY", group: "OpenAI", requiredIn: [], secret: true, serverOnly: true, public: false, description: "OpenAI API key" },
  { name: "ACCOUNTING_MODE", group: "Accounting", requiredIn: ["production"], secret: false, serverOnly: true, public: false, description: "Accounting integration mode" },
  { name: "ACCOUNTING_ALLOW_LIVE_EXPORTS", group: "Accounting", requiredIn: ["production"], secret: false, serverOnly: true, public: false, description: "Master gate for live accounting exports" },
  { name: "QUICKBOOKS_CLIENT_SECRET", group: "QuickBooks", requiredIn: [], secret: true, serverOnly: true, public: false, description: "QuickBooks OAuth secret" },
  { name: "XERO_CLIENT_SECRET", group: "Xero", requiredIn: [], secret: true, serverOnly: true, public: false, description: "Xero OAuth secret" },
  { name: "CAMPAIGNS_ALLOW_LIVE_SENDS", group: "Campaigns", requiredIn: ["production"], secret: false, serverOnly: true, public: false, description: "Master gate for live campaign sends" },
  { name: "PUSH_ALLOW_LIVE_SENDS", group: "Mobile Push", requiredIn: ["production"], secret: false, serverOnly: true, public: false, description: "Master gate for live push sends" },
  { name: "LEAD_CAPTURE_API_TOKEN", group: "Marketing", requiredIn: ["staging", "production"], secret: true, serverOnly: true, public: false, description: "Public lead capture API bearer token" },
  { name: "GHL_INTEGRATION_MODE", group: "GoHighLevel", requiredIn: [], secret: false, serverOnly: true, public: false, description: "GoHighLevel integration mode" },
  { name: "GHL_READ_SYNC_ENABLED", group: "GoHighLevel", requiredIn: [], secret: false, serverOnly: true, public: false, description: "Master gate for read-only GoHighLevel sync" },
  { name: "GHL_ALLOW_WRITES", group: "GoHighLevel", requiredIn: ["staging", "production"], secret: false, serverOnly: true, public: false, description: "Future GoHighLevel write gate; production must remain false" },
  { name: "GHL_SYNC_APPOINTMENT_EVERY_MINUTES", group: "GoHighLevel", requiredIn: [], secret: false, serverOnly: true, public: false, description: "Read-only appointment polling cadence in minutes" },
  { name: "GHL_SYNC_OPPORTUNITY_EVERY_MINUTES", group: "GoHighLevel", requiredIn: [], secret: false, serverOnly: true, public: false, description: "Read-only opportunity polling cadence in minutes" },
  { name: "GHL_SYNC_CONTACT_EVERY_MINUTES", group: "GoHighLevel", requiredIn: [], secret: false, serverOnly: true, public: false, description: "Read-only contact polling cadence in minutes" },
  { name: "GHL_SYNC_CONVERSATION_EVERY_MINUTES", group: "GoHighLevel", requiredIn: [], secret: false, serverOnly: true, public: false, description: "Read-only conversation polling cadence in minutes" },
  { name: "GHL_SYNC_MESSAGE_EVERY_MINUTES", group: "GoHighLevel", requiredIn: [], secret: false, serverOnly: true, public: false, description: "Read-only message polling cadence in minutes" },
  { name: "GHL_SYNC_TRANSACTION_EVERY_MINUTES", group: "GoHighLevel", requiredIn: [], secret: false, serverOnly: true, public: false, description: "Read-only transaction polling cadence in minutes" },
  { name: "GHL_SYNC_ORDER_EVERY_MINUTES", group: "GoHighLevel", requiredIn: [], secret: false, serverOnly: true, public: false, description: "Read-only order polling cadence in minutes" },
  { name: "GHL_SYNC_CALENDAR_EVERY_MINUTES", group: "GoHighLevel", requiredIn: [], secret: false, serverOnly: true, public: false, description: "Read-only calendar polling cadence in minutes" },
  { name: "GHL_SYNC_USER_EVERY_MINUTES", group: "GoHighLevel", requiredIn: [], secret: false, serverOnly: true, public: false, description: "Read-only user polling cadence in minutes" },
  { name: "GHL_SYNC_CUSTOM_FIELD_EVERY_MINUTES", group: "GoHighLevel", requiredIn: [], secret: false, serverOnly: true, public: false, description: "Read-only custom-field polling cadence in minutes" },
  { name: "GHL_SYNC_TAG_EVERY_MINUTES", group: "GoHighLevel", requiredIn: [], secret: false, serverOnly: true, public: false, description: "Read-only tag polling cadence in minutes" },
  { name: "GHL_SYNC_PIPELINE_EVERY_MINUTES", group: "GoHighLevel", requiredIn: [], secret: false, serverOnly: true, public: false, description: "Read-only pipeline polling cadence in minutes" },
  { name: "GHL_DRIFT_RECONCILIATION_EVERY_MINUTES", group: "GoHighLevel", requiredIn: [], secret: false, serverOnly: true, public: false, description: "Broader read-only drift reconciliation cadence in minutes" },
  { name: "GHL_SYNC_APPOINTMENT_LOOKBACK_MINUTES", group: "GoHighLevel", requiredIn: [], secret: false, serverOnly: true, public: false, description: "Appointment polling lookback window in minutes" },
  { name: "GHL_SYNC_APPOINTMENT_LOOKAHEAD_MINUTES", group: "GoHighLevel", requiredIn: [], secret: false, serverOnly: true, public: false, description: "Appointment polling lookahead window in minutes" },
  { name: "GHL_INCREMENTAL_MAX_PAGES_PER_OBJECT", group: "GoHighLevel", requiredIn: [], secret: false, serverOnly: true, public: false, description: "Maximum pages per incremental object run before checkpointing" },
  { name: "GHL_MIAMI_PRIVATE_TOKEN", group: "GoHighLevel", requiredIn: ["production"], secret: true, serverOnly: true, public: false, description: "Server-only private integration token for Miami" },
  { name: "GHL_TAMPA_PRIVATE_TOKEN", group: "GoHighLevel", requiredIn: [], secret: true, serverOnly: true, public: false, description: "Server-only private integration token for Tampa" },
  { name: "GHL_JACKSONVILLE_PRIVATE_TOKEN", group: "GoHighLevel", requiredIn: [], secret: true, serverOnly: true, public: false, description: "Server-only private integration token for Jacksonville" },
  { name: "GHL_WEBHOOK_PUBLIC_KEY", group: "GoHighLevel", requiredIn: [], secret: false, serverOnly: true, public: false, description: "GoHighLevel X-GHL-Signature Ed25519 webhook verification public key" },
  { name: "GHL_WEBHOOK_LEGACY_PUBLIC_KEY", group: "GoHighLevel", requiredIn: [], secret: false, serverOnly: true, public: false, description: "Legacy HighLevel X-WH-Signature RSA webhook verification public key" },
  { name: "GHL_WEBHOOK_SECRET", group: "GoHighLevel", requiredIn: [], secret: true, serverOnly: true, public: false, description: "Legacy/local fallback webhook shared secret; never expose to the browser" },
  { name: "GHL_OAUTH_CLIENT_ID", group: "GoHighLevel", requiredIn: [], secret: false, serverOnly: true, public: false, description: "GoHighLevel Marketplace OAuth app client ID" },
  { name: "GHL_OAUTH_CLIENT_SECRET", group: "GoHighLevel", requiredIn: [], secret: true, serverOnly: true, public: false, description: "GoHighLevel Marketplace OAuth app client secret" },
  { name: "GHL_OAUTH_REDIRECT_URI", group: "GoHighLevel", requiredIn: [], secret: false, serverOnly: true, public: false, description: "Exact GoHighLevel OAuth redirect URI" },
  { name: "GHL_OAUTH_ENCRYPTION_KEY", group: "GoHighLevel", requiredIn: [], secret: true, serverOnly: true, public: false, description: "32-byte base64 or hex key for encrypted GoHighLevel OAuth token storage" }
];

export function getAppEnvironment(env: NodeJS.ProcessEnv = process.env): AppEnvironment {
  const explicit = env.APP_ENV?.toLowerCase();
  if (explicit && appEnvironments.has(explicit)) return explicit as AppEnvironment;
  if (env.NODE_ENV === "test") return "test";
  if (env.NODE_ENV === "production") return "production";
  return "development";
}

export function getAppVersion(env: NodeJS.ProcessEnv = process.env) {
  return env.APP_VERSION || env.VERCEL_GIT_COMMIT_SHA || env.NEXT_PUBLIC_APP_VERSION || "local";
}

export function isProductionLike(environment = getAppEnvironment()) {
  return environment === "production" || environment === "staging";
}

export type EnvironmentValidationResult = {
  environment: AppEnvironment;
  ok: boolean;
  missing: string[];
  publicSecretLeaks: string[];
  warnings: string[];
};

export function validateEnvironment(env: NodeJS.ProcessEnv = process.env): EnvironmentValidationResult {
  const environment = getAppEnvironment(env);
  const missing = envVarRules
    .filter((rule) => rule.requiredIn.includes(environment))
    .filter((rule) => !env[rule.name])
    .map((rule) => rule.name);
  const publicSecretLeaks = envVarRules
    .filter((rule) => rule.secret && rule.public)
    .map((rule) => rule.name);
  const warnings: string[] = [];

  if (environment === "production" && env.ALLOW_DEMO_SEED === "true") {
    warnings.push("ALLOW_DEMO_SEED must not be enabled in production.");
  }
  if ((environment === "production" || environment === "staging") && !env.APP_ENV) {
    warnings.push("APP_ENV must be set explicitly for staging and production.");
  }
  if (environment === "production" && env.GHL_ALLOW_WRITES !== "false") {
    warnings.push("GHL_ALLOW_WRITES must be false in production.");
  }
  if (environment === "production" && env.PAYMENTS_ALLOW_LIVE_CHARGES === "true" && env.PAYMENTS_MODE !== "production") {
    warnings.push("Live payment charges require PAYMENTS_MODE=production.");
  }
  if (environment === "production" && env.TELEPHONY_ALLOW_LIVE_CALLS === "true" && env.COMMUNICATIONS_MODE !== "production") {
    warnings.push("Live calls require COMMUNICATIONS_MODE=production.");
  }

  return {
    environment,
    ok: missing.length === 0 && publicSecretLeaks.length === 0 && !warnings.some((warning) => warning.includes("must not")),
    missing,
    publicSecretLeaks,
    warnings
  };
}

export function assertValidProductionEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const result = validateEnvironment(env);
  if (result.environment === "production" && !result.ok) {
    throw new Error(`Invalid production environment: ${result.missing.join(", ") || "configuration warning"}`);
  }
  return result;
}

export function envMatrixRows() {
  return envVarRules;
}
