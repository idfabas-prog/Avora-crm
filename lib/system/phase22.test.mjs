import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { assertGhlReadOnlyHttpRequest } from "../integrations/gohighlevel/client.ts";
import { describeSupabaseApiKey, supabaseProjectRefFromUrl } from "../supabase/env.ts";
import { getSystemHealthReport } from "./health-report.ts";
import {
  buildSystemIncident,
  deploymentDiagnostics,
  phase22SyncCadences,
  productionWriteGateStatus,
  safeShutdownState,
  schedulerLockClaimable,
  validatePhase22ProductionEnvironment,
  workerHealthStatus
} from "./operations.ts";
import { buildReadinessProbe } from "./production-readiness.ts";
import {
  configureWorkerMode,
  loadDotEnvLocal,
  stagingHeartbeatOnlyMode,
  workerUrl
} from "../../scripts/ghl-sync-worker.mjs";

test("Phase 22 exposes configurable default GHL polling cadences", () => {
  const schedule = phase22SyncCadences({ GHL_SYNC_APPOINTMENT_EVERY_MINUTES: "3" });
  assert.equal(schedule.find((item) => item.objectType === "appointment")?.everyMinutes, 3);
  assert.equal(schedule.find((item) => item.objectType === "drift_reconciliation")?.everyMinutes, 360);
});

test("Phase 22 detects stale and missing worker heartbeats", () => {
  const now = Date.now();
  assert.equal(workerHealthStatus({ lastHeartbeatAt: new Date(now - 30_000).toISOString() }, now), "healthy");
  assert.equal(workerHealthStatus({ lastHeartbeatAt: new Date(now - 3 * 60_000).toISOString() }, now), "warning");
  assert.equal(workerHealthStatus({ lastHeartbeatAt: new Date(now - 7 * 60_000).toISOString() }, now), "degraded");
  assert.equal(workerHealthStatus({ lastHeartbeatAt: null }, now), "down");
});

test("Phase 22 scheduler locks prevent duplicate workers until lease expiry", () => {
  const now = Date.now();
  const lock = { lockKey: "ghl:miami:appointment", workerId: "worker-a", leaseExpiresAt: new Date(now + 60_000).toISOString() };
  assert.equal(schedulerLockClaimable(lock, "worker-b", now), false);
  assert.equal(schedulerLockClaimable(lock, "worker-a", now), true);
  assert.equal(schedulerLockClaimable({ ...lock, leaseExpiresAt: new Date(now - 1).toISOString() }, "worker-b", now), true);
});

test("Phase 22 production validation requires explicit safe gates", () => {
  const result = validatePhase22ProductionEnvironment({
    APP_ENV: "production",
    APP_URL: "https://dev-dashboard.example",
    APP_VERSION: "test-sha",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    CRON_SECRET: "cron",
    PATIENT_PORTAL_URL: "https://portal.example",
    PAYMENTS_MODE: "development",
    PAYMENTS_ALLOW_LIVE_CHARGES: "false",
    STRIPE_WEBHOOK_SECRET: "whsec",
    COMMUNICATIONS_MODE: "development",
    COMMUNICATIONS_ALLOW_LIVE_SEND: "false",
    TELEPHONY_ALLOW_LIVE_CALLS: "false",
    AI_MODE: "mock",
    AI_LIVE_PROVIDER_ENABLED: "false",
    ACCOUNTING_MODE: "development",
    ACCOUNTING_ALLOW_LIVE_EXPORTS: "false",
    CAMPAIGNS_ALLOW_LIVE_SENDS: "false",
    PUSH_ALLOW_LIVE_SENDS: "false",
    LEAD_CAPTURE_API_TOKEN: "lead",
    GHL_MIAMI_PRIVATE_TOKEN: "ghl",
    GHL_ALLOW_WRITES: "false",
    ALLOW_DEMO_SEED: "false"
  });
  assert.equal(result.ok, true);
});

test("Phase 22 treats undefined GHL writes as blocked", () => {
  assert.equal(productionWriteGateStatus({}).safe, true);
  assert.equal(productionWriteGateStatus({ GHL_ALLOW_WRITES: "true" }).safe, false);
  assert.throws(() => assertGhlReadOnlyHttpRequest("PATCH", "/contacts/123"), /Blocked outbound GoHighLevel PATCH request/);
});

test("Phase 22 incident creation redacts sensitive metadata", () => {
  const incident = buildSystemIncident({
    incidentType: "ghl_token_invalid",
    severity: "SEV-2",
    source: "ghl_worker",
    message: "GHL returned 401 for Miami read-only sync.",
    metadata: { token: "secret", locationId: "Y4e3rWEXVyXCZmZaCs8d" }
  });
  assert.equal(incident.metadata_safe.token, "[redacted]");
  assert.equal(incident.metadata_safe.locationId, "Y4e3rWEXVyXCZmZaCs8d");
});

test("Phase 22 safe shutdown state stops claiming new work", () => {
  const state = safeShutdownState("SIGTERM", "job-1");
  assert.equal(state.acceptingNewWork, false);
  assert.equal(state.releaseStrategy, "finish-current-batch-or-allow-lease-expiry");
});

test("Phase 22 deployment diagnostics expose only boolean secret presence", () => {
  const diagnostics = deploymentDiagnostics({ APP_ENV: "staging", CRON_SECRET: "secret", GHL_MIAMI_PRIVATE_TOKEN: "token" });
  assert.equal(diagnostics.cronSecretPresent, true);
  assert.equal(diagnostics.ghlMiamiTokenPresent, true);
  assert.equal(Object.values(diagnostics).includes("secret"), false);
});

function fakeJwt(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.signature`;
}

test("Phase 22 classifies Supabase admin key formats without exposing key material", () => {
  const legacyServiceRole = describeSupabaseApiKey(fakeJwt({ iss: "supabase", ref: "staging-ref", role: "service_role" }));
  const legacyAnon = describeSupabaseApiKey(fakeJwt({ iss: "supabase", ref: "staging-ref", role: "anon" }));
  const secretKey = describeSupabaseApiKey("sb_secret_fake_safe_test_value");
  const publishableKey = describeSupabaseApiKey("sb_publishable_fake_safe_test_value");
  const invalid = describeSupabaseApiKey("not-a-supabase-admin-key");

  assert.equal(supabaseProjectRefFromUrl("https://staging-ref.supabase.co"), "staging-ref");
  assert.equal(legacyServiceRole.isServerAdminKey, true);
  assert.equal(legacyServiceRole.projectRef, "staging-ref");
  assert.equal(legacyAnon.isBrowserPublishableKey, true);
  assert.equal(legacyAnon.isServerAdminKey, false);
  assert.equal(secretKey.isServerAdminKey, true);
  assert.equal(secretKey.projectRef, null);
  assert.equal(publishableKey.isBrowserPublishableKey, true);
  assert.equal(publishableKey.isServerAdminKey, false);
  assert.equal(invalid.isServerAdminKey, false);
  assert.equal(invalid.isBrowserPublishableKey, false);
});

test("Phase 22 staging startup validates Supabase key types before launching workers", () => {
  const stagingRunner = readFileSync(new URL("../../scripts/run-staging.mjs", import.meta.url), "utf8");
  const syncRoute = readFileSync(new URL("../../app/api/integrations/gohighlevel/sync/route.ts", import.meta.url), "utf8");

  assert.match(stagingRunner, /SUPABASE_SERVICE_ROLE_KEY must be a Supabase Secret key beginning with sb_secret_/);
  assert.match(stagingRunner, /Staging Supabase diagnostics/);
  assert.match(stagingRunner, /serviceJwtMatchesUrl/);
  assert.match(syncRoute, /Supabase admin API key was rejected while recording the worker heartbeat/);
});

test("Phase 22 staging continuous worker enters heartbeat-only mode without a GHL provider", () => {
  const env = {
    APP_ENV: "staging",
    APP_URL: "https://staging.dev-dashboard.example",
    GHL_ALLOW_WRITES: "false",
    GHL_READ_SYNC_ENABLED: "false",
    GHL_MIAMI_PRIVATE_TOKEN: "",
    GHL_TAMPA_PRIVATE_TOKEN: "",
    GHL_JACKSONVILLE_PRIVATE_TOKEN: ""
  };

  const mode = configureWorkerMode({ continuous: true, env });
  const url = workerUrl(1, { env });

  assert.equal(stagingHeartbeatOnlyMode(env), true);
  assert.equal(mode.mode, "heartbeat-only");
  assert.equal(mode.heartbeatOnly, true);
  assert.equal(env.GHL_READ_SYNC_ENABLED, "false");
  assert.equal(env.GHL_WORKER_HEARTBEAT_ONLY, "true");
  assert.equal(url.searchParams.get("heartbeatOnly"), "1");
  assert.equal(url.searchParams.has("queueIncremental"), false);
});

test("Phase 22 production continuous worker read-sync behavior remains unchanged", () => {
  const env = {
    APP_ENV: "production",
    APP_URL: "https://dev-dashboard.example",
    GHL_ALLOW_WRITES: "false",
    GHL_READ_SYNC_ENABLED: "false",
    GHL_MIAMI_PRIVATE_TOKEN: "configured",
    GHL_TAMPA_PRIVATE_TOKEN: "",
    GHL_JACKSONVILLE_PRIVATE_TOKEN: ""
  };

  const mode = configureWorkerMode({ continuous: true, env });
  const url = workerUrl(1, { env });

  assert.equal(mode.mode, "continuous-sync");
  assert.equal(mode.heartbeatOnly, false);
  assert.equal(env.GHL_READ_SYNC_ENABLED, "true");
  assert.equal(env.GHL_WORKER_HEARTBEAT_ONLY, "false");
  assert.equal(url.searchParams.get("queueIncremental"), "1");
  assert.equal(url.searchParams.has("heartbeatOnly"), false);
});

test("Phase 22 staging worker refuses .env.local fallback even for blank staging values", () => {
  const env = {
    APP_ENV: "staging",
    GHL_MIAMI_PRIVATE_TOKEN: ""
  };

  assert.equal(loadDotEnvLocal(env), false);
  assert.equal(env.GHL_MIAMI_PRIVATE_TOKEN, "");
});

test("Phase 22 heartbeat-only sync endpoint records heartbeat without queueing GHL work", () => {
  const route = readFileSync(new URL("../../app/api/integrations/gohighlevel/sync/route.ts", import.meta.url), "utf8");

  assert.match(route, /heartbeatOnly/);
  assert.match(route, /recordGhlWorkerHeartbeat/);
  assert.match(route, /system_worker_heartbeats/);
  assert.match(route, /heartbeat_only_no_provider/);
  assert.match(route, /incrementalQueued:\s*0/);
  assert.match(route, /claimed:\s*0/);
  assert.match(route, /writesToGhl:\s*false/);
});

test("Phase 22 migration adds worker operations tables and RLS", () => {
  const migration = readFileSync(new URL("../../supabase/migrations/20260816030000_phase_22_production_operations.sql", import.meta.url), "utf8");
  assert.match(migration, /create table public\.system_worker_heartbeats/);
  assert.match(migration, /create table public\.system_scheduler_locks/);
  assert.match(migration, /claim_system_scheduler_lock/);
  assert.match(migration, /alter table public\.system_worker_heartbeats enable row level security/);
});

function stagingReadinessEnv() {
  return {
    APP_ENV: "staging",
    APP_URL: "https://staging.dev-dashboard.example",
    APP_VERSION: "phase22-test",
    NEXT_PUBLIC_SUPABASE_URL: "https://staging.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
    CRON_SECRET: "cron-secret",
    PATIENT_PORTAL_URL: "https://staging.dev-dashboard.example/portal",
    STRIPE_WEBHOOK_SECRET: "stripe-webhook-secret",
    LEAD_CAPTURE_API_TOKEN: "lead-token-secret",
    GHL_ALLOW_WRITES: "false",
    ALLOW_DEMO_SEED: "false",
    GHL_MIAMI_PRIVATE_TOKEN: ""
  };
}

test("Phase 22 readiness probe succeeds without user authentication and exposes only safe status", () => {
  const readiness = buildReadinessProbe("ok", stagingReadinessEnv());
  const body = JSON.stringify(readiness.payload);

  assert.equal(readiness.statusCode, 200);
  assert.equal(readiness.payload.ok, true);
  assert.equal(readiness.payload.environment, "staging");
  assert.equal(readiness.payload.checks.database, true);
  assert.equal(readiness.payload.checks.ghlWritesAllowed, false);
  assert.equal(readiness.payload.checks.demoSeedAllowed, false);
  assert.doesNotMatch(body, /service-role-secret|cron-secret|stripe-webhook-secret|lead-token-secret/);
});

test("Phase 22 readiness probe fails when the database dependency is unavailable", () => {
  const readiness = buildReadinessProbe("unavailable", stagingReadinessEnv());

  assert.equal(readiness.statusCode, 503);
  assert.equal(readiness.payload.ok, false);
  assert.equal(readiness.payload.checks.database, false);
});

test("Phase 22 health and readiness endpoints are explicitly unauthenticated probes", () => {
  const healthRoute = readFileSync(new URL("../../app/api/health/route.ts", import.meta.url), "utf8");
  const readyRoute = readFileSync(new URL("../../app/api/ready/route.ts", import.meta.url), "utf8");
  const proxy = readFileSync(new URL("../../proxy.ts", import.meta.url), "utf8");
  const smoke = readFileSync(new URL("../../scripts/production-smoke-test.mjs", import.meta.url), "utf8");

  assert.doesNotMatch(healthRoute, /requireInternalRequest|requireCurrentProfile/);
  assert.doesNotMatch(readyRoute, /requireInternalRequest|requireCurrentProfile/);
  assert.match(proxy, /api\/health/);
  assert.match(proxy, /api\/ready/);
  assert.match(smoke, /check\("readiness endpoint", "\/api\/ready"\)/);
  assert.doesNotMatch(smoke, /check\("readiness endpoint", "\/api\/ready", \{ internal: true \}\)/);
});

test("Phase 22 protected UI routes still require profile authorization", () => {
  const dashboard = readFileSync(new URL("../../app/(crm)/dashboard/page.tsx", import.meta.url), "utf8");
  const calendar = readFileSync(new URL("../../app/(crm)/calendar/page.tsx", import.meta.url), "utf8");
  const systemHealth = readFileSync(new URL("../../app/(crm)/settings/system/health/page.tsx", import.meta.url), "utf8");

  assert.match(dashboard, /requireCurrentProfile/);
  assert.match(calendar, /requireCurrentProfile/);
  assert.match(systemHealth, /requireCurrentProfile/);
  assert.match(systemHealth, /assertSystemAccess/);
});

class FakeQuery {
  constructor(client, table, columns, options) {
    this.client = client;
    this.table = table;
    this.columns = columns;
    this.options = options ?? {};
    this.filters = [];
    this.orders = [];
    this.limits = [];
    this.client.calls.push(this);
  }

  eq(column, value) {
    this.filters.push({ method: "eq", column, value });
    return this;
  }

  in(column, value) {
    this.filters.push({ method: "in", column, value });
    return this;
  }

  order(column, options) {
    this.orders.push({ column, options });
    return this;
  }

  limit(value) {
    this.limits.push(value);
    return this;
  }

  then(resolve) {
    const error = this.client.errors[this.table] ?? null;
    const rows = this.client.rows[this.table] ?? [];
    const count = this.client.counts[this.table] ?? rows.length;
    return Promise.resolve(resolve({
      data: this.options.head ? null : rows,
      count: this.options.count ? count : null,
      error
    }));
  }
}

class FakeSupabase {
  constructor({ rows = {}, errors = {}, counts = {} } = {}) {
    this.rows = rows;
    this.errors = errors;
    this.counts = counts;
    this.calls = [];
  }

  from(table) {
    return {
      select: (columns, options) => new FakeQuery(this, table, columns, options)
    };
  }
}

const healthProfile = {
  organizationId: "org-staging",
  locations: [{ id: "loc-miami", name: "Miami Staging", slug: "miami" }]
};

function baseHealthRows(overrides = {}) {
  return {
    organizations: [{ id: "org-staging" }],
    system_health_checks: [],
    system_incidents: [],
    system_worker_heartbeats: [],
    system_scheduler_locks: [],
    system_smoke_test_runs: [],
    system_deployment_events: [],
    ghl_connections: [],
    ghl_sync_runs: [],
    ghl_sync_jobs: [],
    ghl_sync_exceptions: [],
    ghl_sync_cursors: [],
    ...overrides
  };
}

test("Phase 22 health report checks database connectivity separately from optional sync diagnostics", async () => {
  const supabase = new FakeSupabase({
    rows: baseHealthRows(),
    errors: {
      ghl_sync_jobs: { code: "42703", message: "column ghl_sync_jobs.optional_diagnostic does not exist" }
    }
  });

  const report = await getSystemHealthReport(healthProfile, supabase, { APP_ENV: "staging", GHL_ALLOW_WRITES: "false" });

  assert.equal(report.database.reachable, true);
  assert.deepEqual(report.database.connectivityErrors, []);
  assert.deepEqual(report.database.schemaErrors, []);
  assert.match(report.sync.errors.join("\n"), /optional_diagnostic/);
});

test("Phase 22 health report queries GHL cursors through connection_id, not organization_id", async () => {
  const supabase = new FakeSupabase({
    rows: baseHealthRows({
      ghl_connections: [{
        id: "conn-staging",
        organization_id: "org-staging",
        location_id: "loc-miami",
        display_name: "Miami Staging GHL",
        ghl_location_id: "staging-ghl-location"
      }],
      ghl_sync_cursors: [{ connection_id: "conn-staging", object_type: "appointment", last_sync_completed_at: "2026-08-17T12:00:00.000Z" }]
    })
  });

  const report = await getSystemHealthReport(healthProfile, supabase, { APP_ENV: "staging", GHL_ALLOW_WRITES: "false" });
  const cursorCall = supabase.calls.find((call) => call.table === "ghl_sync_cursors");

  assert.equal(report.database.reachable, true);
  assert.equal(report.ghl.miamiLocationId, "staging-ghl-location");
  assert.ok(cursorCall);
  assert.equal(cursorCall.filters.some((filter) => filter.column === "organization_id"), false);
  assert.deepEqual(cursorCall.filters.find((filter) => filter.column === "connection_id"), { method: "in", column: "connection_id", value: ["conn-staging"] });
  assert.equal(cursorCall.orders[0]?.column, "last_sync_completed_at");
});

test("Phase 22 staging health report does not expose the production Miami GHL location without a configured connection", async () => {
  const supabase = new FakeSupabase({ rows: baseHealthRows() });

  const report = await getSystemHealthReport(healthProfile, supabase, {
    APP_ENV: "staging",
    GHL_ALLOW_WRITES: "false",
    GHL_MIAMI_PRIVATE_TOKEN: ""
  });

  assert.equal(report.database.reachable, true);
  assert.equal(report.ghl.connection, null);
  assert.equal(report.ghl.miamiLocationId, null);
  assert.equal(report.ghl.tokenPresent, false);
});
