import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { credentialDiagnosticForConnection, isMockGhlConnection, tokenPresentForConnection } from "./auth.ts";
import { assertGhlWritesBlocked, credentialEnvKeyForLocationSlug, getGhlIntegrationMode, ghlReadSyncEnabled } from "./config.ts";
import { GhlIntegrationError, safeGhlError } from "./errors.ts";
import { hasGhlPermission, ghlLocationAllowed } from "./permissions.ts";
import { normalizeContact, normalizeMessage, mapAppointmentStatus, normalizeAppointment, rawAppointmentStatus } from "./normalization.ts";
import { parsePagedResponse } from "./pagination.ts";
import { assertGhlResponse, retryDelayMs, shouldRetryStatus } from "./rate-limit.ts";
import { chooseDefaultGhlCalendarConnection, getGhlCalendarReport, isRealGhlConnectionForMapping } from "./reports.ts";
import { GHL_SUPPORTED_WEBHOOK_EVENTS, hashWebhookPayload, normalizeWebhookEvent, verifyWebhookSignature } from "./webhooks.ts";
import { assertNoGhlWrite } from "./sync.ts";
import { GHL_READ_REQUEST_TIMEOUT_MS, GhlReadOnlyClient, assertGhlReadOnlyHttpRequest } from "./client.ts";
import { rawStatusBucket, planAppointmentStatusBackfill, previewAppointmentStatusBackfillPlan, summarizeAppointmentStatusBackfill } from "./appointment-status-backfill.ts";
import {
  EXPLICIT_GHL_CALENDAR_TYPE_NAME_MAPPINGS,
  GHL_CALENDAR_TYPE_BACKFILL_CONFIRMATION,
  buildGhlCalendarTypeBackfillPlan,
  explicitAppointmentTypeNameForGhlCalendar,
  validateCalendarTypeBackfillRequest
} from "./calendar-type-mapping.ts";
import {
  GHL_MIAMI_EXPECTED_LOCATION_ID,
  GHL_OAUTH_AUTHORIZE_URL,
  GHL_OAUTH_LOCATION_INFO_URL,
  GHL_OAUTH_SCOPES,
  GHL_OAUTH_TOKEN_URL,
  buildGhlOAuthInstallUrl,
  consumeGhlOAuthState,
  decryptGhlOAuthSecret,
  encryptGhlOAuthSecret,
  exchangeGhlOAuthCode,
  fetchGhlOAuthLocationInfo,
  hashOAuthState,
  ghlOAuthRefreshConfigurationPresent,
  refreshDueGhlOAuthInstallations,
  refreshGhlOAuthToken
} from "./oauth.ts";
import {
  APPOINTMENT_STATUS_BACKFILL_CONFIRMATION,
  normalizeAppointmentStatusBackfillConfirmation,
  validateAppointmentStatusBackfillRequest
} from "./appointment-status-backfill-request.ts";
import {
  FULL_IMPORT_APPOINTMENT_CALENDAR_BATCH_SIZE,
  FULL_IMPORT_MAX_ATTEMPTS,
  FULL_IMPORT_OBJECT_ORDER,
  FULL_IMPORT_PAGE_SIZE,
  FULL_IMPORT_HEARTBEAT_MS,
  FULL_IMPORT_STALE_LOCK_MS,
  GHL_INCREMENTAL_RECONCILIATION_SCHEDULE,
  GHL_DRIFT_RECONCILIATION_EVERY_MINUTES,
  GHL_INCREMENTAL_APPOINTMENT_LOOKAHEAD_MINUTES,
  GHL_INCREMENTAL_APPOINTMENT_LOOKBACK_MINUTES,
  GHL_INCREMENTAL_MAX_PAGES_PER_OBJECT,
  RESUMABLE_FULL_IMPORT_STATUSES,
  claimNextJob,
  fullImportObjectEnabled,
  fullImportProgressPercent,
  fullImportRecordBatchCount,
  getGhlDriftReconciliationEveryMinutes,
  getGhlIncrementalSchedule,
  normalizeOpportunityJobPageToken,
  fullImportRunLooksIncomplete,
  nextFullImportPageToken,
  processGhlSyncJobs,
  queueDueGhlIncrementalReconciliation,
  resumePageTokenFromRun
} from "./importer.ts";

const miamiConnection = {
  id: "f6e55be9-3fa3-4648-89bf-22aceeadf905",
  organization_id: "org-avora",
  location_id: "10000000-0000-4000-8000-000000000101",
  display_name: "Miam GHL",
  ghl_location_id: "Y4e3rWEXVyXCZmZaCs8d",
  credential_env_key: "GHL_MIAMI_PRIVATE_TOKEN",
  connection_type: "private_integration",
  status: "healthy",
  sync_mode: "development",
  token_present: true
};

async function captureGhlRequest(run) {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: new URL(String(url)), init });
    return new Response(JSON.stringify({ customFields: [], pipelines: [], opportunities: [], total: 0 }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  try {
    await run();
    return requests;
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function captureRejectedGhlRequest(run) {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: new URL(String(url)), init });
    return new Response(JSON.stringify({ opportunities: [], total: 0 }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
  return requests;
}

function stateSupabase(row) {
  const updates = [];
  return {
    updates,
    from(table) {
      assert.equal(table, "ghl_oauth_states");
      return {
        select() { return this; },
        eq() { return this; },
        is() { return this; },
        async maybeSingle() { return { data: row, error: null }; },
        update(payload) {
          updates.push(payload);
          return this;
        }
      };
    }
  };
}

function oauthEnv(overrides = {}) {
  return {
    GHL_OAUTH_CLIENT_ID: "client_123",
    GHL_OAUTH_CLIENT_SECRET: "secret_123",
    GHL_OAUTH_REDIRECT_URI: "http://localhost:3000/api/integrations/gohighlevel/oauth/callback",
    GHL_OAUTH_ENCRYPTION_KEY: Buffer.from("0123456789abcdef0123456789abcdef").toString("base64"),
    ...overrides
  };
}

function calendarBackfillSupabase({ typeMappings, appointmentMappings, appointments }) {
  return {
    from(table) {
      const state = { from: null, to: null };
      const builder = {
        _payload: null,
        select() {
          if (table === "ghl_calendar_type_mappings") this._payload = { data: typeMappings, error: null };
          if (table === "external_record_mappings") this._payload = { data: appointmentMappings, error: null };
          if (table === "appointments") this._payload = { data: appointments, error: null };
          return this;
        },
        eq() { return this; },
        in() { return this; },
        limit() { return this; },
        range(from, to) {
          state.from = from;
          state.to = to;
          return this;
        },
        then(resolve) {
          const payload = this._payload ?? { data: [], error: null };
          if (Array.isArray(payload.data) && state.from !== null && state.to !== null) {
            resolve({ data: payload.data.slice(state.from, state.to + 1), error: payload.error });
            return;
          }
          resolve(payload);
        }
      };
      return builder;
    }
  };
}

function calendarReportSupabase(options = {}) {
  const appointmentOne = "11111111-1111-4111-8111-111111111111";
  const appointmentTwo = "22222222-2222-4222-8222-222222222222";
  const miamiConnectionId = miamiConnection.id;
  const calendarExternalObjectType = options.calendarExternalObjectType ?? "calendar";
  const calendarInternalObjectType = options.calendarInternalObjectType ?? "ghl_calendar_mirror";
  const derivedAppointmentMappings = Array.from({ length: 13 }, (_, index) => ({
    id: `derived-appt-map-${index + 1}`,
    connection_id: miamiConnectionId,
    external_object_type: "appointment",
    internal_object_type: "appointments",
    external_id: `derived-appt-${index + 1}`,
    internal_id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    metadata_safe: { calendar_id: `real-calendar-${index + 1}` }
  }));
  if (options.includeMalformedAppointmentMappings) {
    derivedAppointmentMappings.push(
      {
        id: "derived-appt-map-null-calendar",
        connection_id: miamiConnectionId,
        external_object_type: "appointment",
        internal_object_type: "appointments",
        external_id: "derived-appt-null-calendar",
        internal_id: "00000000-0000-4000-8000-000000000099",
        metadata_safe: { calendar_id: null }
      },
      {
        id: "derived-appt-map-bad-metadata",
        connection_id: miamiConnectionId,
        external_object_type: "appointment",
        internal_object_type: "appointments",
        external_id: "derived-appt-bad-metadata",
        internal_id: "00000000-0000-4000-8000-000000000100",
        metadata_safe: "not-an-object"
      },
      {
        id: "derived-appt-map-invalid-calendar",
        connection_id: miamiConnectionId,
        external_object_type: "appointment",
        internal_object_type: "appointments",
        external_id: "derived-appt-invalid-calendar",
        internal_id: "not-a-uuid",
        metadata_safe: { calendar_id: "bad\u0000calendar" }
      }
    );
  }
  const realCalendars = Array.from({ length: 13 }, (_, index) => ({
    id: `real-calendar-map-${index + 1}`,
    connection_id: miamiConnectionId,
    external_object_type: calendarExternalObjectType,
    internal_object_type: calendarInternalObjectType,
    external_id: `real-calendar-${index + 1}`,
    internal_id: miamiConnectionId,
    metadata_safe: { calendar_name: `Real Miami Calendar ${index + 1}` },
    ghl_connections: { display_name: "Miam GHL", ghl_location_id: "Y4e3rWEXVyXCZmZaCs8d" },
    locations: { name: "Miami" }
  }));
  const appointmentMappings = options.deriveCalendarsFromAppointments ? derivedAppointmentMappings : [
    { id: "real-appt-map-1", connection_id: miamiConnectionId, external_object_type: "appointment", internal_object_type: "appointments", external_id: "real-appt-1", internal_id: appointmentOne, metadata_safe: { calendar_id: "real-calendar-1" } },
    { id: "real-appt-map-2", connection_id: miamiConnectionId, external_object_type: "appointment", internal_object_type: "appointments", external_id: "real-appt-2", internal_id: appointmentTwo, metadata_safe: { calendar_id: "real-calendar-2" } },
    { id: "mock-appt-map", connection_id: "conn-mock", external_object_type: "appointment", internal_object_type: "appointments", external_id: "mock-appt", internal_id: "33333333-3333-4333-8333-333333333333", metadata_safe: { calendar_id: "ghl_calendar_miami" } }
  ];
  const rows = {
    ghl_connections: [
      { ...miamiConnection, locations: { name: "Miami", slug: "miami" } },
      { id: "conn-mock", organization_id: "org-avora", location_id: "10000000-0000-4000-8000-000000000101", display_name: "Miami Mock GoHighLevel", ghl_location_id: "ghl_mock_miami", connection_type: "mock", status: "healthy", sync_mode: "development", token_present: false, locations: { name: "Miami", slug: "miami" } },
      { id: "conn-tampa-mock", organization_id: "org-avora", location_id: "loc-tampa", display_name: "Tampa Mock GoHighLevel", ghl_location_id: "ghl_mock_tampa", connection_type: "mock", status: "warning", sync_mode: "development", token_present: false, locations: { name: "Tampa", slug: "tampa" } },
      { id: "conn-jacksonville-mock", organization_id: "org-avora", location_id: "loc-jacksonville", display_name: "Jacksonville Mock GoHighLevel", ghl_location_id: "ghl_mock_jacksonville", connection_type: "mock", status: "disabled", sync_mode: "development", token_present: false, locations: { name: "Jacksonville", slug: "jacksonville" } }
    ],
    calendarMappings: [
      ...(options.omitRealCalendarMappings ? [] : realCalendars),
      { id: "mock-calendar-map", connection_id: "conn-mock", external_object_type: "calendar", internal_object_type: "location_calendar", external_id: "ghl_calendar_miami", internal_id: "conn-mock", metadata_safe: { calendar_name: "Miami Mock GoHighLevel - Miami" }, ghl_connections: { display_name: "Miami Mock GoHighLevel", ghl_location_id: "ghl_mock_miami" }, locations: { name: "Miami" } }
    ],
    appointmentMappings,
    typeMappings: [{ connection_id: miamiConnectionId, external_calendar_id: "real-calendar-1", appointment_type_id: "type-consult" }],
    appointmentTypes: [{ id: "type-consult", name: "Hair Restoration Consultation", duration_minutes: 60 }],
    appointments: [
      { id: appointmentOne, appointment_type_id: "type-consult", provider_id: "provider-1", location_id: "10000000-0000-4000-8000-000000000101", start_at: "2026-08-20T14:00:00.000Z", end_at: "2026-08-20T15:00:00.000Z" },
      { id: appointmentTwo, appointment_type_id: "generic-type", provider_id: null, location_id: "10000000-0000-4000-8000-000000000101", start_at: "2026-08-20T16:00:00.000Z", end_at: "2026-08-20T17:00:00.000Z" }
    ]
  };

  return {
    from(table) {
      const state = { table, eq: {}, in: {}, from: null, to: null };
      const builder = {
        select() { return this; },
        eq(column, value) {
          state.eq[column] = value;
          return this;
        },
        in(column, value) {
          state.in[column] = value;
          return this;
        },
        order() { return this; },
        limit() { return this; },
        range(from, to) {
          state.from = from;
          state.to = to;
          return this;
        },
        then(resolve) {
          let data = [];
          if (table === "ghl_connections") data = rows.ghl_connections;
          else if (table === "external_record_mappings" && state.in.external_object_type) data = rows.calendarMappings.filter((row) => state.in.connection_id.includes(row.connection_id) && state.in.external_object_type.includes(row.external_object_type));
          else if (table === "external_record_mappings" && state.eq.internal_object_type === "ghl_calendar_mirror") data = rows.calendarMappings.filter((row) => state.in.connection_id.includes(row.connection_id) && row.internal_object_type === "ghl_calendar_mirror");
          else if (table === "external_record_mappings" && state.eq.external_object_type === "appointment") data = rows.appointmentMappings.filter((row) => state.in.connection_id.includes(row.connection_id));
          else if (table === "external_record_mappings") data = [...rows.calendarMappings, ...rows.appointmentMappings].filter((row) => state.in.connection_id.includes(row.connection_id));
          else if (table === "ghl_calendar_type_mappings") data = rows.typeMappings.filter((row) => state.in.connection_id.includes(row.connection_id));
          else if (table === "appointment_types") data = rows.appointmentTypes;
          else if (table === "appointments") data = rows.appointments.filter((row) => state.in.id.includes(row.id));
          if (state.from !== null && state.to !== null) data = data.slice(state.from, state.to + 1);
          resolve({ data, error: null });
        }
      };
      return builder;
    }
  };
}

test("GHL environment defaults stay development/read-only safe", () => {
  assert.equal(getGhlIntegrationMode({}), "development");
  assert.equal(ghlReadSyncEnabled({ GHL_INTEGRATION_MODE: "development" }), true);
  assert.equal(ghlReadSyncEnabled({ GHL_INTEGRATION_MODE: "read_only", GHL_READ_SYNC_ENABLED: "false" }), false);
  assert.equal(credentialEnvKeyForLocationSlug("miami"), "GHL_MIAMI_PRIVATE_TOKEN");
});

test("credential diagnostics report server token presence without exposing token", () => {
  const connection = { credential_env_key: "GHL_MIAMI_PRIVATE_TOKEN", connection_type: "private_integration", ghl_location_id: "Y4e3rWEXVyXCZmZaCs8d" };
  const diagnostic = credentialDiagnosticForConnection(connection, { GHL_MIAMI_PRIVATE_TOKEN: "secret-token" });
  assert.deepEqual(diagnostic, {
    credentialKey: "GHL_MIAMI_PRIVATE_TOKEN",
    tokenPresent: true,
    blockedReason: null
  });
  assert.equal(tokenPresentForConnection(connection, { GHL_MIAMI_PRIVATE_TOKEN: "secret-token" }), true);
  assert.equal(tokenPresentForConnection(connection, {}), false);
  assert.equal(isMockGhlConnection({ connection_type: "mock", ghl_location_id: "ghl_mock_miami" }), true);
  assert.equal(isMockGhlConnection({ connection_type: "mock", ghl_location_id: "Y4e3rWEXVyXCZmZaCs8d" }), false);
  assert.deepEqual(credentialDiagnosticForConnection({ credential_env_key: "GHL_MIAMI_PRIVATE_TOKEN", connection_type: "mock", ghl_location_id: "ghl_mock_miami" }, { GHL_MIAMI_PRIVATE_TOKEN: "secret-token" }), {
    credentialKey: "GHL_MIAMI_PRIVATE_TOKEN",
    tokenPresent: false,
    blockedReason: "mock_connection_credential_ignored"
  });
  assert.deepEqual(credentialDiagnosticForConnection({ credential_env_key: "GHL_MIAMI_PRIVATE_TOKEN", connection_type: "mock", ghl_location_id: "Y4e3rWEXVyXCZmZaCs8d" }, { GHL_MIAMI_PRIVATE_TOKEN: "secret-token" }), {
    credentialKey: "GHL_MIAMI_PRIVATE_TOKEN",
    tokenPresent: true,
    blockedReason: null
  });
  const unsafePublicKey = ["NEXT", "PUBLIC", "GHL", "TOKEN"].join("_");
  assert.deepEqual(credentialDiagnosticForConnection({ credential_env_key: unsafePublicKey, connection_type: "private_integration", ghl_location_id: "Y4e3rWEXVyXCZmZaCs8d" }, { [unsafePublicKey]: "unsafe" }), {
    credentialKey: null,
    tokenPresent: false,
    blockedReason: "public_env_key_rejected"
  });
});

test("write gate blocks outbound mutations in Phase 21", () => {
  assert.throws(() => assertGhlWritesBlocked({ GHL_ALLOW_WRITES: "false" }), /GHL writes disabled/);
  assert.throws(() => assertNoGhlWrite("createAppointment"), (error) => error instanceof GhlIntegrationError && error.code === "writes_disabled");
  assert.doesNotThrow(() => assertGhlReadOnlyHttpRequest("GET", "/calendars/events"));
  assert.doesNotThrow(() => assertGhlReadOnlyHttpRequest("POST", "/contacts/search"));
  assert.throws(() => assertGhlReadOnlyHttpRequest("POST", "/opportunities"), (error) => error instanceof GhlIntegrationError && error.code === "writes_disabled");
  assert.throws(() => assertGhlReadOnlyHttpRequest("PATCH", "/contacts/abc"), (error) => error instanceof GhlIntegrationError && error.code === "writes_disabled");
});

test("normalizes contacts without fuzzy name matching", () => {
  const contact = normalizeContact({ id: "ghl-1", firstName: " Ava ", lastName: " Demo ", email: "AVA@EXAMPLE.COM ", phone: "(305) 555-0100", source: "GHL" });
  assert.equal(contact.first_name, "Ava");
  assert.equal(contact.last_name, "Demo");
  assert.equal(contact.email, "ava@example.com");
  assert.equal(contact.phone, "+13055550100");
  assert.equal(contact.lead_source, "GHL");
  assert.ok(contact.checksum.length > 20);
});

test("normalizes partial and messy contacts without rejecting valid imports", () => {
  const missingEmail = normalizeContact({ id: "ghl-2", firstName: "Phone", lastName: "Only", phone: "3055550102", source: { label: "Bad Source Object" }, updatedAt: "not-a-date" });
  assert.equal(missingEmail.email, null);
  assert.equal(missingEmail.phone, "+13055550102");
  assert.equal(missingEmail.lead_source, "GoHighLevel");
  assert.equal(missingEmail.external_updated_at, null);

  const missingPhone = normalizeContact({ id: "ghl-3", firstName: null, lastName: null, email: "EMAILONLY@example.com", phone: { value: "bad object" }, dateAdded: "2026-08-14T15:30:00Z" });
  assert.equal(missingPhone.first_name, "Unknown");
  assert.equal(missingPhone.last_name, "Contact");
  assert.equal(missingPhone.email, "emailonly@example.com");
  assert.equal(missingPhone.phone, null);
  assert.equal(missingPhone.external_updated_at, "2026-08-14T15:30:00.000Z");
});

test("maps appointment statuses and preserves unknown raw status", () => {
  assert.deepEqual(mapAppointmentStatus("confirmed"), { status: "scheduled", needsReview: false, raw: "confirmed", rawField: null });
  assert.deepEqual(mapAppointmentStatus("active"), { status: "scheduled", needsReview: false, raw: "active", rawField: null });
  assert.deepEqual(mapAppointmentStatus("invalid"), { status: "cancelled", needsReview: false, raw: "invalid", rawField: null });
  assert.deepEqual(mapAppointmentStatus("strange-provider-status"), { status: "review_required", needsReview: true, raw: "strange-provider-status", rawField: null });
  assert.deepEqual(mapAppointmentStatus(null), { status: "review_required", needsReview: true, raw: null, rawField: null });
  assert.deepEqual(rawAppointmentStatus({ id: "a1", startTime: "2026-08-20T14:00:00-04:00", endTime: "2026-08-20T15:00:00-04:00", appointmentStatus: "confirmed", status: "unknown" }), { value: "confirmed", field: "appointmentStatus" });
  const appointment = normalizeAppointment({ id: "a1", startTime: "2026-08-20T14:00:00-04:00", endTime: "2026-08-20T15:00:00-04:00", appointmentStatus: "no-show", timezone: "America/New_York" });
  assert.equal(appointment.start_at, "2026-08-20T18:00:00.000Z");
  assert.equal(appointment.status, "no_show");
  assert.equal(appointment.raw_status, "no-show");
  assert.equal(appointment.raw_status_field, "appointmentStatus");
});

test("GHL appointment importer preserves raw appointmentStatus metadata", () => {
  const importer = readFileSync(new URL("./importer.ts", import.meta.url), "utf8");
  assert.match(importer, /raw_status_field/);
  assert.match(importer, /status_requires_review/);
  assert.doesNotMatch(importer, /was mapped to scheduled/);
});

test("appointment status backfill dry run groups raw statuses and proposed changes without writes", () => {
  assert.equal(rawStatusBucket(null), "null");
  assert.equal(rawStatusBucket("   "), "blank");
  assert.equal(rawStatusBucket("No-Show"), "no-show");
  assert.equal(rawStatusBucket("mystery"), "other/unrecognized");

  const report = summarizeAppointmentStatusBackfill({
    connection: { id: "conn-miami", ghl_location_id: "Y4e3rWEXVyXCZmZaCs8d" },
    mappings: [
      { external_id: "apt-1", internal_id: "appt-internal-1", metadata_safe: { calendar_id: "cal-1" } },
      { external_id: "apt-2", internal_id: "appt-internal-2", metadata_safe: { calendar_id: "cal-1" } },
      { external_id: "apt-3", internal_id: "appt-internal-3", metadata_safe: { calendar_id: "cal-2" } },
      { external_id: "apt-4", internal_id: "appt-internal-4", metadata_safe: { calendar_id: "cal-2" } }
    ],
    appointments: [
      { id: "appt-internal-1", status: "scheduled" },
      { id: "appt-internal-2", status: "scheduled" },
      { id: "appt-internal-3", status: "scheduled" },
      { id: "appt-internal-4", status: "scheduled" }
    ],
    providerAppointments: [
      { id: "apt-1", appointmentStatus: "confirmed", status: "ignored", startTime: "2026-08-20T14:00:00Z", endTime: "2026-08-20T15:00:00Z" },
      { id: "apt-2", appointmentStatus: "completed", startTime: "2026-08-20T15:00:00Z", endTime: "2026-08-20T16:00:00Z" },
      { id: "apt-3", appointmentStatus: "invalid", startTime: "2026-08-20T16:00:00Z", endTime: "2026-08-20T17:00:00Z" },
      { id: "apt-4", appointmentStatus: "", status: "", startTime: "2026-08-20T17:00:00Z", endTime: "2026-08-20T18:00:00Z" }
    ],
    providerPagesFetched: 2,
    calendarsChecked: 2
  });

  assert.equal(report.mappingsRead, 4);
  assert.equal(report.rawStatusBreakdown.confirmed, 1);
  assert.equal(report.rawStatusBreakdown.completed, 1);
  assert.equal(report.rawStatusBreakdown.invalid, 1);
  assert.equal(report.rawStatusBreakdown.null, 1);
  assert.equal(report.proposedNormalizedBreakdown.scheduled, 1);
  assert.equal(report.proposedNormalizedBreakdown.completed, 1);
  assert.equal(report.proposedNormalizedBreakdown.cancelled, 1);
  assert.equal(report.proposedNormalizedBreakdown.review_required, 1);
  assert.equal(report.wouldChangeCount, 3);
  assert.equal(report.unresolvedCount, 1);
  assert.equal(report.normalizedBusinessRecordsWritten, false);
  assert.equal(report.ghlWritesPerformed, false);

  const plan = planAppointmentStatusBackfill({
    connection: { id: "conn-miami", ghl_location_id: "Y4e3rWEXVyXCZmZaCs8d" },
    mappings: [
      { id: "map-1", external_id: "apt-1", internal_id: "appt-internal-1", metadata_safe: { calendar_id: "cal-1" } },
      { id: "map-2", external_id: "apt-2", internal_id: "appt-internal-2", metadata_safe: { calendar_id: "cal-1" } }
    ],
    appointments: [
      { id: "appt-internal-1", status: "scheduled" },
      { id: "appt-internal-2", status: "scheduled" }
    ],
    providerAppointments: [
      { id: "apt-1", appointmentStatus: "confirmed", startTime: "2026-08-20T14:00:00Z", endTime: "2026-08-20T15:00:00Z" },
      { id: "apt-2", appointmentStatus: "showed", startTime: "2026-08-20T15:00:00Z", endTime: "2026-08-20T16:00:00Z" }
    ],
    providerPagesFetched: 1,
    calendarsChecked: 1
  });
  assert.equal(plan.metadataUpdates.length, 2);
  assert.equal(plan.statusChanges.length, 1);
  assert.equal(plan.statusChanges[0].toStatus, "completed");
  assert.equal(plan.metadataUpdates[0].metadata.raw_status, "confirmed");
  assert.equal(plan.metadataUpdates[0].metadata.raw_status_field, "appointmentStatus");
  assert.equal(plan.metadataUpdates[1].metadata.normalized_status, "completed");
});

test("normalizes message idempotency fields and unknown channels", () => {
  const message = normalizeMessage({ id: "msg-1", conversationId: "conv-1", direction: "inbound", channel: "ProviderX", body: "Hello", timestamp: "2026-08-14T12:00:00Z" });
  assert.equal(message.provider_message_id, "msg-1");
  assert.equal(message.direction, "inbound");
  assert.equal(message.channel, "external");
  assert.equal(normalizeMessage({ id: "msg-2", conversationId: "conv-1", dateAdded: "2026-08-20T15:00:00.000Z" }).created_at, "2026-08-20T15:00:00.000Z");
});

test("parses cursor/page-token pagination shapes", () => {
  const page = parsePagedResponse({ contacts: [{ id: 1 }], nextPageToken: "abc" }, ["contacts"], { httpStatus: 200, endpoint: "/contacts/search", apiVersion: "v3", requestMethod: "POST" });
  assert.deepEqual(page.data, [{ id: 1 }]);
  assert.equal(page.nextPageToken, "abc");
  assert.equal(page.cursor, null);
  assert.equal(page.hasMore, true);
  assert.equal(page.httpStatus, 200);
  assert.equal(parsePagedResponse({ data: [] }, ["contacts"]).hasMore, false);
  assert.deepEqual(parsePagedResponse({ data: { contacts: [{ id: 2 }] }, total: 1 }, ["contacts"]).data, [{ id: 2 }]);
  assert.deepEqual(parsePagedResponse({ data: [{ id: 3 }] }, ["contacts"]).data, [{ id: 3 }]);
  assert.deepEqual(parsePagedResponse({ data: [{ id: 4 }] }, ["data", "orders"]).data, [{ id: 4 }]);
  assert.equal(parsePagedResponse({ unexpected: [] }, ["contacts"]).parserWarnings.length, 1);
});

test("parses HighLevel v3 nested message history wrapper and lastMessageId pagination", () => {
  const page = parsePagedResponse({
    messages: {
      lastMessageId: "msg-last",
      nextPage: true,
      messages: [
        {
          id: "msg-1",
          conversationId: "conv-1",
          contactId: "contact-1",
          dateAdded: "2026-08-20T15:00:00.000Z",
          body: "Hello",
          direction: "inbound",
          status: "delivered"
        }
      ]
    }
  }, ["messages"]);
  assert.equal(page.data.length, 1);
  assert.equal(page.data[0].id, "msg-1");
  assert.equal(page.nextPageToken, "msg-last");
  assert.equal(page.hasMore, true);

  const finalPage = parsePagedResponse({
    messages: {
      lastMessageId: "msg-last",
      nextPage: false,
      messages: []
    }
  }, ["messages"]);
  assert.equal(finalPage.data.length, 0);
  assert.equal(finalPage.nextPageToken, null);
  assert.equal(finalPage.hasMore, false);

  const malformed = parsePagedResponse({ messages: { lastMessageId: "msg-last", nextPage: true } }, ["messages"]);
  assert.equal(malformed.data.length, 0);
  assert.match(malformed.parserWarnings.join("\n"), /Recognized wrapper "messages" did not contain an inner "messages" array/);
});

test("GHL message client extracts nested message history and preserves lastMessageId pagination", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: new URL(String(url)), init });
    return new Response(JSON.stringify({
      messages: {
        lastMessageId: "msg-last",
        nextPage: true,
        messages: [
          {
            id: "msg-1",
            conversationId: "conv-1",
            contactId: "contact-1",
            dateAdded: "2026-08-20T15:00:00.000Z",
            body: "Hello",
            direction: "inbound",
            status: "delivered"
          }
        ]
      }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const client = new GhlReadOnlyClient(miamiConnection, { GHL_MIAMI_PRIVATE_TOKEN: "secret-token", GHL_INTEGRATION_MODE: "read_only" });
    const page = await client.getMessages("conv-1");
    assert.equal(page.data.length, 1);
    assert.equal(page.data[0].id, "msg-1");
    assert.equal(page.nextPageToken, "msg-last");
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(requests[0].url.pathname, "/conversations/conv-1/messages");
});

test("GHL dry-run custom field and pipeline requests do not send unsupported limit", async () => {
  const client = new GhlReadOnlyClient(miamiConnection, { GHL_MIAMI_PRIVATE_TOKEN: "secret-token", GHL_INTEGRATION_MODE: "read_only" });
  const [customFieldRequest] = await captureGhlRequest(() => client.getCustomFields());
  assert.equal(customFieldRequest.url.pathname, "/locations/Y4e3rWEXVyXCZmZaCs8d/customFields");
  assert.deepEqual(Array.from(customFieldRequest.url.searchParams.keys()), []);

  const [pipelineRequest] = await captureGhlRequest(() => client.getPipelines());
  assert.equal(pipelineRequest.url.pathname, "/opportunities/pipelines");
  assert.deepEqual(Array.from(pipelineRequest.url.searchParams.keys()).sort(), ["locationId"]);
  assert.equal(pipelineRequest.url.searchParams.get("locationId"), "Y4e3rWEXVyXCZmZaCs8d");
});

test("GHL opportunity search uses numeric v3 page pagination instead of opaque cursors", async () => {
  const client = new GhlReadOnlyClient(miamiConnection, { GHL_MIAMI_PRIVATE_TOKEN: "secret-token", GHL_INTEGRATION_MODE: "read_only" });
  const [firstPage] = await captureGhlRequest(() => client.getOpportunities());
  assert.equal(firstPage.url.pathname, "/opportunities/search");
  assert.deepEqual(Array.from(firstPage.url.searchParams.keys()).sort(), ["limit", "locationId", "page"]);
  assert.equal(firstPage.url.searchParams.get("locationId"), "Y4e3rWEXVyXCZmZaCs8d");
  assert.equal(firstPage.url.searchParams.get("limit"), "100");
  assert.equal(firstPage.url.searchParams.get("page"), "1");
  assert.equal(firstPage.url.searchParams.has("pageToken"), false);

  const [page24] = await captureGhlRequest(() => client.getOpportunities({ pageToken: "24" }));
  assert.equal(page24.url.searchParams.get("page"), "24");
  assert.equal(page24.url.searchParams.has("startAfterId"), false);
  assert.equal(page24.url.searchParams.has("pageToken"), false);

  const [incrementalPage] = await captureGhlRequest(() => client.getOpportunities({ pageToken: "3", query: { updatedAfter: "2026-08-20T00:00:00Z", limit: 50 } }));
  assert.equal(incrementalPage.url.searchParams.get("page"), "3");
  assert.equal(incrementalPage.url.searchParams.get("limit"), "50");
  assert.equal(incrementalPage.url.searchParams.has("updatedAfter"), false);

  await assert.rejects(
    () => captureRejectedGhlRequest(() => client.getOpportunities({ pageToken: "QQIQOaD9K4wyq2x4P45c" })),
    (error) => error instanceof GhlIntegrationError && error.code === "invalid_opportunity_page"
  );
});

test("GHL contact search sends only supported read-only body keys with numeric pages", async () => {
  const client = new GhlReadOnlyClient(miamiConnection, { GHL_MIAMI_PRIVATE_TOKEN: "secret-token", GHL_INTEGRATION_MODE: "read_only" });
  const [request] = await captureGhlRequest(() => client.getContacts({
    pageToken: "2",
    body: {
      pageLimit: 75,
      filters: [{ field: "updatedAt", operator: "gte", value: "2026-08-20T00:00:00Z" }],
      updatedAfter: "2026-08-20T00:00:00Z"
    }
  }));
  assert.equal(request.url.pathname, "/contacts/search");
  assert.deepEqual(Array.from(request.url.searchParams.keys()), []);
  const body = JSON.parse(String(request.init.body));
  assert.deepEqual(Object.keys(body).sort(), ["locationId", "page", "pageLimit"]);
  assert.equal(body.locationId, "Y4e3rWEXVyXCZmZaCs8d");
  assert.equal(body.page, 2);
  assert.equal(body.pageLimit, 75);

  await assert.rejects(
    () => captureRejectedGhlRequest(() => client.getContacts({ pageToken: "QQIQOaD9K4wyq2x4P45c" })),
    (error) => error instanceof GhlIntegrationError && error.code === "invalid_provider_page"
  );
});

test("GHL calendar events request is calendar-scoped and does not send generic pagination", async () => {
  const client = new GhlReadOnlyClient(miamiConnection, { GHL_MIAMI_PRIVATE_TOKEN: "secret-token", GHL_INTEGRATION_MODE: "read_only" });
  const [request] = await captureGhlRequest(() => client.getAppointments({
    pageToken: "2",
    query: {
      calendarId: "real-calendar-1",
      startTime: "2026-08-20T00:00:00.000Z",
      endTime: 1787184000000,
      limit: 100
    }
  }));
  assert.equal(request.url.pathname, "/calendars/events");
  assert.deepEqual(Array.from(request.url.searchParams.keys()).sort(), ["calendarId", "endTime", "locationId", "startTime"]);
  assert.equal(request.url.searchParams.get("calendarId"), "real-calendar-1");
  assert.match(String(request.url.searchParams.get("startTime")), /^\d+$/);
  assert.equal(request.url.searchParams.get("endTime"), "1787184000000");
  assert.equal(request.url.searchParams.has("pageToken"), false);
  assert.equal(request.url.searchParams.has("limit"), false);

  await assert.rejects(
    () => captureRejectedGhlRequest(() => client.getAppointments({ query: { startTime: 1, endTime: 2 } })),
    (error) => error instanceof GhlIntegrationError && error.code === "invalid_appointment_request"
  );
});

test("numeric opportunity page parser ignores provider cursor fields", () => {
  const page = parsePagedResponse({ opportunities: Array.from({ length: 100 }), startAfterId: "QQIQOaD9K4wyq2x4P45c", total: 250 }, ["opportunities"], { page: 24, limit: 100, numericPageOnly: true });
  assert.equal(page.nextPageToken, null);
  const middlePage = parsePagedResponse({ opportunities: Array.from({ length: 100 }), startAfterId: "QQIQOaD9K4wyq2x4P45c", total: 2500 }, ["opportunities"], { page: 24, limit: 100, numericPageOnly: true });
  assert.equal(middlePage.nextPageToken, "25");
  assert.equal(normalizeOpportunityJobPageToken("24"), "24");
  assert.throws(() => normalizeOpportunityJobPageToken("QQIQOaD9K4wyq2x4P45c"), /Invalid GHL opportunity page token/);
});

test("targeted GHL contact retry fetches only the requested contact", async () => {
  const client = new GhlReadOnlyClient(miamiConnection, { GHL_MIAMI_PRIVATE_TOKEN: "secret-token", GHL_INTEGRATION_MODE: "read_only" });
  const [request] = await captureGhlRequest(() => client.getContact("ghl-contact-123"));
  assert.equal(request.url.pathname, "/contacts/ghl-contact-123");
  assert.deepEqual(Array.from(request.url.searchParams.keys()), []);
});

test("rate-limit helpers identify retryable provider responses", () => {
  assert.equal(shouldRetryStatus(429), true);
  assert.equal(shouldRetryStatus(503), true);
  assert.equal(shouldRetryStatus(403), false);
  assert.equal(retryDelayMs({ attempt: 2, maxAttempts: 3 }), 1000);
  assert.equal(retryDelayMs({ attempt: 2, maxAttempts: 3, retryAfterMs: 2500 }), 2500);
});

test("full import pagination is not capped by dry-run preview counts", () => {
  assert.equal(FULL_IMPORT_PAGE_SIZE, 100);
  assert.equal(nextFullImportPageToken({ data: Array.from({ length: 100 }), hasMore: true, nextPageToken: "6" }), "6");
  assert.equal(nextFullImportPageToken({ data: Array.from({ length: 100 }), hasMore: true, nextPageToken: "101" }), "101");
  assert.equal(nextFullImportPageToken({ data: Array.from({ length: 100 }), hasMore: true, cursor: "conversation-cursor-101" }), "conversation-cursor-101");
  assert.equal(nextFullImportPageToken({ data: [], hasMore: false, nextPageToken: "ignored" }), null);
});

test("full import batches large appointment sets safely", () => {
  assert.equal(FULL_IMPORT_APPOINTMENT_CALENDAR_BATCH_SIZE, 1);
  assert.equal(fullImportRecordBatchCount(9245), 185);
  assert.equal(fullImportRecordBatchCount(0), 0);
});

test("full import order and object gates preserve dependency order", () => {
  assert.deepEqual(FULL_IMPORT_OBJECT_ORDER.slice(0, 8), ["location_metadata", "user", "custom_field", "tag", "contact", "pipeline", "opportunity", "calendar"]);
  assert.equal(FULL_IMPORT_OBJECT_ORDER.indexOf("appointment") > FULL_IMPORT_OBJECT_ORDER.indexOf("calendar"), true);
  assert.equal(FULL_IMPORT_OBJECT_ORDER.indexOf("message") > FULL_IMPORT_OBJECT_ORDER.indexOf("conversation"), true);
  assert.equal(fullImportObjectEnabled({ ...miamiConnection, objects_enabled: { contacts: false } }, "contact"), false);
  assert.equal(fullImportObjectEnabled({ ...miamiConnection, objects_enabled: { contacts: false } }, "location_metadata"), true);
});

test("full import progress and retry settings are bounded", () => {
  assert.equal(fullImportProgressPercent({ metadata_safe: { current_object_index: 7, object_count: 14 } }), 50);
  assert.equal(fullImportProgressPercent({ metadata_safe: { current_object_index: 99, object_count: 14 } }), 100);
  assert.equal(FULL_IMPORT_MAX_ATTEMPTS, 5);
  assert.equal(FULL_IMPORT_STALE_LOCK_MS, 15 * 60 * 1000);
  assert.equal(FULL_IMPORT_HEARTBEAT_MS, 30 * 1000);
  assert.equal(GHL_READ_REQUEST_TIMEOUT_MS, 2 * 60 * 1000);
});

test("cancelled full imports remain resumable when incomplete", () => {
  assert.equal(RESUMABLE_FULL_IMPORT_STATUSES.includes("cancelled"), true);
  assert.equal(fullImportRunLooksIncomplete({ status: "cancelled", metadata_safe: { current_object: "contact", current_cursor: "2" } }), true);
  assert.equal(fullImportRunLooksIncomplete({ status: "succeeded", metadata_safe: { historical_import_complete: true } }), false);
  assert.equal(resumePageTokenFromRun({ metadata_safe: { current_object: "contact", current_cursor: "2", current_page: "2" } }), "2");
  assert.equal(resumePageTokenFromRun({ metadata_safe: { current_page: "first" } }), null);
});

test("local GHL worker keeps polling through idle cycles", () => {
  const worker = readFileSync(new URL("../../../scripts/ghl-sync-worker.mjs", import.meta.url), "utf8");
  assert.match(worker, /maxJobsPerPoll/);
  assert.match(worker, /no jobs due; polling will continue/);
  assert.match(worker, /transient worker transport error/);
  assert.doesNotMatch(worker, /if \(!Number\(result\.claimed \?\? 0\) && !Number\(result\.queuedNext \?\? 0\)\) break/);
});

test("local GHL worker treats Undici header timeout as transient", async () => {
  const worker = await import("../../../scripts/ghl-sync-worker.mjs");
  const headerTimeout = new TypeError("fetch failed", { cause: { code: "UND_ERR_HEADERS_TIMEOUT" } });
  const connectTimeout = new TypeError("fetch failed", { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } });
  assert.equal(worker.DEFAULT_WORKER_MAX_JOBS_PER_POLL, 1);
  assert.equal(worker.isTransientWorkerFetchError(headerTimeout), true);
  assert.equal(worker.isTransientWorkerFetchError(connectTimeout), true);
  assert.equal(worker.isTransientWorkerFetchError(new Error("CRON_SECRET is required")), false);
  assert.equal(worker.workerBackoffDelayMs(1, 1000), 1000);
  assert.equal(worker.workerBackoffDelayMs(3, 1000), 4000);
});

function workerQueueSupabase(objectType) {
  const historicalRows = Array.from({ length: 1100 }, (_, index) => ({
    id: `historical-${index}`,
    sync_run_id: "run-historical",
    object_type: index % 2 === 0 ? "contact" : "opportunity",
    page_token: null,
    status: index % 2 === 0 ? "completed" : "dead_letter",
    attempts: 1,
    run_at: `2026-08-19T00:${String(index % 60).padStart(2, "0")}:00.000Z`,
    locked_at: null,
    locked_by: null,
    updated_at: "2026-08-19T01:00:00.000Z",
    metadata_safe: {}
  }));
  const dueJob = {
    id: `due-${objectType}`,
    sync_run_id: "run-due",
    object_type: objectType,
    page_token: objectType === "opportunity" ? "3" : null,
    status: "queued",
    attempts: 0,
    run_at: "2026-08-19T12:00:00.000Z",
    locked_at: null,
    locked_by: null,
    updated_at: "2026-08-19T12:00:00.000Z",
    metadata_safe: {}
  };
  const rows = [...historicalRows, dueJob];
  return {
    rows,
    from(table) {
      assert.equal(table, "ghl_sync_jobs");
      const state = {
        eq: [],
        in: [],
        lte: [],
        gt: [],
        limit: null,
        orderBy: null,
        updatePayload: null,
        head: false,
        count: false
      };
      const applyFilters = () => {
        let filtered = rows.filter((row) => {
          const eqOk = state.eq.every(([column, value]) => row[column] === value);
          const inOk = state.in.every(([column, values]) => values.includes(row[column]));
          const lteOk = state.lte.every(([column, value]) => String(row[column]) <= String(value));
          const gtOk = state.gt.every(([column, value]) => String(row[column]) > String(value));
          return eqOk && inOk && lteOk && gtOk;
        });
        if (state.orderBy) filtered = [...filtered].sort((left, right) => String(left[state.orderBy]).localeCompare(String(right[state.orderBy])));
        if (state.limit !== null) filtered = filtered.slice(0, state.limit);
        return filtered;
      };
      const builder = {
        select(_columns, options = {}) {
          state.head = options.head === true;
          state.count = options.count === "exact";
          return this;
        },
        update(payload) {
          state.updatePayload = payload;
          return this;
        },
        eq(column, value) {
          state.eq.push([column, value]);
          return this;
        },
        in(column, values) {
          state.in.push([column, values]);
          return this;
        },
        lte(column, value) {
          state.lte.push([column, value]);
          return this;
        },
        gt(column, value) {
          state.gt.push([column, value]);
          return this;
        },
        order(column) {
          state.orderBy = column;
          return this;
        },
        limit(value) {
          state.limit = value;
          return this;
        },
        async maybeSingle() {
          const filtered = applyFilters();
          if (state.updatePayload) {
            const row = filtered[0] ?? null;
            if (row) Object.assign(row, state.updatePayload);
            return { data: row, error: null };
          }
          return { data: filtered[0] ?? null, error: null };
        },
        then(resolve) {
          const filtered = applyFilters();
          if (state.updatePayload) {
            for (const row of filtered) Object.assign(row, state.updatePayload);
          }
          resolve({
            data: state.head ? null : filtered,
            count: state.count ? filtered.length : null,
            error: null
          });
        }
      };
      return builder;
    }
  };
}

function memorySupabase(initialTables = {}) {
  const tables = Object.fromEntries(Object.entries(initialTables).map(([table, rows]) => [table, rows.map((row) => ({ ...row }))]));
  let sequence = 1;
  const tableRows = (table) => {
    if (!tables[table]) tables[table] = [];
    return tables[table];
  };
  const generatedId = (table) => `${table}-${sequence++}`;
  const executeUpsert = (table, payload, options = {}) => {
    const rows = tableRows(table);
    const incoming = Array.isArray(payload) ? payload : [payload];
    const conflictColumns = String(options.onConflict ?? "id").split(",").map((column) => column.trim()).filter(Boolean);
    const written = incoming.map((item) => {
      const row = { id: item.id ?? generatedId(table), ...item };
      const existing = rows.find((candidate) => conflictColumns.every((column) => candidate[column] === row[column]));
      if (existing) {
        Object.assign(existing, row);
        return existing;
      }
      rows.push(row);
      return row;
    });
    return written;
  };
  return {
    tables,
    from(table) {
      const state = {
        action: "select",
        payload: null,
        upsertOptions: {},
        eq: [],
        neq: [],
        in: [],
        lte: [],
        gt: [],
        match: [],
        or: [],
        limit: null,
        orderBy: null,
        ascending: true,
        head: false,
        count: false,
        resultRows: null
      };
      const applyFilters = () => {
        let rows = [...tableRows(table)].filter((row) => {
          const eqOk = state.eq.every(([column, value]) => row[column] === value);
          const neqOk = state.neq.every(([column, value]) => row[column] !== value);
          const inOk = state.in.every(([column, values]) => values.includes(row[column]));
          const lteOk = state.lte.every(([column, value]) => String(row[column]) <= String(value));
          const gtOk = state.gt.every(([column, value]) => String(row[column]) > String(value));
          const matchOk = state.match.every((values) => Object.entries(values).every(([column, value]) => row[column] === value));
          return eqOk && neqOk && inOk && lteOk && gtOk && matchOk;
        });
        for (const expression of state.or) {
          if (expression.startsWith("last_message_at.is.null,last_message_at.lt.")) {
            const threshold = expression.replace("last_message_at.is.null,last_message_at.lt.", "");
            rows = rows.filter((row) => row.last_message_at === null || row.last_message_at === undefined || String(row.last_message_at) < threshold);
          }
        }
        if (state.orderBy) rows = rows.sort((left, right) => {
          const comparison = String(left[state.orderBy] ?? "").localeCompare(String(right[state.orderBy] ?? ""));
          return state.ascending ? comparison : -comparison;
        });
        if (state.limit !== null) rows = rows.slice(0, state.limit);
        return rows;
      };
      const execute = () => {
        if (state.action === "insert") {
          const inserted = (Array.isArray(state.payload) ? state.payload : [state.payload]).map((item) => {
            const row = { id: item.id ?? generatedId(table), ...item };
            tableRows(table).push(row);
            return row;
          });
          state.resultRows = inserted;
          return inserted;
        }
        if (state.action === "upsert") {
          const rows = executeUpsert(table, state.payload, state.upsertOptions);
          state.resultRows = rows;
          return rows;
        }
        if (state.action === "update") {
          const rows = applyFilters();
          for (const row of rows) Object.assign(row, state.payload);
          state.resultRows = rows;
          return rows;
        }
        return applyFilters();
      };
      const builder = {
        select(_columns, options = {}) {
          state.head = options.head === true;
          state.count = options.count === "exact";
          return this;
        },
        insert(payload) {
          state.action = "insert";
          state.payload = payload;
          return this;
        },
        update(payload) {
          state.action = "update";
          state.payload = payload;
          return this;
        },
        upsert(payload, options = {}) {
          state.action = "upsert";
          state.payload = payload;
          state.upsertOptions = options;
          return this;
        },
        eq(column, value) {
          state.eq.push([column, value]);
          return this;
        },
        neq(column, value) {
          state.neq.push([column, value]);
          return this;
        },
        in(column, values) {
          state.in.push([column, values]);
          return this;
        },
        lte(column, value) {
          state.lte.push([column, value]);
          return this;
        },
        gt(column, value) {
          state.gt.push([column, value]);
          return this;
        },
        match(values) {
          state.match.push(values);
          return this;
        },
        or(expression) {
          state.or.push(expression);
          return this;
        },
        order(column, options = {}) {
          state.orderBy = column;
          state.ascending = options.ascending !== false;
          return this;
        },
        limit(value) {
          state.limit = value;
          return this;
        },
        async maybeSingle() {
          const rows = execute();
          return { data: rows[0] ?? null, error: null };
        },
        async single() {
          const rows = execute();
          return { data: rows[0] ?? null, error: null };
        },
        then(resolve) {
          const rows = execute();
          resolve({
            data: state.head ? null : rows,
            count: state.count ? rows.length : null,
            error: null
          });
        }
      };
      return builder;
    }
  };
}

test("GHL worker claims due queued jobs even when diagnostics window is full of historical jobs", async () => {
  for (const objectType of ["appointment", "contact", "opportunity"]) {
    const supabase = workerQueueSupabase(objectType);
    const diagnostics = [];
    const claimed = await claimNextJob(supabase, "worker-starvation-test", diagnostics);
    assert.equal(claimed?.id, `due-${objectType}`);
    assert.equal(claimed?.status, "running");
    assert.equal(claimed?.attempts, 1);
    assert.equal(supabase.rows.find((row) => row.id === `due-${objectType}`)?.status, "running");
    assert.match(diagnostics.join("\n"), /jobs_found due=1/);
  }
});

test("incremental message sync fans out across mapped conversations", async () => {
  const connection = {
    ...miamiConnection,
    objects_enabled: {
      users: false,
      custom_fields: false,
      tags: false,
      contacts: true,
      pipelines: false,
      opportunities: false,
      calendars: false,
      appointments: false,
      conversations: false,
      messages: true,
      payments: false
    }
  };
  const supabase = memorySupabase({
    ghl_connections: [connection],
    ghl_sync_runs: [],
    ghl_sync_jobs: [],
    ghl_sync_cursors: [
      {
        id: "cursor-contact",
        connection_id: connection.id,
        object_type: "contact",
        cursor_value: null,
        last_page_token: null,
        last_sync_completed_at: "2026-08-20T12:04:00.000Z"
      },
      {
        id: "cursor-reconciliation",
        connection_id: connection.id,
        object_type: "reconciliation",
        cursor_value: null,
        last_page_token: null,
        last_sync_completed_at: "2026-08-20T12:00:00.000Z"
      }
    ],
    external_record_mappings: [
      {
        id: "conv-map-1",
        connection_id: connection.id,
        external_object_type: "conversation",
        external_id: "ghl-conv-1",
        internal_object_type: "conversations",
        internal_id: "internal-conv-1",
        created_at: "2026-08-20T10:00:00.000Z"
      },
      {
        id: "conv-map-2",
        connection_id: connection.id,
        external_object_type: "conversation",
        external_id: "ghl-conv-2",
        internal_object_type: "conversations",
        internal_id: "internal-conv-2",
        created_at: "2026-08-20T10:01:00.000Z"
      }
    ]
  });

  const queued = await queueDueGhlIncrementalReconciliation(supabase, {
    now: new Date("2026-08-20T12:05:00.000Z"),
    connectionId: connection.id,
    env: {}
  });

  assert.equal(queued, 1);
  assert.equal(supabase.tables.ghl_sync_runs.length, 1);
  assert.equal(supabase.tables.ghl_sync_runs[0].object_type, "message");
  assert.equal(supabase.tables.ghl_sync_jobs.length, 2);
  assert.deepEqual(supabase.tables.ghl_sync_jobs.map((job) => job.cursor_value), ["ghl-conv-1", "ghl-conv-2"]);
  assert.deepEqual(supabase.tables.ghl_sync_jobs.map((job) => job.metadata_safe.conversation_external_id), ["ghl-conv-1", "ghl-conv-2"]);
});

test("message jobs fetch by conversation, link messages, and advance parent last_message_at safely", async () => {
  const connection = { ...miamiConnection, credential_env_key: "GHL_TEST_PRIVATE_TOKEN" };
  const supabase = memorySupabase({
    ghl_connections: [connection],
    ghl_sync_runs: [{
      id: "run-message",
      organization_id: connection.organization_id,
      connection_id: connection.id,
      sync_type: "incremental",
      object_type: "message",
      status: "queued",
      records_fetched: 0,
      records_created: 0,
      records_updated: 0,
      records_unchanged: 0,
      records_skipped: 0,
      records_failed: 0,
      pages_fetched: 0,
      metadata_safe: {}
    }],
    ghl_sync_jobs: [{
      id: "job-message",
      organization_id: connection.organization_id,
      connection_id: connection.id,
      sync_run_id: "run-message",
      object_type: "message",
      cursor_value: "ghl-conv-1",
      page_token: null,
      status: "queued",
      attempts: 0,
      run_at: "2026-08-20T12:00:00.000Z",
      locked_at: null,
      locked_by: null,
      metadata_safe: {}
    }],
    external_record_mappings: [
      {
        id: "conversation-map",
        connection_id: connection.id,
        external_object_type: "conversation",
        external_id: "ghl-conv-1",
        internal_object_type: "conversations",
        internal_id: "internal-conv-1"
      },
      {
        id: "contact-map",
        connection_id: connection.id,
        external_object_type: "contact",
        external_id: "ghl-contact-1",
        internal_object_type: "contacts",
        internal_id: "internal-contact-1"
      }
    ],
    conversations: [{
      id: "internal-conv-1",
      organization_id: connection.organization_id,
      contact_id: "internal-contact-1",
      last_message_at: "2026-08-14T00:00:00.000Z"
    }],
    messages: [],
    ghl_sync_cursors: [],
    ghl_sync_events: [],
    ghl_sync_exceptions: []
  });
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.GHL_TEST_PRIVATE_TOKEN;
  const requests = [];
  process.env.GHL_TEST_PRIVATE_TOKEN = "test-token";
  globalThis.fetch = async (url, init) => {
    requests.push({ url: new URL(String(url)), init });
    return new Response(JSON.stringify({
      messages: {
        lastMessageId: "ghl-msg-old",
        nextPage: false,
        messages: [
          { id: "ghl-msg-new", conversationId: "ghl-conv-1", contactId: "ghl-contact-1", direction: "inbound", channel: "sms", body: "Newer message", dateAdded: "2026-08-20T12:00:00.000Z", status: "delivered" },
          { id: "ghl-msg-old", conversationId: "ghl-conv-1", contactId: "ghl-contact-1", direction: "outbound", channel: "sms", body: "Older message", dateAdded: "2026-08-13T12:00:00.000Z", status: "delivered" }
        ]
      }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await processGhlSyncJobs(supabase, { maxJobs: 1, workerId: "message-worker-test" });
    assert.equal(result.claimed, 1);
    assert.equal(result.completed, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.GHL_TEST_PRIVATE_TOKEN;
    else process.env.GHL_TEST_PRIVATE_TOKEN = originalToken;
  }

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url.pathname, "/conversations/ghl-conv-1/messages");
  assert.equal(requests[0].url.searchParams.get("lastMessageId"), null);
  assert.equal(supabase.tables.messages.length, 2);
  assert.deepEqual(supabase.tables.messages.map((message) => message.conversation_id), ["internal-conv-1", "internal-conv-1"]);
  assert.deepEqual(supabase.tables.messages.map((message) => message.contact_id), ["internal-contact-1", "internal-contact-1"]);
  assert.equal(supabase.tables.conversations[0].last_message_at, "2026-08-20T12:00:00.000Z");
  assert.equal(supabase.tables.external_record_mappings.find((mapping) => mapping.external_id === "ghl-msg-new")?.internal_object_type, "messages");
});

test("message job without conversation cursor becomes an explicit diagnostic failure", async () => {
  const connection = { ...miamiConnection, credential_env_key: "GHL_TEST_PRIVATE_TOKEN" };
  const supabase = memorySupabase({
    ghl_connections: [connection],
    ghl_sync_runs: [{
      id: "run-message-missing-cursor",
      organization_id: connection.organization_id,
      connection_id: connection.id,
      sync_type: "incremental",
      object_type: "message",
      status: "queued",
      records_fetched: 0,
      records_created: 0,
      records_updated: 0,
      records_unchanged: 0,
      records_skipped: 0,
      records_failed: 0,
      pages_fetched: 0,
      metadata_safe: {}
    }],
    ghl_sync_jobs: [{
      id: "job-message-missing-cursor",
      organization_id: connection.organization_id,
      connection_id: connection.id,
      sync_run_id: "run-message-missing-cursor",
      object_type: "message",
      cursor_value: null,
      page_token: null,
      status: "queued",
      attempts: 0,
      run_at: "2026-08-20T12:00:00.000Z",
      locked_at: null,
      locked_by: null,
      metadata_safe: {}
    }],
    ghl_sync_cursors: [],
    ghl_sync_events: [],
    ghl_sync_exceptions: []
  });
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await processGhlSyncJobs(supabase, { maxJobs: 1, workerId: "message-worker-test" });
    assert.equal(result.claimed, 1);
    assert.equal(result.failed, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(fetchCalled, false);
  assert.equal(supabase.tables.ghl_sync_jobs[0].status, "dead_letter");
  assert.match(supabase.tables.ghl_sync_jobs[0].last_error, /missing the external conversation cursor/);
  assert.equal(supabase.tables.ghl_sync_runs[0].status, "partial");
});

test("GHL server action kick treats active worker as started", () => {
  const actions = readFileSync(new URL("../../../app/gohighlevel-actions.ts", import.meta.url), "utf8");
  assert.equal(actions.includes('internalGhlWorkerUrl("?maxJobs=1")'), true);
  assert.match(actions, /payload\.queue\?\.active/);
  assert.match(actions, /a GHL import job is already running/);
});

test("targeted failed-record recovery is available without starting a new full import", () => {
  const importer = readFileSync(new URL("./importer.ts", import.meta.url), "utf8");
  const forms = readFileSync(new URL("../../../components/crm/GoHighLevelForms.tsx", import.meta.url), "utf8");
  const runsPage = readFileSync(new URL("../../../app/(crm)/integrations/gohighlevel/runs/page.tsx", import.meta.url), "utf8");
  assert.match(importer, /single_record_retry/);
  assert.match(importer, /retryGhlFailedRecords/);
  assert.match(importer, /opportunity_dead_letters_only/);
  assert.match(importer, /repaired_from_page_token/);
  assert.match(importer, /duplicate_dead_letter_superseded/);
  assert.match(importer, /opportunity_missing_contact_dependency_repair/);
  assert.match(forms, /Retry Failed Records/);
  assert.match(runsPage, /GhlRetryFailedRecordsForm/);
});

test("appointment status backfill apply is explicit and status-only", () => {
  const actions = readFileSync(new URL("../../../app/gohighlevel-actions.ts", import.meta.url), "utf8");
  const forms = readFileSync(new URL("../../../components/crm/GoHighLevelForms.tsx", import.meta.url), "utf8");
  const helper = readFileSync(new URL("./appointment-status-backfill.ts", import.meta.url), "utf8");
  assert.match(actions, /validateAppointmentStatusBackfillRequest/);
  assert.equal(APPOINTMENT_STATUS_BACKFILL_CONFIRMATION, "APPLY STATUS BACKFILL");
  assert.match(forms, /Apply Appointment Status Backfill/);
  assert.match(forms, /\/api\/integrations\/gohighlevel\/appointment-status-backfill/);
  assert.match(helper, new RegExp(String.raw`\.from\("appointments"\)\s*\.update\(\{ status \}\)`));
  assert.match(helper, new RegExp(String.raw`\.from\("external_record_mappings"\)\s*\.update\(\{ metadata_safe: update\.metadata \}\)`));
  assert.doesNotMatch(helper, new RegExp(String.raw`\.from\("appointments"\)\s*\.update\(\{[^}]*start_at`, "s"));
  assert.doesNotMatch(helper, new RegExp(String.raw`\.from\("appointments"\)\s*\.update\(\{[^}]*contact_id`, "s"));
});

test("appointment status backfill confirmation accepts deliberate whitespace and case normalization", () => {
  assert.equal(APPOINTMENT_STATUS_BACKFILL_CONFIRMATION, "APPLY STATUS BACKFILL");
  assert.equal(normalizeAppointmentStatusBackfillConfirmation("  apply   status backfill  "), "APPLY STATUS BACKFILL");
  assert.deepEqual(validateAppointmentStatusBackfillRequest({
    connectionId: miamiConnection.id,
    confirmation: " APPLY STATUS BACKFILL ",
    expectedCandidateCount: 7344
  }), {
    connectionId: miamiConnection.id,
    confirmation: "APPLY STATUS BACKFILL",
    expectedCandidateCount: 7344
  });
});

test("appointment status backfill request rejects wrong confirmation and missing connection", () => {
  assert.throws(() => validateAppointmentStatusBackfillRequest({
    connectionId: miamiConnection.id,
    confirmation: "RUN IT"
  }), /Type APPLY STATUS BACKFILL/);
  assert.throws(() => validateAppointmentStatusBackfillRequest({
    confirmation: "APPLY STATUS BACKFILL"
  }), /Connection is required/);
  assert.throws(() => validateAppointmentStatusBackfillRequest({
    connectionId: miamiConnection.id,
    confirmation: "APPLY STATUS BACKFILL"
  }), /Run Apply Preview/);
});

test("appointment status backfill route reaches the dry-run-validated apply path", () => {
  const route = readFileSync(new URL("../../../app/api/integrations/gohighlevel/appointment-status-backfill/route.ts", import.meta.url), "utf8");
  const forms = readFileSync(new URL("../../../components/crm/GoHighLevelForms.tsx", import.meta.url), "utf8");
  assert.match(route, /buildAppointmentStatusBackfillApplyPreview/);
  assert.match(route, /validateAppointmentStatusBackfillRequest/);
  assert.match(route, /expectedCandidateCount/);
  assert.match(route, /appointment_status_backfill_apply/);
  assert.match(route, /ghl_writes_performed: false/);
  assert.match(forms, /Apply Preview/);
  assert.match(forms, /expectedCandidateCount: preview\.candidates/);
});

test("appointment status backfill candidates use appointment status comparisons", () => {
  const mappings = [
    { id: "map-showed", external_id: "appt-showed", internal_id: "appt-showed", metadata_safe: { calendar_id: "cal-1" } },
    { id: "map-cancelled", external_id: "appt-cancelled", internal_id: "appt-cancelled", metadata_safe: { calendar_id: "cal-1" } },
    { id: "map-noshow", external_id: "appt-noshow", internal_id: "appt-noshow", metadata_safe: { calendar_id: "cal-1" } },
    { id: "map-correct", external_id: "appt-correct", internal_id: "appt-correct", metadata_safe: { calendar_id: "cal-1" } }
  ];
  const appointments = [
    { id: "appt-showed", status: "scheduled" },
    { id: "appt-cancelled", status: "scheduled" },
    { id: "appt-noshow", status: "scheduled" },
    { id: "appt-correct", status: "completed" }
  ];
  const providerAppointments = [
    { id: "appt-showed", startTime: "2026-08-15T10:00:00.000Z", endTime: "2026-08-15T10:30:00.000Z", appointmentStatus: "showed" },
    { id: "appt-cancelled", startTime: "2026-08-15T11:00:00.000Z", endTime: "2026-08-15T11:30:00.000Z", appointmentStatus: "cancelled" },
    { id: "appt-noshow", startTime: "2026-08-15T12:00:00.000Z", endTime: "2026-08-15T12:30:00.000Z", appointmentStatus: "noshow" },
    { id: "appt-correct", startTime: "2026-08-15T13:00:00.000Z", endTime: "2026-08-15T13:30:00.000Z", appointmentStatus: "showed" }
  ];
  const plan = planAppointmentStatusBackfill({
    connection: miamiConnection,
    mappings,
    appointments,
    providerAppointments,
    providerPagesFetched: 1,
    calendarsChecked: 1
  });
  assert.equal(plan.report.wouldChangeCount, plan.statusChanges.length);
  const preview = previewAppointmentStatusBackfillPlan(plan);
  assert.equal(preview.dryRunWouldChangeEqualsApplyCandidates, true);
  assert.equal(preview.wouldChangeCount, preview.applyCandidateCount);
  assert.deepEqual(plan.statusChanges, [
    { appointmentId: "appt-showed", fromStatus: "scheduled", toStatus: "completed" },
    { appointmentId: "appt-cancelled", fromStatus: "scheduled", toStatus: "cancelled" },
    { appointmentId: "appt-noshow", fromStatus: "scheduled", toStatus: "no_show" }
  ]);
});

test("GHL calendar type mappings make imported appointments visible through the Calendar type filter", () => {
  const calendarPage = readFileSync(new URL("../../../app/(crm)/calendar/page.tsx", import.meta.url), "utf8");
  const importer = readFileSync(new URL("./importer.ts", import.meta.url), "utf8");
  const report = readFileSync(new URL("./reports.ts", import.meta.url), "utf8");
  const helper = readFileSync(new URL("./calendar-type-mapping.ts", import.meta.url), "utf8");
  const settingsPage = readFileSync(new URL("../../../app/(crm)/settings/integrations/gohighlevel/calendars/page.tsx", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../../../supabase/migrations/20260816010000_phase_21c_ghl_calendar_type_mappings.sql", import.meta.url), "utf8");

  assert.match(calendarPage, /query = query\.eq\("appointment_type_id", typeFilter\)/);
  assert.doesNotMatch(calendarPage, /query = query\.eq\("calendar_id"/);
  assert.match(importer, /appointmentTypeForGhlCalendar/);
  assert.match(importer, /\.from\("ghl_calendar_type_mappings"\)/);
  assert.match(importer, /appointment_type_id: typeId/);
  assert.match(importer, /calendar_mapping_found/);
  assert.match(report, /visibleThroughCalendarQuery/);
  assert.match(report, /mismatchCount/);
  assert.match(report, /mappedProviderCount/);
  assert.match(report, /externalProviderUserCount/);
  assert.match(settingsPage, /Visible Through Calendar Type Filter/);
  assert.match(settingsPage, /External Provider\/User Metadata/);
  assert.match(settingsPage, /GhlCalendarTypeBackfillControls/);
  assert.match(settingsPage, /GhlCalendarTypeMappingForm/);
  assert.match(helper, /\.from\("appointments"\)\s*\.update\(\{ appointment_type_id: candidate\.toAppointmentTypeId \}\)/);
  assert.doesNotMatch(helper, new RegExp(String.raw`\.from\("appointments"\)\s*\.update\(\{[^}]*start_at`, "s"));
  assert.doesNotMatch(helper, new RegExp(String.raw`\.from\("appointments"\)\s*\.update\(\{[^}]*contact_id`, "s"));
  assert.doesNotMatch(helper, /\.from\("appointments"\)\.insert/);
  assert.match(migration, /create table if not exists public\.ghl_calendar_type_mappings/);
  assert.match(migration, /unique \(connection_id, external_calendar_id\)/);
  assert.match(migration, /alter table public\.ghl_calendar_type_mappings enable row level security/);
});

test("GHL calendar type backfill selects existing appointments and leaves missing mappings for review", async () => {
  const stemAppointmentId = "11111111-1111-4111-8111-111111111111";
  const unmappedAppointmentId = "22222222-2222-4222-8222-222222222222";
  const plan = await buildGhlCalendarTypeBackfillPlan(calendarBackfillSupabase({
    typeMappings: [{ external_calendar_id: "ghl-stem-cell-calendar", appointment_type_id: "hair-restoration-type" }],
    appointmentMappings: [
      { id: "map-stem", external_id: "ghl-appt-stem", internal_id: stemAppointmentId, metadata_safe: { calendar_id: "ghl-stem-cell-calendar", external_assigned_user_id: "ghl-user-1" } },
      { id: "map-unmapped", external_id: "ghl-appt-unmapped", internal_id: unmappedAppointmentId, metadata_safe: { calendar_id: "ghl-unmapped-calendar" } }
    ],
    appointments: [
      { id: stemAppointmentId, appointment_type_id: "generic-ghl-type", provider_id: null, location_id: "10000000-0000-4000-8000-000000000101" },
      { id: unmappedAppointmentId, appointment_type_id: "generic-ghl-type", provider_id: "provider-1", location_id: "10000000-0000-4000-8000-000000000101" }
    ]
  }), miamiConnection);

  assert.equal(plan.appointmentsScanned, 2);
  assert.equal(plan.mappedAppointments, 1);
  assert.equal(plan.wouldUpdate, 1);
  assert.equal(plan.missingCalendarMapping, 1);
  assert.equal(plan.ambiguousMapping, 0);
  assert.equal(plan.providerAudit.importedWithExternalProviderUser, 1);
  assert.equal(plan.providerAudit.mappedToInternalProvider, 1);
  assert.equal(plan.providerAudit.stillUnassigned, 1);
  assert.deepEqual(plan.candidates, [{
    mappingId: "map-stem",
    appointmentId: stemAppointmentId,
    externalAppointmentId: "ghl-appt-stem",
    externalCalendarId: "ghl-stem-cell-calendar",
    fromAppointmentTypeId: "generic-ghl-type",
    toAppointmentTypeId: "hair-restoration-type",
    metadata: {
      calendar_id: "ghl-stem-cell-calendar",
      external_assigned_user_id: "ghl-user-1",
      appointment_type_id: "hair-restoration-type",
      calendar_type_mapping_backfilled_at: plan.candidates[0].metadata.calendar_type_mapping_backfilled_at
    }
  }]);
});

test("GHL calendar type backfill plan paginates beyond the first 1000 appointment mappings", async () => {
  const total = 1005;
  const appointmentMappings = Array.from({ length: total }, (_, index) => {
    const suffix = String(index + 1).padStart(12, "0");
    return {
      id: `map-${index + 1}`,
      external_id: `ghl-appt-${index + 1}`,
      internal_id: `11111111-1111-4111-8111-${suffix}`,
      metadata_safe: { calendar_id: "ghl-stem-cell-calendar" }
    };
  });
  const appointments = appointmentMappings.map((mapping) => ({
    id: mapping.internal_id,
    appointment_type_id: "generic-ghl-type",
    provider_id: null,
    location_id: "10000000-0000-4000-8000-000000000101"
  }));
  const plan = await buildGhlCalendarTypeBackfillPlan(calendarBackfillSupabase({
    typeMappings: [{ external_calendar_id: "ghl-stem-cell-calendar", appointment_type_id: "hair-restoration-type" }],
    appointmentMappings,
    appointments
  }), miamiConnection);

  assert.equal(plan.appointmentsScanned, total);
  assert.equal(plan.mappedAppointments, total);
  assert.equal(plan.wouldUpdate, total);
  assert.equal(plan.candidateCount, total);
});

test("GHL calendar report uses current appointment schema with UUID-safe batches", () => {
  const report = readFileSync(new URL("./reports.ts", import.meta.url), "utf8");
  const helper = readFileSync(new URL("./calendar-type-mapping.ts", import.meta.url), "utf8");
  const schema = readFileSync(new URL("../../../supabase/migrations/20260812150000_phase_2_appointments_audit.sql", import.meta.url), "utf8");
  const settingsPage = readFileSync(new URL("../../../app/(crm)/settings/integrations/gohighlevel/calendars/page.tsx", import.meta.url), "utf8");

  for (const column of ["id", "appointment_type_id", "provider_id", "location_id", "start_at", "end_at"]) {
    assert.match(schema, new RegExp(`${column} `));
  }
  assert.match(report, /select\("id, appointment_type_id, provider_id, location_id, start_at, end_at"\)/);
  assert.match(report, /const APPOINTMENT_LOOKUP_BATCH_SIZE = 100/);
  assert.match(report, /uniqueUuidValues/);
  assert.match(report, /safeSupabaseReportError/);
  assert.doesNotMatch(report, /index \+= 1000/);
  assert.match(helper, /const APPOINTMENT_LOOKUP_BATCH_SIZE = 100/);
  assert.match(helper, /const BACKFILL_MAPPING_PAGE_SIZE = 1000/);
  assert.match(helper, /\.range\(from, to\)/);
  assert.doesNotMatch(helper, /\.limit\(20000\)/);
  assert.match(settingsPage, /report\.calendarRows\.map/);
  assert.match(settingsPage, /Needs type backfill/);
});

test("GHL calendar report defaults to real Miami and excludes mock calendars", async () => {
  const profile = {
    id: "owner",
    organizationId: "org-avora",
    role: "owner",
    locations: [{ id: "10000000-0000-4000-8000-000000000101", name: "Miami", slug: "miami" }]
  };
  const report = await getGhlCalendarReport(calendarReportSupabase(), profile);

  assert.equal(isRealGhlConnectionForMapping(miamiConnection), true);
  assert.equal(isRealGhlConnectionForMapping({ ...miamiConnection, sync_mode: "development" }), true);
  assert.equal(isRealGhlConnectionForMapping({
    ...miamiConnection,
    connection_type: "mock",
    display_name: "Miam GHL",
    token_present: true,
    status: "healthy"
  }), true);
  assert.equal(isRealGhlConnectionForMapping({
    id: "conn-mock",
    organization_id: "org-avora",
    location_id: "10000000-0000-4000-8000-000000000101",
    display_name: "Miami Mock GoHighLevel",
    ghl_location_id: "ghl_mock_miami",
    connection_type: "mock",
    status: "healthy",
    sync_mode: "development",
    token_present: false
  }), false);
  assert.equal(isRealGhlConnectionForMapping({
    id: "conn-tampa-mock",
    organization_id: "org-avora",
    location_id: "loc-tampa",
    display_name: "Tampa Mock GoHighLevel",
    ghl_location_id: "ghl_mock_tampa",
    connection_type: "mock",
    status: "warning",
    sync_mode: "development",
    token_present: false
  }), false);
  assert.equal(isRealGhlConnectionForMapping({
    id: "conn-jacksonville-mock",
    organization_id: "org-avora",
    location_id: "loc-jacksonville",
    display_name: "Jacksonville Mock GoHighLevel",
    ghl_location_id: "ghl_mock_jacksonville",
    connection_type: "mock",
    status: "disabled",
    sync_mode: "development",
    token_present: false
  }), false);
  assert.equal(chooseDefaultGhlCalendarConnection([{
    ...miamiConnection,
    display_name: "Miam GHL"
  }])?.ghl_location_id, "Y4e3rWEXVyXCZmZaCs8d");
  assert.equal(report.selectedConnection?.id, "f6e55be9-3fa3-4648-89bf-22aceeadf905");
  assert.equal(report.hiddenMockConnectionCount, 3);
  assert.equal(report.diagnostics.selectedConnectionId, "f6e55be9-3fa3-4648-89bf-22aceeadf905");
  assert.equal(report.diagnostics.realConnectionsFound, 1);
  assert.equal(report.diagnostics.mockConnectionsExcluded, 3);
  assert.equal(report.diagnostics.connectionAuditRows.find((row) => row.id === "f6e55be9-3fa3-4648-89bf-22aceeadf905")?.syncMode, "development");
  assert.equal(report.diagnostics.connectionAuditRows.find((row) => row.id === "f6e55be9-3fa3-4648-89bf-22aceeadf905")?.profileCanAccessLocation, true);
  assert.equal(report.diagnostics.connectionAuditRows.find((row) => row.id === "f6e55be9-3fa3-4648-89bf-22aceeadf905")?.classificationReason, "real_expected_miami_location_id");
  assert.equal(report.diagnostics.calendarMappingCount, 13);
  assert.equal(report.diagnostics.appointmentMappingCount, 2);
  assert.equal(report.diagnostics.externalObjectTypeCounts.calendar, 13);
  assert.equal(report.diagnostics.externalObjectTypeCounts.appointment, 2);
  assert.equal(report.calendarRows.length, 13);
  assert.equal(report.calendarRows.some((row) => String(row.external_id).startsWith("ghl_calendar_")), false);
  assert.equal(report.calendarRows[0].calendarName, "Real Miami Calendar 1");
  assert.equal(report.calendarRows[0].importedAppointmentCount, 1);
  assert.equal(report.calendarRows[0].visibleThroughCalendarQuery, 1);
});

test("GHL calendar report uses mirror fallback when real calendar mappings use a noncanonical object type", async () => {
  const profile = {
    id: "owner",
    organizationId: "org-avora",
    role: "owner",
    locations: [{ id: "10000000-0000-4000-8000-000000000101", name: "Miami", slug: "miami" }]
  };
  const report = await getGhlCalendarReport(calendarReportSupabase({ calendarExternalObjectType: "provider_calendar" }), profile);

  assert.equal(report.selectedConnection?.ghl_location_id, "Y4e3rWEXVyXCZmZaCs8d");
  assert.equal(report.diagnostics.externalObjectTypeCounts.provider_calendar, 13);
  assert.equal(report.diagnostics.internalObjectTypeCounts.ghl_calendar_mirror, 13);
  assert.equal(report.diagnostics.calendarMappingCount, 13);
  assert.equal(report.calendarRows.length, 13);
  assert.equal(report.calendarRows.some((row) => String(row.external_id).startsWith("ghl_calendar_")), false);
});

test("GHL calendar report derives real calendar rows from imported appointment mappings when explicit calendar rows are absent", async () => {
  const profile = {
    id: "owner",
    organizationId: "org-avora",
    role: "owner",
    locations: [{ id: "10000000-0000-4000-8000-000000000101", name: "Miami", slug: "miami" }]
  };
  const report = await getGhlCalendarReport(calendarReportSupabase({
    omitRealCalendarMappings: true,
    deriveCalendarsFromAppointments: true
  }), profile);

  assert.equal(report.selectedConnection?.id, "f6e55be9-3fa3-4648-89bf-22aceeadf905");
  assert.equal(report.diagnostics.explicitCalendarMappingCount, 0);
  assert.equal(report.diagnostics.derivedCalendarMappingCount, 13);
  assert.equal(report.diagnostics.calendarIdsFromAppointmentMappings, 13);
  assert.equal(report.diagnostics.calendarMappingCount, 13);
  assert.equal(report.diagnostics.appointmentMappingCount, 13);
  assert.equal(report.appointmentCounts.length, 13);
  assert.equal(report.diagnostics.zeroRowsReason, null);
  assert.equal(report.calendarRows.length, 13);
  assert.equal(report.calendarRows.some((row) => String(row.external_id).startsWith("ghl_calendar_")), false);
  assert.equal(report.calendarRows.every((row) => String(row.connection_id) === miamiConnection.id), true);
});

test("GHL calendar report return object does not reference stale appointmentMappings variable", () => {
  const reportSource = readFileSync(new URL("./reports.ts", import.meta.url), "utf8");
  assert.doesNotMatch(reportSource, /appointmentCounts:\s*appointmentMappings\b/);
  assert.match(reportSource, /appointmentCounts:\s*typedAppointmentMappings\b/);
});

test("GHL calendar report skips malformed appointment mapping metadata without crashing", async () => {
  const profile = {
    id: "owner",
    organizationId: "org-avora",
    role: "owner",
    locations: [{ id: "10000000-0000-4000-8000-000000000101", name: "Miami", slug: "miami" }]
  };
  const report = await getGhlCalendarReport(calendarReportSupabase({
    omitRealCalendarMappings: true,
    deriveCalendarsFromAppointments: true,
    includeMalformedAppointmentMappings: true
  }), profile);

  assert.equal(report.selectedConnection?.ghl_location_id, "Y4e3rWEXVyXCZmZaCs8d");
  assert.equal(report.calendarRows.length, 13);
  assert.equal(report.diagnostics.derivedCalendarMappingCount, 13);
  assert.equal(report.diagnostics.malformedAppointmentMappingMetadataCount, 1);
  assert.equal(report.diagnostics.nullCalendarIdAppointmentMappingCount, 2);
  assert.equal(report.diagnostics.invalidCalendarIdAppointmentMappingCount, 1);
  assert.equal(report.diagnostics.invalidAppointmentInternalIdCount, 1);
  assert.equal(report.diagnostics.zeroRowsReason, null);
});

test("Stem Cell Consultation is explicitly mapped to Hair Restoration Consultation by configuration", () => {
  assert.equal(explicitAppointmentTypeNameForGhlCalendar("Hair Restoration Consultation"), "Hair Restoration Consultation");
  assert.equal(explicitAppointmentTypeNameForGhlCalendar("Stem Cell Consultation"), "Hair Restoration Consultation");
  assert.equal(explicitAppointmentTypeNameForGhlCalendar("Unknown Calendar"), null);
  assert.deepEqual(EXPLICIT_GHL_CALENDAR_TYPE_NAME_MAPPINGS.find((mapping) => mapping.ghlCalendarName === "Stem Cell Consultation"), {
    ghlCalendarName: "Stem Cell Consultation",
    appointmentTypeName: "Hair Restoration Consultation"
  });
});

test("GHL calendar type backfill is confirmation-protected and count-checked", () => {
  assert.equal(GHL_CALENDAR_TYPE_BACKFILL_CONFIRMATION, "APPLY GHL CALENDAR TYPE BACKFILL");
  assert.deepEqual(validateCalendarTypeBackfillRequest({
    connectionId: miamiConnection.id,
    confirmation: " apply   ghl calendar type backfill ",
    expectedCandidateCount: 9249
  }), {
    connectionId: miamiConnection.id,
    confirmation: "APPLY GHL CALENDAR TYPE BACKFILL",
    expectedCandidateCount: 9249
  });
  assert.throws(() => validateCalendarTypeBackfillRequest({
    connectionId: miamiConnection.id,
    confirmation: "APPLY STATUS BACKFILL",
    expectedCandidateCount: 9249
  }), /Type APPLY GHL CALENDAR TYPE BACKFILL/);
  assert.throws(() => validateCalendarTypeBackfillRequest({
    connectionId: miamiConnection.id,
    confirmation: "APPLY GHL CALENDAR TYPE BACKFILL",
    expectedCandidateCount: 0
  }), /Run calendar type backfill preview/);
});

test("GHL response errors retain safe HTTP diagnostics", async () => {
  const response = new Response(JSON.stringify({ message: "Missing scope contacts.readonly" }), { status: 403 });
  await assert.rejects(
    () => assertGhlResponse(response, { message: "Missing scope contacts.readonly" }, {
      endpoint: "/contacts/search",
      requestMethod: "POST",
      queryParameterNames: [],
      requestBodyKeys: ["locationId", "page", "pageLimit"],
      apiVersion: "v3"
    }),
    (error) => error instanceof GhlIntegrationError
      && error.code === "authorization_failed"
      && error.httpStatus === 403
      && error.safeProviderMessage === "Missing scope contacts.readonly"
      && error.endpoint === "/contacts/search"
      && error.requestMethod === "POST"
      && error.requestBodyKeys.includes("pageLimit")
  );
});

test("safe GHL errors redact contact identity values", () => {
  const safe = safeGhlError(new Error("duplicate key value violates contact_email_key for jane@example.com and +13055550100"));
  assert.equal(safe.message.includes("jane@example.com"), false);
  assert.equal(safe.message.includes("+13055550100"), false);
  assert.equal(safe.message.includes("[email]"), true);
  assert.equal(safe.message.includes("[phone]"), true);
});

test("webhook hash and event normalization support duplicate protection", () => {
  const body = JSON.stringify({ id: "evt_1", type: "ContactUpdated", locationId: "loc_1", contactId: "contact_1" });
  assert.equal(hashWebhookPayload(body), hashWebhookPayload(body));
  assert.deepEqual(normalizeWebhookEvent(JSON.parse(body)), {
    locationId: "loc_1",
    eventType: "ContactUpdated",
    providerEventId: "evt_1",
    externalObjectId: "contact_1",
    objectType: "contact",
    calendarId: null,
    conversationId: null,
    timestamp: null
  });
  assert.equal(verifyWebhookSignature(body, null, "secret").verified, false);
  assert.equal(verifyWebhookSignature(body, null, undefined).reason, "no_webhook_signature_configured");
});

test("Phase 21B webhook endpoint verifies signatures and queues read-only targeted sync", () => {
  const route = readFileSync(new URL("../../../app/api/integrations/gohighlevel/webhook/route.ts", import.meta.url), "utf8");
  assert.match(route, /createAdminClient/);
  assert.match(route, /x-ghl-signature/);
  assert.match(route, /GHL_WEBHOOK_PUBLIC_KEY/);
  assert.match(route, /x-wh-signature/);
  assert.match(route, /GHL_WEBHOOK_LEGACY_PUBLIC_KEY/);
  assert.match(route, /Invalid GoHighLevel webhook signature/);
  assert.match(route, /queueGhlWebhookSync/);
  assert.match(route, /writesToGhl: false/);
  assert.ok(GHL_SUPPORTED_WEBHOOK_EVENTS.includes("ContactCreate"));
  assert.ok(GHL_SUPPORTED_WEBHOOK_EVENTS.includes("AppointmentUpdate"));
  assert.ok(GHL_SUPPORTED_WEBHOOK_EVENTS.includes("OpportunityUpdate"));
});

test("Phase 21C continuous incremental sync is scheduled as bounded one-object read syncs", () => {
  const syncRoute = readFileSync(new URL("../../../app/api/integrations/gohighlevel/sync/route.ts", import.meta.url), "utf8");
  const importer = readFileSync(new URL("./importer.ts", import.meta.url), "utf8");
  const actions = readFileSync(new URL("../../../app/gohighlevel-actions.ts", import.meta.url), "utf8");
  const forms = readFileSync(new URL("../../../components/crm/GoHighLevelForms.tsx", import.meta.url), "utf8");
  const packageJson = readFileSync(new URL("../../../package.json", import.meta.url), "utf8");
  assert.match(syncRoute, /queueIncremental/);
  assert.match(syncRoute, /queueDueGhlIncrementalReconciliation/);
  assert.match(importer, /syncType: "webhook" \| "incremental"/);
  assert.match(importer, /finalizeOneObjectRunIfDone/);
  assert.match(importer, /incremental_since/);
  assert.match(importer, /incremental_checkpoint_page_token/);
  assert.match(importer, /GHL_INCREMENTAL_MAX_PAGES_PER_OBJECT/);
  assert.match(importer, /drift_reconciliation/);
  assert.match(importer, /fanOut: objectType === "appointment" \|\| objectType === "message"/);
  assert.doesNotMatch(importer, /getOpportunities\(\{ pageToken: job\.page_token, query:/);
  assert.doesNotMatch(importer, /field: "updatedAt"/);
  assert.match(actions, /runGhlIncrementalSyncNowAction/);
  assert.match(forms, /Run Incremental Sync Now/);
  assert.match(packageJson, /ghl:continuous-worker/);
  assert.doesNotMatch(importer, /\.eq\("provider", "gohighlevel"\)/);
  assert.deepEqual(GHL_INCREMENTAL_RECONCILIATION_SCHEDULE.map((item) => `${item.objectType}:${item.everyMinutes}`), [
    "appointment:2",
    "opportunity:5",
    "contact:5",
    "conversation:5",
    "message:5",
    "transaction:15",
    "order:15",
    "calendar:30",
    "user:30",
    "custom_field:30",
    "tag:30",
    "pipeline:30"
  ]);
  assert.equal(GHL_DRIFT_RECONCILIATION_EVERY_MINUTES, 360);
  assert.equal(GHL_INCREMENTAL_APPOINTMENT_LOOKBACK_MINUTES, 20160);
  assert.equal(GHL_INCREMENTAL_APPOINTMENT_LOOKAHEAD_MINUTES, 532800);
  assert.equal(GHL_INCREMENTAL_MAX_PAGES_PER_OBJECT, 5);
  assert.deepEqual(getGhlIncrementalSchedule({ GHL_SYNC_APPOINTMENT_EVERY_MINUTES: "3" }).find((item) => item.objectType === "appointment"), {
    objectType: "appointment",
    everyMinutes: 3,
    envKey: "GHL_SYNC_APPOINTMENT_EVERY_MINUTES"
  });
  assert.equal(getGhlDriftReconciliationEveryMinutes({ GHL_DRIFT_RECONCILIATION_EVERY_MINUTES: "120" }), 120);
});

test("Phase 21B GHL transport remains read-only and exposes setup UI", () => {
  const client = readFileSync(new URL("./client.ts", import.meta.url), "utf8");
  const settingsPage = readFileSync(new URL("../../../app/(crm)/settings/integrations/gohighlevel/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(client, /method:\s*"PATCH"/);
  assert.doesNotMatch(client, /method:\s*"PUT"/);
  assert.doesNotMatch(client, /method:\s*"DELETE"/);
  assert.match(client, /method:\s*"POST"/);
  assert.match(client, /\/contacts\/search/);
  assert.match(settingsPage, /Webhook Callback URL/);
  assert.match(settingsPage, /Signature Verification/);
  assert.match(settingsPage, /Manual HighLevel Event Checklist/);
  assert.match(settingsPage, /Incremental Polling/);
  assert.match(settingsPage, /Continuous Read-Only Sync/);
});

test("Phase 21B.1 OAuth install URL construction is deterministic and scoped", () => {
  const state = "state_123";
  const url = buildGhlOAuthInstallUrl({ state, env: oauthEnv(), scopes: ["contacts.readonly", "calendars.readonly"] });
  assert.equal(`${url.origin}${url.pathname}`, GHL_OAUTH_AUTHORIZE_URL);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_id"), "client_123");
  assert.equal(url.searchParams.get("redirect_uri"), "http://localhost:3000/api/integrations/gohighlevel/oauth/callback");
  assert.equal(url.searchParams.get("scope"), "contacts.readonly calendars.readonly");
  assert.equal(url.searchParams.get("state"), state);
  assert.ok(GHL_OAUTH_SCOPES.includes("contacts.readonly"));
  assert.ok(GHL_OAUTH_SCOPES.includes("calendars/events.readonly"));
});

test("Phase 21B.1 OAuth state accepts valid state and rejects invalid expired or reused state", async () => {
  const validRow = {
    id: "state-row",
    organization_id: "org",
    location_id: "loc",
    ghl_connection_id: "conn",
    state_hash: hashOAuthState("valid-state"),
    redirect_uri: "http://localhost:3000/api/integrations/gohighlevel/oauth/callback",
    expected_ghl_location_id: GHL_MIAMI_EXPECTED_LOCATION_ID,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    used_at: null,
    status: "pending"
  };
  const validDb = stateSupabase(validRow);
  assert.equal((await consumeGhlOAuthState(validDb, "valid-state")).id, "state-row");
  assert.equal(validDb.updates[0].status, "used");

  await assert.rejects(() => consumeGhlOAuthState(stateSupabase(null), "missing"), /Invalid GoHighLevel OAuth state/);
  await assert.rejects(() => consumeGhlOAuthState(stateSupabase({ ...validRow, used_at: new Date().toISOString() }), "valid-state"), /already used/);
  await assert.rejects(() => consumeGhlOAuthState(stateSupabase({ ...validRow, expires_at: new Date(Date.now() - 60_000).toISOString() }), "valid-state"), /expired/);
});

test("Phase 21B.1 OAuth token encryption is server-only and reversible with the configured key", () => {
  const key = oauthEnv().GHL_OAUTH_ENCRYPTION_KEY;
  const encrypted = encryptGhlOAuthSecret("access-token-value", key);
  assert.notEqual(encrypted.includes("access-token-value"), true);
  assert.equal(decryptGhlOAuthSecret(encrypted, key), "access-token-value");
  assert.throws(() => encryptGhlOAuthSecret("token", "short"), /32 bytes/);
});

test("Phase 21B.1 OAuth code exchange and refresh use the token endpoint without exposing secrets", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init, body: String(init.body) });
    return new Response(JSON.stringify({ access_token: "access-1", refresh_token: "refresh-2", expires_in: 3600, locationId: GHL_MIAMI_EXPECTED_LOCATION_ID, scope: "contacts.readonly calendars.readonly" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  try {
    await exchangeGhlOAuthCode("code-123", oauthEnv());
    await refreshGhlOAuthToken("refresh-1", oauthEnv());
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(requests[0].url, GHL_OAUTH_TOKEN_URL);
  assert.match(requests[0].body, /grant_type=authorization_code/);
  assert.match(requests[0].body, /code=code-123/);
  assert.equal(requests[1].url, GHL_OAUTH_TOKEN_URL);
  assert.match(requests[1].body, /grant_type=refresh_token/);
  assert.match(requests[1].body, /refresh_token=refresh-1/);
});

test("Phase 21B.1 OAuth due-refresh guard skips missing config and is wired into the worker", async () => {
  assert.equal(ghlOAuthRefreshConfigurationPresent(oauthEnv()), true);
  assert.equal(ghlOAuthRefreshConfigurationPresent({}), false);

  const skipped = await refreshDueGhlOAuthInstallations({}, { env: {} });
  assert.deepEqual(skipped, {
    checked: 0,
    due: 0,
    refreshed: 0,
    failed: 0,
    skippedReason: "oauth_configuration_missing"
  });

  const syncRoute = readFileSync(new URL("../../../app/api/integrations/gohighlevel/sync/route.ts", import.meta.url), "utf8");
  assert.match(syncRoute, /refreshDueGhlOAuthInstallations/);
  assert.match(syncRoute, /GHL_OAUTH_REFRESH_ENABLED/);
  assert.match(syncRoute, /oauth_refresh_disabled/);
  assert.match(syncRoute, /oauthRefresh/);
});

test("Phase 21B.1 OAuth due-refresh scanner finds expiring healthy installations", async () => {
  const queriedTables = [];
  const supabase = {
    from(table) {
      queriedTables.push(table);
      return {
        select() { return this; },
        eq() { return this; },
        not() { return this; },
        order() { return this; },
        async limit() {
          return {
            data: [{ id: "install-future", access_token_expires_at: "2026-08-15T12:05:00.000Z" }],
            error: null
          };
        }
      };
    }
  };

  const report = await refreshDueGhlOAuthInstallations(supabase, {
    env: oauthEnv(),
    now: new Date("2026-08-15T12:00:00.000Z"),
    thresholdMs: 60_000
  });
  assert.deepEqual(report, {
    checked: 1,
    due: 0,
    refreshed: 0,
    failed: 0,
    skippedReason: null
  });
  assert.deepEqual(queriedTables, ["ghl_oauth_installations"]);
});

test("Phase 21B.1 OAuth location info uses read-only bearer lookup", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return new Response(JSON.stringify({ locationId: GHL_MIAMI_EXPECTED_LOCATION_ID }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await fetchGhlOAuthLocationInfo("access-token");
    assert.equal(result.locationId, GHL_MIAMI_EXPECTED_LOCATION_ID);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(requests[0].url, GHL_OAUTH_LOCATION_INFO_URL);
  assert.equal(requests[0].init.method, "GET");
  assert.equal(requests[0].init.headers.authorization, "Bearer access-token");
});

test("Phase 21B.1 OAuth migration keeps token credentials outside client-readable metadata", () => {
  const migration = readFileSync(new URL("../../../supabase/migrations/20260815013000_phase_21b1_gohighlevel_oauth_installation.sql", import.meta.url), "utf8");
  assert.match(migration, /create table if not exists public\.ghl_oauth_installations/);
  assert.match(migration, /create table if not exists public\.ghl_oauth_credentials/);
  assert.match(migration, /encrypted_access_token text not null/);
  assert.match(migration, /No client-facing policies are created for public\.ghl_oauth_credentials/);
  assert.doesNotMatch(migration, /create policy .* on public\.ghl_oauth_credentials/i);
});

test("Phase 21B.1 OAuth routes and UI are present without token display", () => {
  const installRoute = readFileSync(new URL("../../../app/api/integrations/gohighlevel/oauth/install/route.ts", import.meta.url), "utf8");
  const callbackRoute = readFileSync(new URL("../../../app/api/integrations/gohighlevel/oauth/callback/route.ts", import.meta.url), "utf8");
  const refreshRoute = readFileSync(new URL("../../../app/api/integrations/gohighlevel/oauth/refresh/route.ts", import.meta.url), "utf8");
  const settingsPage = readFileSync(new URL("../../../app/(crm)/settings/integrations/gohighlevel/page.tsx", import.meta.url), "utf8");
  assert.match(installRoute, /createGhlOAuthState/);
  assert.match(callbackRoute, /storeGhlOAuthInstallation/);
  assert.match(callbackRoute, /location_mismatch/);
  assert.match(refreshRoute, /requireInternalRequest/);
  assert.match(settingsPage, /Install HighLevel Webhooks/);
  assert.match(settingsPage, /Reconnect HighLevel App/);
  assert.doesNotMatch(settingsPage, /encrypted_access_token|encrypted_refresh_token|refresh_token/);
});

test("Phase 21B.1 OAuth uninstall preserves historical data and marks installation inactive", () => {
  const oauth = readFileSync(new URL("./oauth.ts", import.meta.url), "utf8");
  const webhookRoute = readFileSync(new URL("../../../app/api/integrations/gohighlevel/webhook/route.ts", import.meta.url), "utf8");
  assert.match(oauth, /status: "uninstalled"/);
  assert.match(oauth, /Historical imported data preserved/);
  assert.doesNotMatch(oauth, /\.from\("contacts"\)\.delete/);
  assert.doesNotMatch(oauth, /\.from\("appointments"\)\.delete/);
  assert.match(webhookRoute, /handleGhlOAuthLifecycleEvent/);
});

test("permissions restrict token/settings management", () => {
  assert.equal(hasGhlPermission({ role: "owner" }, "integrations.ghl.credentials.manage"), true);
  assert.equal(hasGhlPermission({ role: "manager" }, "integrations.ghl.read"), true);
  assert.equal(hasGhlPermission({ role: "manager" }, "integrations.ghl.credentials.manage"), false);
  assert.equal(hasGhlPermission({ role: "salesperson" }, "integrations.ghl.read"), false);
  assert.equal(ghlLocationAllowed({ role: "manager", locations: [{ id: "loc-a", name: "Miami", slug: "miami" }] }, "loc-a"), true);
  assert.equal(ghlLocationAllowed({ role: "manager", locations: [{ id: "loc-a", name: "Miami", slug: "miami" }] }, "loc-b"), false);
});
