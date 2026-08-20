import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentProfile } from "@/lib/auth/profile";
import { isMockGhlConnection, tokenPresentForConnection } from "./auth.ts";
import { GhlReadOnlyClient } from "./client.ts";
import { GHL_PROVIDER, assertGhlReadMode } from "./config.ts";
import { GhlIntegrationError, safeGhlError } from "./errors.ts";
import { checksum, normalizeAppointment, normalizeContact, normalizeEmail, normalizeMessage } from "./normalization.ts";
import { retryDelayMs } from "./rate-limit.ts";
import type { GhlAppointment, GhlCalendar, GhlConnection, GhlContact, GhlConversation, GhlMessage, GhlOpportunity, GhlPage } from "./types.ts";

export const FULL_IMPORT_PAGE_SIZE = 100;
export const FULL_IMPORT_RECORD_BATCH_SIZE = 50;
export const FULL_IMPORT_APPOINTMENT_CALENDAR_BATCH_SIZE = 1;
export const FULL_IMPORT_MESSAGE_CONVERSATION_BATCH_SIZE = 20;
export const FULL_IMPORT_MAX_ATTEMPTS = 5;
export const FULL_IMPORT_MAX_JOBS_PER_INVOCATION = 5;
export const FULL_IMPORT_STALE_LOCK_MS = 15 * 60 * 1000;
export const FULL_IMPORT_HEARTBEAT_MS = 30 * 1000;
export const GHL_INCREMENTAL_RECONCILIATION_SCHEDULE = [
  { objectType: "appointment", everyMinutes: 2, envKey: "GHL_SYNC_APPOINTMENT_EVERY_MINUTES" },
  { objectType: "opportunity", everyMinutes: 5, envKey: "GHL_SYNC_OPPORTUNITY_EVERY_MINUTES" },
  { objectType: "contact", everyMinutes: 5, envKey: "GHL_SYNC_CONTACT_EVERY_MINUTES" },
  { objectType: "conversation", everyMinutes: 5, envKey: "GHL_SYNC_CONVERSATION_EVERY_MINUTES" },
  { objectType: "message", everyMinutes: 5, envKey: "GHL_SYNC_MESSAGE_EVERY_MINUTES" },
  { objectType: "transaction", everyMinutes: 15, envKey: "GHL_SYNC_TRANSACTION_EVERY_MINUTES" },
  { objectType: "order", everyMinutes: 15, envKey: "GHL_SYNC_ORDER_EVERY_MINUTES" },
  { objectType: "calendar", everyMinutes: 30, envKey: "GHL_SYNC_CALENDAR_EVERY_MINUTES" },
  { objectType: "user", everyMinutes: 30, envKey: "GHL_SYNC_USER_EVERY_MINUTES" },
  { objectType: "custom_field", everyMinutes: 30, envKey: "GHL_SYNC_CUSTOM_FIELD_EVERY_MINUTES" },
  { objectType: "tag", everyMinutes: 30, envKey: "GHL_SYNC_TAG_EVERY_MINUTES" },
  { objectType: "pipeline", everyMinutes: 30, envKey: "GHL_SYNC_PIPELINE_EVERY_MINUTES" }
] as const;
export const GHL_DRIFT_RECONCILIATION_EVERY_MINUTES = 6 * 60;
export const GHL_INCREMENTAL_APPOINTMENT_LOOKBACK_MINUTES = 60 * 24 * 14;
export const GHL_INCREMENTAL_APPOINTMENT_LOOKAHEAD_MINUTES = 60 * 24 * 370;
export const GHL_INCREMENTAL_MAX_PAGES_PER_OBJECT = 5;
export const RESUMABLE_FULL_IMPORT_STATUSES = ["queued", "running", "partial", "failed", "cancelled"] as const;
const ACTIVE_JOB_STATUSES = ["queued", "locked", "running"];
const INTERRUPTED_JOB_STATUSES = ["failed", "dead_letter"];
const TARGETED_RETRY_OBJECT_STATUSES = ["open", "review"];

export type GhlImportObjectType =
  | "location_metadata"
  | "user"
  | "custom_field"
  | "tag"
  | "contact"
  | "pipeline"
  | "opportunity"
  | "calendar"
  | "appointment"
  | "conversation"
  | "message"
  | "transaction"
  | "order"
  | "reconciliation";

export const FULL_IMPORT_OBJECT_ORDER: GhlImportObjectType[] = [
  "location_metadata",
  "user",
  "custom_field",
  "tag",
  "contact",
  "pipeline",
  "opportunity",
  "calendar",
  "appointment",
  "conversation",
  "message",
  "transaction",
  "order",
  "reconciliation"
];

type SyncJobRow = {
  id: string;
  organization_id: string;
  connection_id: string;
  sync_run_id: string;
  object_type: GhlImportObjectType;
  cursor_value: string | null;
  page_token: string | null;
  status: string;
  attempts: number;
  metadata_safe: Record<string, unknown> | null;
};

type SyncRunRow = {
  id: string;
  organization_id: string;
  connection_id: string;
  sync_type?: string | null;
  status: string;
  records_fetched: number;
  records_created: number;
  records_updated: number;
  records_unchanged: number;
  records_skipped: number;
  records_failed: number;
  pages_fetched: number;
  metadata_safe: Record<string, unknown> | null;
};

type MappingRow = {
  id: string;
  external_object_type: string;
  external_id: string;
  internal_object_type: string;
  internal_id: string;
  checksum: string | null;
  metadata_safe: Record<string, unknown> | null;
};

type ImportCounts = {
  fetched: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
  pages: number;
};

type PageResult = {
  counts: ImportCounts;
  nextPageToken: string | null;
  pageMetadata: Record<string, unknown>;
};

type WorkerResult = {
  claimed: number;
  completed: number;
  retried: number;
  failed: number;
  queuedNext: number;
  diagnostics: string[];
};

const zeroCounts = (): ImportCounts => ({ fetched: 0, created: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0, pages: 0 });

function text(value: unknown) {
  return String(value ?? "").trim();
}

function record(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function array(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function positiveIntegerText(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const numeric = Number(raw);
  return Number.isInteger(numeric) && numeric > 0 ? String(numeric) : null;
}

export function normalizeOpportunityJobPageToken(pageToken: unknown, fallbackPage = 1) {
  const numeric = positiveIntegerText(pageToken);
  if (numeric) return numeric;
  if (!text(pageToken)) return String(fallbackPage);
  throw new Error(`Invalid GHL opportunity page token '${text(pageToken).slice(0, 32)}'. Opportunity jobs must use numeric page tokens.`);
}

function externalId(value: unknown) {
  const row = record(value);
  return text(row.id ?? row._id ?? row.eventId ?? row.transactionId ?? row.orderId);
}

function dateOrNull(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function moneyToCents(value: unknown) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.round(numeric > 100_000 ? numeric : numeric * 100);
}

function boundedError(value: unknown) {
  return text(value).slice(0, 500) || "Unknown GoHighLevel import error";
}

function positiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getGhlIncrementalSchedule(env: NodeJS.ProcessEnv = process.env) {
  return GHL_INCREMENTAL_RECONCILIATION_SCHEDULE.map((item) => ({
    objectType: item.objectType,
    everyMinutes: positiveInteger(env[item.envKey], item.everyMinutes),
    envKey: item.envKey
  }));
}

export function getGhlDriftReconciliationEveryMinutes(env: NodeJS.ProcessEnv = process.env) {
  return positiveInteger(env.GHL_DRIFT_RECONCILIATION_EVERY_MINUTES, GHL_DRIFT_RECONCILIATION_EVERY_MINUTES);
}

function endpointSummary<T>(page: GhlPage<T>) {
  return {
    endpoint: page.endpoint ?? null,
    http_status: page.httpStatus ?? null,
    request_method: page.requestMethod ?? null,
    api_version: page.apiVersion ?? null,
    query_parameter_names: page.queryParameterNames ?? [],
    response_keys: page.responseKeys ?? [],
    parser_warnings: page.parserWarnings ?? []
  };
}

export function nextFullImportPageToken<T>(page: GhlPage<T>) {
  return page.hasMore ? (page.nextPageToken ?? page.cursor ?? null) : null;
}

export function fullImportObjectEnabled(connection: GhlConnection, objectType: GhlImportObjectType) {
  if (objectType === "location_metadata" || objectType === "reconciliation") return true;
  const keyByObject: Record<string, string> = {
    user: "users",
    custom_field: "custom_fields",
    tag: "tags",
    contact: "contacts",
    pipeline: "pipelines",
    opportunity: "opportunities",
    calendar: "calendars",
    appointment: "appointments",
    conversation: "conversations",
    message: "messages",
    transaction: "payments",
    order: "payments"
  };
  const key = keyByObject[objectType] ?? objectType;
  return connection.objects_enabled?.[key] !== false;
}

export function fullImportProgressPercent(run: Pick<SyncRunRow, "metadata_safe">) {
  const metadata = run.metadata_safe ?? {};
  const currentIndex = Number(metadata.current_object_index ?? 0);
  const objectCount = Number(metadata.object_count ?? FULL_IMPORT_OBJECT_ORDER.length);
  if (!Number.isFinite(currentIndex) || !Number.isFinite(objectCount) || objectCount <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((currentIndex / objectCount) * 100)));
}

function resumableFullImportStatuses() {
  return [...RESUMABLE_FULL_IMPORT_STATUSES] as string[];
}

export function fullImportRunLooksIncomplete(run: Pick<SyncRunRow, "status" | "metadata_safe">) {
  const metadata = run.metadata_safe ?? {};
  if (run.status === "succeeded") return false;
  if (metadata.historical_import_complete === true) return false;
  return true;
}

export function resumePageTokenFromRun(run: Pick<SyncRunRow, "metadata_safe">) {
  const metadata = run.metadata_safe ?? {};
  const cursor = text(metadata.current_cursor);
  if (cursor) return cursor;
  const page = text(metadata.current_page);
  if (page && page !== "first" && page !== "none") return page;
  return null;
}

export function fullImportRecordBatchCount(recordCount: number, batchSize = FULL_IMPORT_RECORD_BATCH_SIZE) {
  if (!Number.isFinite(recordCount) || recordCount <= 0) return 0;
  return Math.ceil(recordCount / batchSize);
}

function minutesFromEnv(name: string, fallback: number) {
  return positiveInteger(process.env[name], fallback);
}

function appointmentWindow(input: { incrementalSince?: string | null; driftReconciliation?: boolean } = {}) {
  const start = new Date();
  const end = new Date();
  if (input.incrementalSince && !input.driftReconciliation) {
    const since = new Date(input.incrementalSince);
    const lookbackMinutes = minutesFromEnv("GHL_SYNC_APPOINTMENT_LOOKBACK_MINUTES", GHL_INCREMENTAL_APPOINTMENT_LOOKBACK_MINUTES);
    start.setTime(Number.isNaN(since.getTime()) ? Date.now() - lookbackMinutes * 60 * 1000 : since.getTime() - lookbackMinutes * 60 * 1000);
    end.setTime(Date.now() + minutesFromEnv("GHL_SYNC_APPOINTMENT_LOOKAHEAD_MINUTES", GHL_INCREMENTAL_APPOINTMENT_LOOKAHEAD_MINUTES) * 60 * 1000);
  } else {
    start.setFullYear(start.getFullYear() - 20);
    end.setFullYear(end.getFullYear() + 5);
  }
  return { startTime: start.getTime(), endTime: end.getTime() };
}

async function insertEvent(supabase: SupabaseClient, run: SyncRunRow, connection: GhlConnection, objectType: string, externalIdValue: string | null, action: string, result: string, reason: string | null = null, metadata: Record<string, unknown> = {}) {
  await supabase.from("ghl_sync_events").insert({
    organization_id: run.organization_id,
    connection_id: connection.id,
    sync_run_id: run.id,
    object_type: objectType,
    external_id: externalIdValue,
    action,
    result,
    reason,
    metadata_safe: metadata
  });
}

async function recordException(
  supabase: SupabaseClient,
  run: SyncRunRow,
  connection: GhlConnection,
  input: {
    exceptionType: string;
    objectType: string;
    externalId: string | null;
    severity?: "info" | "warning" | "critical";
    summary: string;
    metadata?: Record<string, unknown>;
  }
) {
  const { data: existing } = await supabase
    .from("ghl_sync_exceptions")
    .select("id")
    .eq("connection_id", connection.id)
    .eq("exception_type", input.exceptionType)
    .eq("object_type", input.objectType)
    .eq("external_id", input.externalId ?? "")
    .in("status", ["open", "review"])
    .limit(1);
  if ((existing ?? []).length > 0) return;
  await supabase.from("ghl_sync_exceptions").insert({
    organization_id: run.organization_id,
    location_id: connection.location_id,
    connection_id: connection.id,
    sync_run_id: run.id,
    exception_type: input.exceptionType,
    object_type: input.objectType,
    external_id: input.externalId,
    severity: input.severity ?? "warning",
    summary: input.summary,
    metadata_safe: { phase: 21, import_run_id: run.id, ...(input.metadata ?? {}) }
  });
}

async function findMapping(supabase: SupabaseClient, connection: GhlConnection, objectType: string, externalIdValue: string) {
  const { data } = await supabase
    .from("external_record_mappings")
    .select("*")
    .eq("connection_id", connection.id)
    .eq("external_object_type", objectType)
    .eq("external_id", externalIdValue)
    .maybeSingle();
  return (data ?? null) as MappingRow | null;
}

async function upsertMapping(
  supabase: SupabaseClient,
  run: SyncRunRow,
  connection: GhlConnection,
  input: {
    objectType: string;
    externalId: string;
    internalObjectType: string;
    internalId: string;
    externalUpdatedAt?: string | null;
    checksum?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  const existing = await findMapping(supabase, connection, input.objectType, input.externalId);
  const payload = {
    organization_id: run.organization_id,
    location_id: connection.location_id,
    provider: GHL_PROVIDER,
    connection_id: connection.id,
    external_object_type: input.objectType,
    external_id: input.externalId,
    internal_object_type: input.internalObjectType,
    internal_id: input.internalId,
    external_updated_at: input.externalUpdatedAt ?? null,
    last_synced_at: new Date().toISOString(),
    checksum: input.checksum ?? null,
    metadata_safe: { phase: 21, read_only_import: true, ...(input.metadata ?? {}) }
  };
  const { error } = await supabase.from("external_record_mappings").upsert(payload, { onConflict: "connection_id,external_object_type,external_id" });
  if (error) throw new Error(error.message);
  return existing ? "updated" : "created";
}

async function resolveImportExceptions(supabase: SupabaseClient, run: SyncRunRow, connection: GhlConnection, objectType: string, externalIdValue: string, exceptionTypes: string[], notes: string) {
  if (!externalIdValue) return;
  await supabase
    .from("ghl_sync_exceptions")
    .update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
      resolution_notes: notes.slice(0, 500)
    })
    .eq("sync_run_id", run.id)
    .eq("connection_id", connection.id)
    .eq("object_type", objectType)
    .eq("external_id", externalIdValue)
    .in("exception_type", exceptionTypes)
    .in("status", TARGETED_RETRY_OBJECT_STATUSES);
}

async function linkedUserId(supabase: SupabaseClient, connection: GhlConnection, externalUserId: unknown) {
  const id = text(externalUserId);
  if (!id) return null;
  const { data } = await supabase
    .from("ghl_user_mappings")
    .select("internal_user_id, linked")
    .eq("connection_id", connection.id)
    .eq("external_user_id", id)
    .maybeSingle();
  return data?.linked ? data.internal_user_id as string | null : null;
}

async function ensureImportedAppointmentType(supabase: SupabaseClient, run: SyncRunRow, connection: GhlConnection) {
  const name = "GHL Imported Appointment";
  const { data: existing } = await supabase
    .from("appointment_types")
    .select("id")
    .eq("organization_id", run.organization_id)
    .eq("name", name)
    .maybeSingle();
  if (existing?.id) return String(existing.id);
  const { data, error } = await supabase
    .from("appointment_types")
    .insert({
      organization_id: run.organization_id,
      default_location_id: connection.location_id,
      name,
      duration_minutes: 30,
      active: true,
      category: "GoHighLevel Import",
      description: "Read-only mirrored appointment type for imported GHL events."
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return String(data.id);
}

async function appointmentTypeForGhlCalendar(supabase: SupabaseClient, run: SyncRunRow, connection: GhlConnection, externalCalendarId: string | null) {
  if (!externalCalendarId) return ensureImportedAppointmentType(supabase, run, connection);
  const { data, error } = await supabase
    .from("ghl_calendar_type_mappings")
    .select("appointment_type_id")
    .eq("connection_id", connection.id)
    .eq("external_calendar_id", externalCalendarId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.appointment_type_id ? String(data.appointment_type_id) : ensureImportedAppointmentType(supabase, run, connection);
}

async function ensureTag(supabase: SupabaseClient, run: SyncRunRow, connection: GhlConnection, name: string, externalTagId: string | null = null) {
  const cleanName = name.slice(0, 120);
  if (!cleanName) return null;
  const { data: existing } = await supabase.from("tags").select("id").eq("organization_id", run.organization_id).eq("name", cleanName).maybeSingle();
  if (existing?.id) {
    if (externalTagId) await upsertMapping(supabase, run, connection, { objectType: "tag", externalId: externalTagId, internalObjectType: "tags", internalId: String(existing.id), metadata: { name: cleanName } });
    return String(existing.id);
  }
  const { data, error } = await supabase.from("tags").insert({ organization_id: run.organization_id, name: cleanName, color: "#5b7cfa" }).select("id").single();
  if (error) throw new Error(error.message);
  if (externalTagId) await upsertMapping(supabase, run, connection, { objectType: "tag", externalId: externalTagId, internalObjectType: "tags", internalId: String(data.id), metadata: { name: cleanName } });
  return String(data.id);
}

type ContactMatchResult =
  | { status: "none"; contactId: null; matchedBy: null }
  | { status: "matched"; contactId: string; matchedBy: "email" | "phone" | "email_phone" }
  | { status: "ambiguous"; contactId: null; matchedBy: "email" | "phone" | "email_phone"; candidateCount: number };

function uniqueIds(rows: Array<{ id: string }> | null | undefined) {
  return [...new Set((rows ?? []).map((row) => String(row.id)).filter(Boolean))];
}

async function findExactContactMatch(supabase: SupabaseClient, run: SyncRunRow, normalized: { email: string | null; phone: string | null }): Promise<ContactMatchResult> {
  const [emailResult, phoneResult] = await Promise.all([
    normalized.email
      ? supabase.from("contacts").select("id").eq("organization_id", run.organization_id).eq("email", normalized.email).limit(3)
      : Promise.resolve({ data: [] }),
    normalized.phone
      ? supabase.from("contacts").select("id").eq("organization_id", run.organization_id).eq("phone", normalized.phone).limit(3)
      : Promise.resolve({ data: [] })
  ]);
  const emailIds = uniqueIds(emailResult.data as Array<{ id: string }> | null);
  const phoneIds = uniqueIds(phoneResult.data as Array<{ id: string }> | null);
  const allIds = [...new Set([...emailIds, ...phoneIds])];

  if (allIds.length === 0) return { status: "none", contactId: null, matchedBy: null };
  if (allIds.length > 1) {
    const matchedBy = emailIds.length && phoneIds.length ? "email_phone" : emailIds.length ? "email" : "phone";
    return { status: "ambiguous", contactId: null, matchedBy, candidateCount: allIds.length };
  }
  const matchedBy = emailIds.length && phoneIds.length ? "email_phone" : emailIds.length ? "email" : "phone";
  return { status: "matched", contactId: allIds[0], matchedBy };
}

function contactUpdatePayload(normalized: ReturnType<typeof normalizeContact>, assignedTo: string | null, locationId: string | null) {
  return {
    first_name: normalized.first_name,
    last_name: normalized.last_name,
    ...(normalized.email ? { email: normalized.email } : {}),
    ...(normalized.phone ? { phone: normalized.phone } : {}),
    lead_source: normalized.lead_source,
    status: normalized.status,
    assigned_to: assignedTo,
    location_id: locationId,
    last_activity_at: normalized.external_updated_at
  };
}

function cleanTagName(value: unknown) {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (value && typeof value === "object") {
    const recordValue = value as Record<string, unknown>;
    const name = recordValue.name ?? recordValue.label;
    return typeof name === "string" || typeof name === "number" ? String(name).trim() : "";
  }
  return "";
}

function safeDbErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? "Unknown database error");
}

function contactFailureClassification(error: unknown) {
  const message = safeDbErrorMessage(error);
  const lower = message.toLowerCase();
  if (lower.includes("duplicate key") || lower.includes("unique constraint")) {
    return { exceptionType: "duplicate_contact", rootCause: "unique_constraint", summary: "Local contact uniqueness constraint prevented this GHL contact from importing." };
  }
  if (lower.includes("invalid input syntax") && lower.includes("timestamp")) {
    return { exceptionType: "api_unsupported", rootCause: "invalid_timestamp", summary: "GHL contact included an invalid timestamp value." };
  }
  if (lower.includes("invalid input syntax") && lower.includes("uuid")) {
    return { exceptionType: "api_unsupported", rootCause: "invalid_uuid_reference", summary: "GHL contact referenced an invalid internal identifier." };
  }
  if (lower.includes("violates row-level security") || lower.includes("permission denied")) {
    return { exceptionType: "api_unsupported", rootCause: "rls_or_permission", summary: "Database permissions prevented this GHL contact from importing." };
  }
  if (lower.includes("violates not-null constraint") || lower.includes("null value in column")) {
    return { exceptionType: "api_unsupported", rootCause: "required_internal_column_missing", summary: "A required local contact column was missing after normalization." };
  }
  return { exceptionType: "api_unsupported", rootCause: "database_or_normalization_error", summary: "Local database rejected this GHL contact after normalization." };
}

async function recordContactFailure(supabase: SupabaseClient, run: SyncRunRow, connection: GhlConnection, externalIdValue: string, error: unknown) {
  const classification = contactFailureClassification(error);
  await recordException(supabase, run, connection, {
    exceptionType: classification.exceptionType,
    objectType: "contact",
    externalId: externalIdValue,
    summary: classification.summary,
    metadata: {
      root_cause: classification.rootCause,
      safe_error: safeGhlError(error)
    }
  });
}

async function processContact(supabase: SupabaseClient, run: SyncRunRow, connection: GhlConnection, contact: GhlContact) {
  const id = externalId(contact);
  if (!id) return "skipped";
  const normalized = normalizeContact(contact);
  const mapping = await findMapping(supabase, connection, "contact", id);
  const assignedTo = await linkedUserId(supabase, connection, contact.assignedTo);
  let contactId = mapping?.internal_id ?? null;
  let outcome: "created" | "updated" | "unchanged" | "skipped" = "unchanged";

  if (!contactId) {
    const match = await findExactContactMatch(supabase, run, normalized);
    if (match.status === "ambiguous") {
      await recordException(supabase, run, connection, {
        exceptionType: "duplicate_contact",
        objectType: "contact",
        externalId: id,
        summary: `GHL contact matched multiple local contacts by exact ${match.matchedBy}.`,
        metadata: { root_cause: "ambiguous_exact_match", matched_by: match.matchedBy, candidate_count: match.candidateCount }
      });
      return "skipped";
    }
    if (match.status === "matched") {
      contactId = match.contactId;
      outcome = "updated";
    }
  }

  try {
    if (contactId) {
      const { error } = await supabase.from("contacts").update(contactUpdatePayload(normalized, assignedTo, connection.location_id)).eq("id", contactId).eq("organization_id", run.organization_id);
      if (error) throw new Error(error.message);
    } else {
      const { data, error } = await supabase.from("contacts").insert({
        organization_id: run.organization_id,
        location_id: connection.location_id,
        assigned_to: assignedTo,
        first_name: normalized.first_name,
        last_name: normalized.last_name,
        email: normalized.email,
        phone: normalized.phone,
        lead_source: normalized.lead_source,
        status: normalized.status,
        last_activity_at: normalized.external_updated_at
      }).select("id").single();
      if (error) throw new Error(error.message);
      contactId = String(data.id);
      outcome = "created";
    }
  } catch (error) {
    await recordContactFailure(supabase, run, connection, id, error);
    return "skipped";
  }

  await upsertMapping(supabase, run, connection, { objectType: "contact", externalId: id, internalObjectType: "contacts", internalId: contactId, externalUpdatedAt: normalized.external_updated_at, checksum: normalized.checksum, metadata: { matched_by: mapping ? "external_mapping" : outcome === "created" ? "created" : "exact_contact" } });
  await resolveImportExceptions(supabase, run, connection, "contact", id, ["api_unsupported", "missing_external_record", "duplicate_mapping"], "Resolved by targeted contact retry using the corrected importer.");
  const tags = Array.isArray(contact.tags) ? contact.tags : [];
  for (const tagName of tags) {
    try {
      const tagId = await ensureTag(supabase, run, connection, cleanTagName(tagName));
      if (!tagId) continue;
      const { error } = await supabase.from("contact_tags").upsert({ contact_id: contactId, tag_id: tagId }, { onConflict: "contact_id,tag_id" });
      if (error) throw new Error(error.message);
    } catch (error) {
      await recordException(supabase, run, connection, {
        exceptionType: "api_unsupported",
        objectType: "contact",
        externalId: id,
        severity: "info",
        summary: "GHL contact imported, but one tag could not be attached.",
        metadata: { root_cause: "tag_assignment_error", safe_error: safeGhlError(error) }
      });
    }
  }
  return outcome;
}

async function processUser(supabase: SupabaseClient, run: SyncRunRow, connection: GhlConnection, user: Record<string, unknown>) {
  const id = externalId(user);
  if (!id) return "skipped";
  const externalEmail = normalizeEmail(text(user.email));
  const externalName = text(user.name ?? user.fullName ?? [user.firstName, user.lastName].map(text).filter(Boolean).join(" ")) || "GHL User";
  const { data: localUser } = externalEmail
    ? await supabase.from("user_profiles").select("id").eq("organization_id", run.organization_id).eq("email", externalEmail).maybeSingle()
    : { data: null };
  const { data: existing } = await supabase.from("ghl_user_mappings").select("id").eq("connection_id", connection.id).eq("external_user_id", id).maybeSingle();
  const { error } = await supabase.from("ghl_user_mappings").upsert({
    organization_id: run.organization_id,
    connection_id: connection.id,
    external_user_id: id,
    internal_user_id: localUser?.id ?? null,
    external_name: externalName,
    external_email: externalEmail,
    linked: Boolean(localUser?.id)
  }, { onConflict: "connection_id,external_user_id" });
  if (error) throw new Error(error.message);
  await upsertMapping(supabase, run, connection, { objectType: "user", externalId: id, internalObjectType: localUser?.id ? "user_profiles" : "ghl_user_mappings", internalId: localUser?.id ?? connection.id, metadata: { external_name: externalName, linked: Boolean(localUser?.id) } });
  return existing ? "updated" : "created";
}

async function processCustomField(supabase: SupabaseClient, run: SyncRunRow, connection: GhlConnection, field: Record<string, unknown>) {
  const id = externalId(field);
  if (!id) return "skipped";
  const name = text(field.name ?? field.fieldName ?? field.label) || "GHL Custom Field";
  const { data: existing } = await supabase.from("ghl_custom_field_mappings").select("id").eq("connection_id", connection.id).eq("external_field_id", id).maybeSingle();
  const { error } = await supabase.from("ghl_custom_field_mappings").upsert({
    organization_id: run.organization_id,
    connection_id: connection.id,
    external_field_id: id,
    external_field_name: name,
    data_type: text(field.dataType ?? field.type) || "text",
    enabled: false
  }, { onConflict: "connection_id,external_field_id" });
  if (error) throw new Error(error.message);
  const { data: current } = await supabase.from("ghl_custom_field_mappings").select("id").eq("connection_id", connection.id).eq("external_field_id", id).single();
  await upsertMapping(supabase, run, connection, { objectType: "custom_field", externalId: id, internalObjectType: "ghl_custom_field_mappings", internalId: String(current?.id ?? connection.id), metadata: { external_field_name: name } });
  return existing ? "updated" : "created";
}

async function processPipeline(supabase: SupabaseClient, run: SyncRunRow, connection: GhlConnection, pipeline: Record<string, unknown>) {
  const id = externalId(pipeline);
  if (!id) return "skipped";
  const name = text(pipeline.name) || "GHL Pipeline";
  const { data: existing } = await supabase.from("pipelines").select("id").eq("organization_id", run.organization_id).eq("name", name).maybeSingle();
  let pipelineId = existing?.id ? String(existing.id) : null;
  const outcome: "created" | "updated" = existing?.id ? "updated" : "created";
  if (!pipelineId) {
    const { data, error } = await supabase.from("pipelines").insert({ organization_id: run.organization_id, name }).select("id").single();
    if (error) throw new Error(error.message);
    pipelineId = String(data.id);
  }
  await upsertMapping(supabase, run, connection, { objectType: "pipeline", externalId: id, internalObjectType: "pipelines", internalId: pipelineId, metadata: { name } });

  const stageRows = array(pipeline.stages).length ? array(pipeline.stages) : [{ id: `${id}:imported`, name: "Imported", position: 1 }];
  let position = 1;
  for (const stageValue of stageRows) {
    const stage = record(stageValue);
    const stageExternalId = externalId(stage) || `${id}:stage:${position}`;
    const stageName = text(stage.name) || `Imported ${position}`;
    const stagePosition = Number(stage.position ?? stage.order ?? position);
    const { data: existingStage } = await supabase.from("pipeline_stages").select("id").eq("pipeline_id", pipelineId).eq("name", stageName).maybeSingle();
    let stageId = existingStage?.id ? String(existingStage.id) : null;
    if (!stageId) {
      const { data, error } = await supabase.from("pipeline_stages").insert({
        organization_id: run.organization_id,
        pipeline_id: pipelineId,
        name: stageName,
        position: Number.isFinite(stagePosition) ? stagePosition : position,
        is_closed: Boolean(stage.isClosed),
        is_won: Boolean(stage.isWon)
      }).select("id").single();
      if (error) {
        const { data: fallback } = await supabase.from("pipeline_stages").select("id").eq("pipeline_id", pipelineId).eq("position", Number.isFinite(stagePosition) ? stagePosition : position).maybeSingle();
        if (!fallback?.id) throw new Error(error.message);
        stageId = String(fallback.id);
      } else {
        stageId = String(data.id);
      }
    }
    await upsertMapping(supabase, run, connection, { objectType: "pipeline_stage", externalId: stageExternalId, internalObjectType: "pipeline_stages", internalId: stageId, metadata: { pipeline_external_id: id, name: stageName } });
    position += 1;
  }
  return outcome;
}

async function processOpportunity(supabase: SupabaseClient, run: SyncRunRow, connection: GhlConnection, opportunity: GhlOpportunity) {
  const id = externalId(opportunity);
  if (!id) return "skipped";
  const contactMapping = opportunity.contactId ? await findMapping(supabase, connection, "contact", opportunity.contactId) : null;
  if (!contactMapping) {
    await recordException(supabase, run, connection, { exceptionType: "missing_contact_dependency", objectType: "opportunity", externalId: id, summary: "GHL opportunity has no imported contact mapping.", metadata: { contact_id: opportunity.contactId ?? null } });
    return "skipped";
  }
  const pipelineMapping = opportunity.pipelineId ? await findMapping(supabase, connection, "pipeline", opportunity.pipelineId) : null;
  if (!pipelineMapping) {
    await recordException(supabase, run, connection, { exceptionType: "missing_external_record", objectType: "opportunity", externalId: id, summary: "GHL opportunity has no imported pipeline mapping.", metadata: { pipeline_id: opportunity.pipelineId ?? null } });
    return "skipped";
  }
  const stageMapping = opportunity.stageId ? await findMapping(supabase, connection, "pipeline_stage", opportunity.stageId) : null;
  const { data: fallbackStage } = !stageMapping ? await supabase.from("pipeline_stages").select("id").eq("pipeline_id", pipelineMapping.internal_id).order("position").limit(1).maybeSingle() : { data: null };
  const stageId = stageMapping?.internal_id ?? fallbackStage?.id;
  if (!stageId) {
    await recordException(supabase, run, connection, { exceptionType: "missing_external_record", objectType: "opportunity", externalId: id, summary: "GHL opportunity has no usable stage mapping.", metadata: { stage_id: opportunity.stageId ?? null } });
    return "skipped";
  }
  const assignedTo = await linkedUserId(supabase, connection, opportunity.assignedUserId);
  const mapped = await findMapping(supabase, connection, "opportunity", id);
  const payload = {
    organization_id: run.organization_id,
    location_id: connection.location_id,
    contact_id: contactMapping.internal_id,
    pipeline_id: pipelineMapping.internal_id,
    stage_id: stageId,
    assigned_to: assignedTo,
    name: text(opportunity.name) || "GHL Opportunity",
    value_cents: moneyToCents(opportunity.value),
    status: ["open", "won", "lost"].includes(text(opportunity.status).toLowerCase()) ? text(opportunity.status).toLowerCase() : "open",
    last_activity_at: dateOrNull(opportunity.updatedAt)
  };
  let opportunityId = mapped?.internal_id ?? null;
  if (opportunityId) {
    const { error } = await supabase.from("opportunities").update(payload).eq("id", opportunityId).eq("organization_id", run.organization_id);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await supabase.from("opportunities").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    opportunityId = String(data.id);
  }
  await upsertMapping(supabase, run, connection, { objectType: "opportunity", externalId: id, internalObjectType: "opportunities", internalId: opportunityId, externalUpdatedAt: dateOrNull(opportunity.updatedAt), checksum: checksum(payload), metadata: { pipeline_external_id: opportunity.pipelineId ?? null, stage_external_id: opportunity.stageId ?? null } });
  await resolveImportExceptions(supabase, run, connection, "opportunity", id, ["missing_contact_dependency", "missing_external_record", "api_unsupported"], "Resolved by targeted opportunity retry after dependency repair.");
  return mapped ? "updated" : "created";
}

async function processCalendar(supabase: SupabaseClient, run: SyncRunRow, connection: GhlConnection, calendar: GhlCalendar) {
  const id = externalId(calendar);
  if (!id) return "skipped";
  const mapping = await findMapping(supabase, connection, "calendar", id);
  await upsertMapping(supabase, run, connection, {
    objectType: "calendar",
    externalId: id,
    internalObjectType: "ghl_calendar_mirror",
    internalId: connection.id,
    externalUpdatedAt: dateOrNull(calendar.updatedAt),
    checksum: checksum(calendar),
    metadata: { calendar_name: calendar.name, name: calendar.name, timezone: calendar.timezone ?? null, owner_user_id: calendar.ownerUserId ?? null }
  });
  return mapping ? "updated" : "created";
}

async function processAppointment(supabase: SupabaseClient, run: SyncRunRow, connection: GhlConnection, appointment: GhlAppointment) {
  const id = externalId(appointment);
  if (!id) return "skipped";
  const contactMapping = appointment.contactId ? await findMapping(supabase, connection, "contact", appointment.contactId) : null;
  if (!contactMapping) {
    await recordException(supabase, run, connection, { exceptionType: "missing_contact_dependency", objectType: "appointment", externalId: id, summary: "GHL appointment has no imported contact mapping.", metadata: { contact_id: appointment.contactId ?? null } });
    return "skipped";
  }
  const normalized = normalizeAppointment(appointment);
  if (normalized.needs_review) {
    const label = normalized.raw_status ? `'${normalized.raw_status}'` : "blank/null";
    await recordException(supabase, run, connection, { exceptionType: "unknown_status", objectType: "appointment", externalId: id, severity: "info", summary: `Unknown GHL appointment status ${label} was imported as review_required.`, metadata: { raw_status: normalized.raw_status, raw_status_field: normalized.raw_status_field } });
  }
  const calendarId = text(appointment.calendarId) || null;
  const calendarMapping = calendarId ? await findMapping(supabase, connection, "calendar", calendarId) : null;
  if (calendarId && !calendarMapping) {
    await recordException(supabase, run, connection, { exceptionType: "unknown_calendar", objectType: "appointment", externalId: id, severity: "warning", summary: "GHL appointment references a calendar without a Dev Dashboard mapping.", metadata: { calendar_id: calendarId } });
  }
  const providerId = await linkedUserId(supabase, connection, appointment.assignedUserId);
  const typeId = await appointmentTypeForGhlCalendar(supabase, run, connection, calendarId);
  const mapped = await findMapping(supabase, connection, "appointment", id);
  const payload = {
    organization_id: run.organization_id,
    location_id: connection.location_id,
    contact_id: contactMapping.internal_id,
    provider_id: providerId,
    appointment_type_id: typeId,
    start_at: normalized.start_at,
    end_at: normalized.end_at,
    status: normalized.status,
    notes: [appointment.title, appointment.notes, `GHL calendar: ${calendarId ?? "unknown"}`, normalized.needs_review ? `Imported unknown GHL status: ${normalized.raw_status ?? "blank/null"}` : ""].filter(Boolean).join("\n")
  };
  let appointmentId = mapped?.internal_id ?? null;
  if (appointmentId) {
    const { error } = await supabase.from("appointments").update(payload).eq("id", appointmentId).eq("organization_id", run.organization_id);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await supabase.from("appointments").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    appointmentId = String(data.id);
  }
  await upsertMapping(supabase, run, connection, { objectType: "appointment", externalId: id, internalObjectType: "appointments", internalId: appointmentId, externalUpdatedAt: normalized.external_updated_at, checksum: normalized.checksum, metadata: { calendar_id: calendarId, calendar_mapping_found: Boolean(calendarMapping), appointment_type_id: typeId, external_assigned_user_id: appointment.assignedUserId ?? null, provider_mapping_found: Boolean(providerId), timezone: normalized.timezone, raw_status: normalized.raw_status, raw_status_field: normalized.raw_status_field, status_requires_review: normalized.needs_review } });
  return mapped ? "updated" : "created";
}

async function processConversation(supabase: SupabaseClient, run: SyncRunRow, connection: GhlConnection, conversation: GhlConversation) {
  const id = externalId(conversation);
  if (!id) return "skipped";
  const contactMapping = conversation.contactId ? await findMapping(supabase, connection, "contact", conversation.contactId) : null;
  if (!contactMapping) {
    await recordException(supabase, run, connection, { exceptionType: "missing_contact_dependency", objectType: "conversation", externalId: id, summary: "GHL conversation has no imported contact mapping.", metadata: { contact_id: conversation.contactId ?? null } });
    return "skipped";
  }
  const mapped = await findMapping(supabase, connection, "conversation", id);
  const payload = {
    organization_id: run.organization_id,
    location_id: connection.location_id,
    contact_id: contactMapping.internal_id,
    status: "open",
    channel: text(conversation.channel).toLowerCase() || "sms",
    last_message_at: dateOrNull(conversation.lastMessageAt ?? conversation.updatedAt),
    unread_count: 0
  };
  let conversationId = mapped?.internal_id ?? null;
  if (conversationId) {
    const { error } = await supabase.from("conversations").update(payload).eq("id", conversationId).eq("organization_id", run.organization_id);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await supabase.from("conversations").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    conversationId = String(data.id);
  }
  await upsertMapping(supabase, run, connection, { objectType: "conversation", externalId: id, internalObjectType: "conversations", internalId: conversationId, externalUpdatedAt: dateOrNull(conversation.updatedAt), checksum: checksum(payload), metadata: { contact_external_id: conversation.contactId ?? null } });
  return mapped ? "updated" : "created";
}

async function processMessage(supabase: SupabaseClient, run: SyncRunRow, connection: GhlConnection, message: GhlMessage, conversationExternalId: string | null) {
  const id = externalId(message);
  if (!id) return "skipped";
  const conversationMapping = await findMapping(supabase, connection, "conversation", message.conversationId || conversationExternalId || "");
  if (!conversationMapping) {
    await recordException(supabase, run, connection, { exceptionType: "missing_external_record", objectType: "message", externalId: id, summary: "GHL message has no imported conversation mapping.", metadata: { conversation_id: message.conversationId ?? conversationExternalId } });
    return "skipped";
  }
  const contactMapping = message.contactId ? await findMapping(supabase, connection, "contact", message.contactId) : null;
  const { data: conversationRow } = !contactMapping ? await supabase.from("conversations").select("contact_id").eq("id", conversationMapping.internal_id).maybeSingle() : { data: null };
  const normalized = normalizeMessage(message);
  const { data: existing } = await supabase.from("messages").select("id").eq("provider", GHL_PROVIDER).eq("provider_message_id", id).maybeSingle();
  let messageId = existing?.id ? String(existing.id) : null;
  const payload = {
    organization_id: run.organization_id,
    location_id: connection.location_id,
    conversation_id: conversationMapping.internal_id,
    contact_id: contactMapping?.internal_id ?? conversationRow?.contact_id,
    direction: normalized.direction,
    channel: normalized.channel,
    body: normalized.body,
    provider: GHL_PROVIDER,
    provider_message_id: normalized.provider_message_id,
    status: normalized.status,
    simulated: false,
    received_at: normalized.direction === "inbound" ? normalized.created_at : null,
    sent_at: normalized.direction === "outbound" ? normalized.created_at : null,
    created_at: normalized.created_at
  };
  if (!payload.contact_id) return "skipped";
  if (messageId) {
    const { error } = await supabase.from("messages").update(payload).eq("id", messageId).eq("organization_id", run.organization_id);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await supabase.from("messages").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    messageId = String(data.id);
  }
  await upsertMapping(supabase, run, connection, { objectType: "message", externalId: id, internalObjectType: "messages", internalId: messageId, checksum: normalized.checksum, metadata: { conversation_external_id: message.conversationId || conversationExternalId } });
  return existing ? "updated" : "created";
}

async function processMirroredProviderRecord(supabase: SupabaseClient, run: SyncRunRow, connection: GhlConnection, objectType: "transaction" | "order", row: Record<string, unknown>) {
  const id = externalId(row);
  if (!id) return "skipped";
  const contactId = text(row.contactId ?? row.contact_id);
  const contactMapping = contactId ? await findMapping(supabase, connection, "contact", contactId) : null;
  const existing = await findMapping(supabase, connection, objectType, id);
  await upsertMapping(supabase, run, connection, {
    objectType,
    externalId: id,
    internalObjectType: `ghl_${objectType}_mirror`,
    internalId: contactMapping?.internal_id ?? connection.id,
    externalUpdatedAt: dateOrNull(row.updatedAt ?? row.createdAt ?? row.receivedAt),
    checksum: checksum(row),
    metadata: { mirrored_only: true, no_financial_movement: true, contact_external_id: contactId || null, amount_cents: moneyToCents(row.amountCents ?? row.amount ?? row.total) }
  });
  return existing ? "updated" : "created";
}

async function processLocationMetadata(supabase: SupabaseClient, run: SyncRunRow, connection: GhlConnection, payload: Record<string, unknown>) {
  const location = "location" in payload ? record(payload.location) : payload;
  const returnedLocationId = text(location.id ?? location._id ?? location.locationId);
  const locationName = text(location.name ?? location.businessName ?? location.companyName);
  if (returnedLocationId && returnedLocationId !== connection.ghl_location_id) {
    await recordException(supabase, run, connection, { exceptionType: "missing_external_record", objectType: "location_metadata", externalId: returnedLocationId, severity: "critical", summary: "GHL location metadata ID does not match configured connection.", metadata: { configured_location_id: connection.ghl_location_id, returned_location_id: returnedLocationId } });
    return "failed";
  }
  const { error } = await supabase.from("ghl_connections").update({
    status: "syncing",
    token_present: true,
    metadata_safe: { ...(record(connection).metadata_safe as Record<string, unknown>), last_import_location_metadata: { location_id: returnedLocationId, name: locationName, imported_at: new Date().toISOString() } }
  }).eq("id", connection.id);
  if (error) throw new Error(error.message);
  await upsertMapping(supabase, run, connection, { objectType: "location_metadata", externalId: connection.ghl_location_id, internalObjectType: "ghl_connections", internalId: connection.id, checksum: checksum(location), metadata: { location_name: locationName } });
  return "updated";
}

async function processRecordByType(supabase: SupabaseClient, run: SyncRunRow, connection: GhlConnection, objectType: GhlImportObjectType, value: unknown, job: SyncJobRow) {
  const row = record(value);
  switch (objectType) {
    case "location_metadata":
      return processLocationMetadata(supabase, run, connection, row);
    case "user":
      return processUser(supabase, run, connection, row);
    case "custom_field":
      return processCustomField(supabase, run, connection, row);
    case "tag":
      return ensureTag(supabase, run, connection, text(row.name ?? row.tag ?? row.label) || "GHL Tag", externalId(row)).then(() => "created" as const);
    case "contact":
      return processContact(supabase, run, connection, value as GhlContact);
    case "pipeline":
      return processPipeline(supabase, run, connection, row);
    case "opportunity":
      return processOpportunity(supabase, run, connection, value as GhlOpportunity);
    case "calendar":
      return processCalendar(supabase, run, connection, value as GhlCalendar);
    case "appointment":
      return processAppointment(supabase, run, connection, value as GhlAppointment);
    case "conversation":
      return processConversation(supabase, run, connection, value as GhlConversation);
    case "message":
      return processMessage(supabase, run, connection, value as GhlMessage, job.cursor_value);
    case "transaction":
      return processMirroredProviderRecord(supabase, run, connection, "transaction", row);
    case "order":
      return processMirroredProviderRecord(supabase, run, connection, "order", row);
    default:
      return "skipped";
  }
}

async function fetchImportPage(client: GhlReadOnlyClient, objectType: GhlImportObjectType, job: SyncJobRow): Promise<GhlPage<unknown>> {
  const metadata = record(job.metadata_safe);
  const incrementalSince = text(metadata.incremental_since);
  const driftReconciliation = metadata.drift_reconciliation === true;
  switch (objectType) {
    case "location_metadata": {
      const data = await client.getLocationMetadata();
      return { data: [data], hasMore: false, recordsAvailable: 1, pagesFetched: 1 } as GhlPage<unknown>;
    }
    case "user":
      return client.getUsers();
    case "custom_field":
      return client.getCustomFields();
    case "tag":
      return client.getTags({ pageToken: job.page_token, query: { limit: FULL_IMPORT_PAGE_SIZE } });
    case "contact":
      if (record(job.metadata_safe).single_record_retry === true && job.cursor_value) {
        const contact = await client.getContact(job.cursor_value);
        return { data: contact ? [contact] : [], hasMore: false, recordsAvailable: contact ? 1 : 0, pagesFetched: 1 } as GhlPage<unknown>;
      }
      return client.getContacts({ pageToken: job.page_token, body: { pageLimit: FULL_IMPORT_PAGE_SIZE } });
    case "pipeline":
      return client.getPipelines();
    case "opportunity":
      return client.getOpportunities({ pageToken: job.page_token });
    case "calendar":
      return client.getCalendars();
    case "appointment":
      return client.getAppointments({ query: { ...appointmentWindow({ incrementalSince, driftReconciliation }), calendarId: job.cursor_value } });
    case "conversation":
      return client.getConversations({ pageToken: job.page_token, query: { limit: FULL_IMPORT_PAGE_SIZE, ...(incrementalSince && !driftReconciliation ? { updatedAfter: incrementalSince } : {}) } });
    case "message":
      if (!job.cursor_value) return { data: [], hasMore: false } as GhlPage<unknown>;
      return client.getMessages(job.cursor_value, { pageToken: job.page_token, query: { limit: FULL_IMPORT_PAGE_SIZE } });
    case "transaction":
      return client.getPayments({ pageToken: job.page_token });
    case "order":
      return client.getOrders({ pageToken: job.page_token });
    default:
      return { data: [], hasMore: false } as GhlPage<unknown>;
  }
}

async function processPage(supabase: SupabaseClient, run: SyncRunRow, connection: GhlConnection, job: SyncJobRow) {
  const client = new GhlReadOnlyClient(connection);
  await updateJobHeartbeat(supabase, job, "fetch_start");
  const page = await fetchImportPage(client, job.object_type, job);
  const targetExternalId = text(record(job.metadata_safe).target_external_id);
  const pageData = targetExternalId ? page.data.filter((item) => externalId(item) === targetExternalId) : page.data;
  await updateJobHeartbeat(supabase, job, "fetch_complete", { fetched: page.data.length });
  const counts = zeroCounts();
  counts.fetched = pageData.length;
  counts.pages = 1;

  for (let index = 0; index < pageData.length; index += FULL_IMPORT_RECORD_BATCH_SIZE) {
    const chunk = pageData.slice(index, index + FULL_IMPORT_RECORD_BATCH_SIZE);
    await updateJobHeartbeat(supabase, job, "write_batch_start", { batch_start_index: index, batch_size: chunk.length });
    for (const item of chunk) {
      try {
        const outcome = await processRecordByType(supabase, run, connection, job.object_type, item, job);
        if (outcome === "created") counts.created += 1;
        else if (outcome === "updated") counts.updated += 1;
        else if (outcome === "unchanged") counts.unchanged += 1;
        else if (outcome === "failed") counts.failed += 1;
        else counts.skipped += 1;
      } catch (error) {
        counts.failed += 1;
        await recordException(supabase, run, connection, { exceptionType: "api_unsupported", objectType: job.object_type, externalId: externalId(item) || null, severity: "warning", summary: boundedError(error instanceof Error ? error.message : error), metadata: { safe_error: safeGhlError(error) } });
      }
    }
    await updateJobHeartbeat(supabase, job, "write_batch_complete", { batch_start_index: index, counts });
  }

  if (targetExternalId && pageData.length === 0) {
    await recordException(supabase, run, connection, { exceptionType: "missing_external_record", objectType: job.object_type, externalId: targetExternalId, severity: "info", summary: "GHL webhook target was not returned by the follow-up read.", metadata: { webhook_target_external_id: targetExternalId, page_endpoint: page.endpoint ?? null } });
  }

  if (job.object_type === "message" && pageData.length === 0 && !job.page_token) {
    await recordException(supabase, run, connection, { exceptionType: "api_unsupported", objectType: "message", externalId: job.cursor_value, severity: "info", summary: "GHL message history returned no records for this conversation during read-only import.", metadata: { conversation_external_id: job.cursor_value } });
  }

  return {
    counts,
    nextPageToken: nextFullImportPageToken(page),
    pageMetadata: { ...endpointSummary(page), cursor_value: job.cursor_value, page_token: job.page_token }
  } satisfies PageResult;
}

async function updateJobHeartbeat(supabase: SupabaseClient, job: SyncJobRow, stage: string, metadata: Record<string, unknown> = {}) {
  const heartbeatAt = new Date().toISOString();
  await supabase
    .from("ghl_sync_jobs")
    .update({
      metadata_safe: {
        ...(job.metadata_safe ?? {}),
        ...metadata,
        heartbeat_at: heartbeatAt,
        heartbeat_stage: stage
      }
    })
    .eq("id", job.id)
    .eq("status", "running");
  console.log(JSON.stringify({ event: "ghl_worker_job_heartbeat", jobId: job.id, objectType: job.object_type, pageToken: job.page_token ?? null, stage, heartbeatAt }));
}

async function updateRunCounts(supabase: SupabaseClient, run: SyncRunRow, counts: ImportCounts, metadata: Record<string, unknown> = {}) {
  const { data: fresh } = await supabase.from("ghl_sync_runs").select("*").eq("id", run.id).single();
  const current = fresh as SyncRunRow;
  const { error } = await supabase.from("ghl_sync_runs").update({
    status: "running",
    records_fetched: Number(current.records_fetched ?? 0) + counts.fetched,
    records_created: Number(current.records_created ?? 0) + counts.created,
    records_updated: Number(current.records_updated ?? 0) + counts.updated,
    records_unchanged: Number(current.records_unchanged ?? 0) + counts.unchanged,
    records_skipped: Number(current.records_skipped ?? 0) + counts.skipped,
    records_failed: Number(current.records_failed ?? 0) + counts.failed,
    pages_fetched: Number(current.pages_fetched ?? 0) + counts.pages,
    metadata_safe: { ...(current.metadata_safe ?? {}), ...metadata, last_progress_at: new Date().toISOString() }
  }).eq("id", run.id);
  if (error) throw new Error(error.message);
}

async function saveCursor(supabase: SupabaseClient, connection: GhlConnection, objectType: GhlImportObjectType, pageToken: string | null, completed: boolean) {
  await supabase.from("ghl_sync_cursors").upsert({
    connection_id: connection.id,
    object_type: objectType,
    cursor_value: pageToken,
    last_page_token: pageToken,
    last_sync_started_at: new Date().toISOString(),
    last_sync_completed_at: completed ? new Date().toISOString() : null
  }, { onConflict: "connection_id,object_type" });
}

async function queueJob(supabase: SupabaseClient, run: SyncRunRow, connection: GhlConnection, objectType: GhlImportObjectType, input: { pageToken?: string | null; cursorValue?: string | null; metadata?: Record<string, unknown>; runAt?: string } = {}) {
  const pageToken = objectType === "opportunity" ? normalizeOpportunityJobPageToken(input.pageToken) : input.pageToken ?? null;
  const { error } = await supabase.from("ghl_sync_jobs").insert({
    organization_id: run.organization_id,
    connection_id: connection.id,
    sync_run_id: run.id,
    object_type: objectType,
    cursor_value: input.cursorValue ?? null,
    page_token: pageToken,
    status: "queued",
    attempts: 0,
    run_at: input.runAt ?? new Date().toISOString(),
    metadata_safe: { phase: 21, read_only_import: true, ...(input.metadata ?? {}) }
  });
  if (error) throw new Error(error.message);
}

async function queueOneObjectRun(
  supabase: SupabaseClient,
  connection: GhlConnection,
  input: {
    syncType: "webhook" | "incremental";
    objectType: GhlImportObjectType;
    cursorValue?: string | null;
    pageToken?: string | null;
    metadata?: Record<string, unknown>;
    fanOut?: boolean;
  }
) {
  const { data: run, error } = await supabase.from("ghl_sync_runs").insert({
    organization_id: connection.organization_id,
    connection_id: connection.id,
    sync_type: input.syncType,
    object_type: input.objectType,
    status: "queued",
    started_at: new Date().toISOString(),
    metadata_safe: {
      phase: "21B",
      read_only: true,
      ghl_writes_performed: false,
      normalized_business_records_written: true,
      current_object: input.objectType,
      ...(input.metadata ?? {})
    }
  }).select("*").single();
  if (error) throw new Error(error.message);
  const syncRun = run as SyncRunRow;
  const jobMetadata = {
    phase: "21B",
    incremental_target: input.syncType,
    ...(input.metadata ?? {})
  };
  if (input.fanOut) {
    const queued = await queueFanOutJobs(supabase, syncRun, connection, input.objectType, jobMetadata);
    if (queued === 0) await finalizeOneObjectRunIfDone(supabase, syncRun, connection.id);
  } else {
    await queueJob(supabase, syncRun, connection, input.objectType, {
      cursorValue: input.cursorValue,
      pageToken: input.pageToken,
      metadata: jobMetadata
    });
  }
  await supabase.from("ghl_connections").update({ status: "syncing" }).eq("id", connection.id);
  return syncRun.id;
}

export async function queueGhlWebhookSync(supabase: SupabaseClient, connection: GhlConnection, input: {
  webhookEventId: string;
  eventType: string;
  objectType: GhlImportObjectType;
  externalObjectId: string | null;
  calendarId?: string | null;
  conversationId?: string | null;
  providerTimestamp?: string | null;
}) {
  const cursorValue = input.objectType === "appointment"
    ? input.calendarId ?? null
    : input.objectType === "message"
      ? input.conversationId ?? input.externalObjectId
      : input.externalObjectId;
  return queueOneObjectRun(supabase, connection, {
    syncType: "webhook",
    objectType: input.objectType,
    cursorValue,
    metadata: {
      webhook_event_id: input.webhookEventId,
      event_type: input.eventType,
      target_external_id: input.externalObjectId,
      single_record_retry: input.objectType === "contact" && Boolean(input.externalObjectId),
      calendar_external_id: input.calendarId ?? null,
      conversation_external_id: input.conversationId ?? null,
      provider_timestamp: input.providerTimestamp ?? null
    }
  });
}

async function noActiveIncrementalRun(supabase: SupabaseClient, connectionId: string, objectType: GhlImportObjectType) {
  const { data: activeRun } = await supabase
    .from("ghl_sync_runs")
    .select("id")
    .eq("connection_id", connectionId)
    .eq("sync_type", "incremental")
    .eq("object_type", objectType)
    .in("status", ["queued", "running"])
    .limit(1);
  return (activeRun ?? []).length === 0;
}

async function queueIncrementalObjectRun(
  supabase: SupabaseClient,
  connection: GhlConnection,
  objectType: GhlImportObjectType,
  input: { everyMinutes: number; now: Date; force?: boolean; driftReconciliation?: boolean } 
) {
  if (!fullImportObjectEnabled(connection, objectType)) return 0;
  if (!await noActiveIncrementalRun(supabase, connection.id, objectType)) return 0;
  const { data: cursor } = await supabase
    .from("ghl_sync_cursors")
    .select("cursor_value,last_page_token,last_sync_completed_at")
    .eq("connection_id", connection.id)
    .eq("object_type", objectType)
    .maybeSingle();
  const lastCompletedAt = cursor?.last_sync_completed_at ? String(cursor.last_sync_completed_at) : "";
  const lastCompleted = lastCompletedAt ? new Date(lastCompletedAt).getTime() : 0;
  if (!input.force && lastCompleted && input.now.getTime() - lastCompleted < input.everyMinutes * 60 * 1000) return 0;
  const pageToken = text(cursor?.cursor_value ?? cursor?.last_page_token) || null;
  await queueOneObjectRun(supabase, connection, {
    syncType: "incremental",
    objectType,
    pageToken,
    fanOut: objectType === "appointment",
    metadata: {
      phase: "21C",
      reconciliation_schedule_minutes: input.everyMinutes,
      queued_by: input.force ? "manual_incremental_sync_now" : "continuous_incremental_polling",
      incremental_since: lastCompletedAt || connection.last_successful_sync_at || connection.last_full_sync_at || null,
      incremental_checkpoint_page_token: pageToken,
      incremental_page_count: 1,
      drift_reconciliation: input.driftReconciliation === true
    }
  });
  return 1;
}

export async function queueDueGhlIncrementalReconciliation(supabase: SupabaseClient, options: { now?: Date; force?: boolean; connectionId?: string; env?: NodeJS.ProcessEnv } = {}) {
  assertGhlReadMode();
  const now = options.now ?? new Date();
  const { data: connections, error } = await supabase
    .from("ghl_connections")
    .select("*")
    .neq("sync_mode", "disabled")
    .neq("connection_type", "mock")
    .match(options.connectionId ? { id: options.connectionId } : {})
    .limit(50);
  if (error) throw new Error(error.message);
  let queued = 0;
  for (const connectionRow of connections ?? []) {
    const connection = connectionRow as GhlConnection;
    if (!fullImportObjectEnabled(connection, "contact")) continue;
    const { data: activeFullImport } = await supabase
      .from("ghl_sync_runs")
      .select("id")
      .eq("connection_id", connection.id)
      .eq("sync_type", "full_import")
      .in("status", ["queued", "running"])
      .limit(1);
    if ((activeFullImport ?? []).length > 0) continue;
    for (const schedule of getGhlIncrementalSchedule(options.env)) {
      queued += await queueIncrementalObjectRun(supabase, connection, schedule.objectType, {
        everyMinutes: schedule.everyMinutes,
        now,
        force: options.force
      });
    }

    const { data: driftCursor } = await supabase
      .from("ghl_sync_cursors")
      .select("last_sync_completed_at")
      .eq("connection_id", connection.id)
      .eq("object_type", "reconciliation")
      .maybeSingle();
    const lastDriftCompleted = driftCursor?.last_sync_completed_at ? new Date(String(driftCursor.last_sync_completed_at)).getTime() : 0;
    const driftEveryMinutes = getGhlDriftReconciliationEveryMinutes(options.env);
    const driftDue = options.force || !lastDriftCompleted || now.getTime() - lastDriftCompleted >= driftEveryMinutes * 60 * 1000;
    if (driftDue) {
      for (const objectType of ["calendar", "appointment", "contact", "opportunity", "conversation", "transaction", "order"] as GhlImportObjectType[]) {
        queued += await queueIncrementalObjectRun(supabase, connection, objectType, {
          everyMinutes: driftEveryMinutes,
          now,
          force: true,
          driftReconciliation: true
        });
      }
      await saveCursor(supabase, connection, "reconciliation", null, true);
    }
  }
  return queued;
}

async function queueFanOutJobs(supabase: SupabaseClient, run: SyncRunRow, connection: GhlConnection, objectType: GhlImportObjectType, metadata: Record<string, unknown> = {}) {
  if (objectType === "appointment") {
    const { data: calendars } = await supabase.from("external_record_mappings").select("external_id").eq("connection_id", connection.id).eq("external_object_type", "calendar").order("created_at");
    for (const calendar of calendars ?? []) {
      await queueJob(supabase, run, connection, "appointment", { cursorValue: String(calendar.external_id), metadata: { ...metadata, calendar_external_id: calendar.external_id, calendar_batch_size: FULL_IMPORT_APPOINTMENT_CALENDAR_BATCH_SIZE } });
    }
    if (!calendars?.length) await saveCursor(supabase, connection, "appointment", null, true);
    return calendars?.length ?? 0;
  }
  if (objectType === "message") {
    const { data: conversations } = await supabase.from("external_record_mappings").select("external_id, internal_id").eq("connection_id", connection.id).eq("external_object_type", "conversation").order("created_at");
    for (const conversation of conversations ?? []) {
      await queueJob(supabase, run, connection, "message", { cursorValue: String(conversation.external_id), metadata: { ...metadata, conversation_external_id: conversation.external_id, internal_conversation_id: conversation.internal_id, conversation_batch_size: FULL_IMPORT_MESSAGE_CONVERSATION_BATCH_SIZE } });
    }
    if (!conversations?.length) await saveCursor(supabase, connection, "message", null, true);
    return conversations?.length ?? 0;
  }
  await queueJob(supabase, run, connection, objectType, { metadata });
  return 1;
}

async function queueResumeCheckpointJob(supabase: SupabaseClient, run: SyncRunRow, connection: GhlConnection, objectType: GhlImportObjectType) {
  if (objectType === "appointment" || objectType === "message") return queueFanOutJobs(supabase, run, connection, objectType);
  await queueJob(supabase, run, connection, objectType, {
    pageToken: resumePageTokenFromRun(run),
    metadata: { resumed_from_run_checkpoint: true }
  });
  return 1;
}

type RetryExceptionRow = {
  id: string;
  object_type: string | null;
  external_id: string | null;
  exception_type: string | null;
  metadata_safe: Record<string, unknown> | null;
  summary: string | null;
};

export type GhlFailedRecordRetryResult = {
  runId: string;
  contactFailuresFound: number;
  opportunityMissingDependenciesFound: number;
  contactIdsAlreadyMapped: number;
  contactIdsQueuedForRetry: number;
  contactIdsAmbiguous: number;
  contactIdsMissingExternalId: number;
  opportunityDeadLetterJobsRequeued: number;
  opportunityRetryDeferred: boolean;
};

function dependencyContactId(row: RetryExceptionRow) {
  return text(record(row.metadata_safe).contact_id);
}

function retryableContactId(row: RetryExceptionRow) {
  if (row.object_type !== "contact") return "";
  if (row.exception_type === "duplicate_contact") return "";
  return text(row.external_id);
}

function ambiguousContactId(row: RetryExceptionRow) {
  if (row.object_type !== "contact" || row.exception_type !== "duplicate_contact") return "";
  return text(row.external_id);
}

async function findResumableFullImportRun(supabase: SupabaseClient, connection: GhlConnection, runId?: string) {
  const { data } = runId
    ? await supabase.from("ghl_sync_runs").select("*").eq("id", runId).eq("connection_id", connection.id).single()
    : await supabase.from("ghl_sync_runs").select("*").eq("connection_id", connection.id).eq("sync_type", "full_import").in("status", resumableFullImportStatuses()).order("started_at", { ascending: false }).limit(1).single();
  return data as SyncRunRow | null;
}

async function activeRetryJobExists(supabase: SupabaseClient, run: SyncRunRow, objectType: GhlImportObjectType, cursorValue: string) {
  const { data } = await supabase
    .from("ghl_sync_jobs")
    .select("id")
    .eq("sync_run_id", run.id)
    .eq("object_type", objectType)
    .eq("cursor_value", cursorValue)
    .in("status", ACTIVE_JOB_STATUSES)
    .limit(1);
  return (data ?? []).length > 0;
}

async function requeueDeadLetterRetryJob(supabase: SupabaseClient, run: SyncRunRow, objectType: GhlImportObjectType, cursorValue: string) {
  const { data } = await supabase
    .from("ghl_sync_jobs")
    .select("id, metadata_safe")
    .eq("sync_run_id", run.id)
    .eq("object_type", objectType)
    .eq("cursor_value", cursorValue)
    .eq("status", "dead_letter")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.id) return false;
  const { error } = await supabase
    .from("ghl_sync_jobs")
    .update({
      status: "queued",
      run_at: new Date().toISOString(),
      last_error: null,
      locked_at: null,
      locked_by: null,
      completed_at: null,
      metadata_safe: {
        ...record(data.metadata_safe),
        targeted_failed_record_retry: true,
        requeued_existing_dead_letter_retry: true
      }
    })
    .eq("id", data.id);
  if (error) throw new Error(error.message);
  return true;
}

async function queueSingleContactRetryJob(supabase: SupabaseClient, run: SyncRunRow, connection: GhlConnection, contactExternalId: string, reason: string) {
  if (await activeRetryJobExists(supabase, run, "contact", contactExternalId)) return false;
  if (await requeueDeadLetterRetryJob(supabase, run, "contact", contactExternalId)) return true;
  await queueJob(supabase, run, connection, "contact", {
    cursorValue: contactExternalId,
    metadata: {
      single_record_retry: true,
      targeted_failed_record_retry: true,
      retry_reason: reason
    }
  });
  return true;
}

type OpportunityJobHistoryRow = {
  id: string;
  page_token: string | null;
  status: string | null;
  metadata_safe: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function parentOpportunityJobId(job: OpportunityJobHistoryRow) {
  return text(record(job.metadata_safe).resumed_from_job_id);
}

function inferOpportunityNumericPage(job: OpportunityJobHistoryRow, rowsById: Map<string, OpportunityJobHistoryRow>, orderedRows: OpportunityJobHistoryRow[], seen = new Set<string>()): string | null {
  const direct = positiveIntegerText(job.page_token);
  if (direct) return direct;
  const metadataPage = positiveIntegerText(record(job.metadata_safe).opportunity_numeric_page);
  if (metadataPage) return metadataPage;
  const parentId = parentOpportunityJobId(job);
  if (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = rowsById.get(parentId);
    if (parent) {
      const parentPage = positiveIntegerText(inferOpportunityNumericPage(parent, rowsById, orderedRows, seen));
      if (parentPage) return String(Number(parentPage) + 1);
    }
  }
  const index = orderedRows.findIndex((row) => row.id === job.id);
  const previousRows = index >= 0 ? orderedRows.slice(0, index).reverse() : [];
  for (const previous of previousRows) {
    const previousPage = positiveIntegerText(inferOpportunityNumericPage(previous, rowsById, orderedRows, new Set(seen)));
    if (previousPage) return String(Number(previousPage) + 1);
  }
  return index >= 0 ? String(index + 1) : null;
}

async function requeueOpportunityDeadLetterJobs(supabase: SupabaseClient, run: SyncRunRow) {
  const runAt = new Date().toISOString();
  const { data: opportunityJobs, error } = await supabase
    .from("ghl_sync_jobs")
    .select("id, page_token, status, metadata_safe, created_at, updated_at")
    .eq("sync_run_id", run.id)
    .eq("object_type", "opportunity")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (opportunityJobs ?? []) as OpportunityJobHistoryRow[];
  const rowsById = new Map(rows.map((job) => [job.id, job]));
  const deadLetterJobs = rows.filter((job) => job.status === "dead_letter");
  const requeuedPages = new Set<string>();
  for (const job of deadLetterJobs) {
    const repairedPageToken = inferOpportunityNumericPage(job, rowsById, rows);
    if (!repairedPageToken) throw new Error("Could not infer a numeric GHL opportunity page for dead-letter retry.");
    if (requeuedPages.has(repairedPageToken)) {
      await supabase
        .from("ghl_sync_jobs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          last_error: "Duplicate dead-letter opportunity page superseded by another repaired retry job",
          metadata_safe: {
            ...record(job.metadata_safe),
            targeted_failed_record_retry: true,
            duplicate_dead_letter_superseded: true,
            repaired_from_page_token: job.page_token ?? null,
            repaired_numeric_page: repairedPageToken
          }
        })
        .eq("id", job.id);
      continue;
    }
    requeuedPages.add(repairedPageToken);
    await supabase
      .from("ghl_sync_jobs")
      .update({
        status: "queued",
        run_at: runAt,
        last_error: null,
        locked_at: null,
        locked_by: null,
        completed_at: null,
        page_token: repairedPageToken,
        metadata_safe: {
          ...record(job.metadata_safe),
          targeted_failed_record_retry: true,
          retry_reason: "opportunity_missing_contact_dependency_repair",
          dependency_contacts_repaired: true,
          repaired_from_page_token: job.page_token ?? null,
          repaired_numeric_page: repairedPageToken
        }
      })
      .eq("id", job.id);
  }
  return requeuedPages.size;
}

async function openOpportunityDependencyContactIds(supabase: SupabaseClient, run: SyncRunRow, connection: GhlConnection) {
  const { data, error } = await supabase
    .from("ghl_sync_exceptions")
    .select("metadata_safe")
    .eq("sync_run_id", run.id)
    .eq("connection_id", connection.id)
    .eq("object_type", "opportunity")
    .eq("exception_type", "missing_contact_dependency")
    .in("status", TARGETED_RETRY_OBJECT_STATUSES);
  if (error) throw new Error(error.message);
  return [...new Set((data ?? []).map((row) => text(record(row.metadata_safe).contact_id)).filter(Boolean))];
}

async function opportunityDependenciesReady(supabase: SupabaseClient, run: SyncRunRow, connection: GhlConnection) {
  const contactIds = await openOpportunityDependencyContactIds(supabase, run, connection);
  if (contactIds.length === 0) return true;
  const { data: activeContactJobs, error: activeError } = await supabase
    .from("ghl_sync_jobs")
    .select("id")
    .eq("sync_run_id", run.id)
    .eq("object_type", "contact")
    .in("status", ACTIVE_JOB_STATUSES)
    .limit(1);
  if (activeError) throw new Error(activeError.message);
  if ((activeContactJobs ?? []).length > 0) return false;

  const { data: mappedContacts, error: mappingError } = await supabase
    .from("external_record_mappings")
    .select("external_id")
    .eq("connection_id", connection.id)
    .eq("external_object_type", "contact")
    .in("external_id", contactIds);
  if (mappingError) throw new Error(mappingError.message);
  const mappedIds = new Set((mappedContacts ?? []).map((row) => String(row.external_id)));
  return contactIds.every((contactId) => mappedIds.has(contactId));
}

async function requeueOpportunityDeadLettersIfDependenciesReady(supabase: SupabaseClient, run: SyncRunRow, connection: GhlConnection) {
  if (!await opportunityDependenciesReady(supabase, run, connection)) return 0;
  return requeueOpportunityDeadLetterJobs(supabase, run);
}

export async function retryGhlFailedRecords(supabase: SupabaseClient, profile: CurrentProfile, connection: GhlConnection, runId?: string): Promise<GhlFailedRecordRetryResult> {
  assertGhlReadMode();
  if (isMockGhlConnection(connection)) throw new Error("Failed-record retry is only available for real read-only GHL connections.");
  if (!tokenPresentForConnection(connection)) throw new Error("GoHighLevel token is not configured for this connection.");
  const run = await findResumableFullImportRun(supabase, connection, runId);
  if (!run) throw new Error("No resumable GHL full import was found.");
  if (run.organization_id !== profile.organizationId) throw new Error("Import run is not available for this organization.");
  if (!fullImportRunLooksIncomplete(run)) throw new Error("No incomplete GHL full import was found.");

  const opportunityDeadLettersRequeuedFirst = await requeueOpportunityDeadLetterJobs(supabase, run);
  if (opportunityDeadLettersRequeuedFirst > 0) {
    await supabase.from("ghl_sync_runs").update({
      status: "queued",
      completed_at: null,
      error_summary: null,
      metadata_safe: {
        ...(run.metadata_safe ?? {}),
        targeted_failed_record_retry_at: new Date().toISOString(),
        targeted_failed_record_retry: {
          retry_mode: "opportunity_dead_letters_only",
          opportunity_dead_letter_jobs_requeued: opportunityDeadLettersRequeuedFirst,
          contact_dependencies_left_as_targeted_exceptions: true
        }
      }
    }).eq("id", run.id);
    await supabase.from("ghl_connections").update({ status: "syncing" }).eq("id", connection.id);
    return {
      runId: run.id,
      contactFailuresFound: 0,
      opportunityMissingDependenciesFound: 0,
      contactIdsAlreadyMapped: 0,
      contactIdsQueuedForRetry: 0,
      contactIdsAmbiguous: 0,
      contactIdsMissingExternalId: 0,
      opportunityDeadLetterJobsRequeued: opportunityDeadLettersRequeuedFirst,
      opportunityRetryDeferred: false
    };
  }

  const { data: rows, error } = await supabase
    .from("ghl_sync_exceptions")
    .select("id, object_type, external_id, exception_type, metadata_safe, summary")
    .eq("sync_run_id", run.id)
    .eq("connection_id", connection.id)
    .in("status", TARGETED_RETRY_OBJECT_STATUSES);
  if (error) throw new Error(error.message);

  const exceptions = (rows ?? []) as RetryExceptionRow[];
  const retryableContactFailures = exceptions.filter((row) => row.object_type === "contact" && retryableContactId(row));
  const ambiguousContactIds = new Set(exceptions.map(ambiguousContactId).filter(Boolean));
  const missingDependencyExceptions = exceptions.filter((row) => row.object_type === "opportunity" && row.exception_type === "missing_contact_dependency");
  const missingDependencyContactIds = missingDependencyExceptions.map(dependencyContactId).filter(Boolean);
  const contactIds = [...new Set([...retryableContactFailures.map(retryableContactId), ...missingDependencyContactIds].filter(Boolean))];

  let contactIdsAlreadyMapped = 0;
  let contactIdsQueuedForRetry = 0;
  let contactIdsAmbiguous = 0;
  const contactIdsMissingExternalId = missingDependencyExceptions.length - missingDependencyContactIds.length;

  for (const contactId of contactIds) {
    if (ambiguousContactIds.has(contactId)) {
      contactIdsAmbiguous += 1;
      continue;
    }
    const mapping = await findMapping(supabase, connection, "contact", contactId);
    if (mapping) {
      contactIdsAlreadyMapped += 1;
      continue;
    }
    const queued = await queueSingleContactRetryJob(supabase, run, connection, contactId, missingDependencyContactIds.includes(contactId) ? "opportunity_missing_contact_dependency" : "previous_contact_import_failure");
    if (queued) contactIdsQueuedForRetry += 1;
  }

  const opportunityDeadLetterJobsRequeued = contactIdsQueuedForRetry > 0 ? 0 : await requeueOpportunityDeadLettersIfDependenciesReady(supabase, run, connection);
  await supabase.from("ghl_sync_runs").update({
    status: "queued",
    completed_at: null,
    error_summary: null,
    metadata_safe: {
      ...(run.metadata_safe ?? {}),
      targeted_failed_record_retry_at: new Date().toISOString(),
      targeted_failed_record_retry: {
        contact_failures_found: retryableContactFailures.length,
        opportunity_missing_dependencies_found: missingDependencyExceptions.length,
        contact_ids_already_mapped: contactIdsAlreadyMapped,
        contact_ids_queued_for_retry: contactIdsQueuedForRetry,
        contact_ids_ambiguous: contactIdsAmbiguous,
        contact_ids_missing_external_id: contactIdsMissingExternalId,
        opportunity_dead_letter_jobs_requeued: opportunityDeadLetterJobsRequeued
      }
    }
  }).eq("id", run.id);
  await supabase.from("ghl_connections").update({ status: "syncing" }).eq("id", connection.id);

  return {
    runId: run.id,
    contactFailuresFound: retryableContactFailures.length,
    opportunityMissingDependenciesFound: missingDependencyExceptions.length,
    contactIdsAlreadyMapped,
    contactIdsQueuedForRetry,
    contactIdsAmbiguous,
    contactIdsMissingExternalId,
    opportunityDeadLetterJobsRequeued,
    opportunityRetryDeferred: contactIdsQueuedForRetry > 0
  };
}

async function nextEnabledObject(connection: GhlConnection, completedObject: GhlImportObjectType) {
  const currentIndex = FULL_IMPORT_OBJECT_ORDER.indexOf(completedObject);
  return FULL_IMPORT_OBJECT_ORDER.slice(currentIndex + 1).find((objectType) => fullImportObjectEnabled(connection, objectType)) ?? null;
}

async function queueNextObjectIfReady(supabase: SupabaseClient, run: SyncRunRow, connection: GhlConnection, completedObject: GhlImportObjectType) {
  const { data: activeSameObject } = await supabase
    .from("ghl_sync_jobs")
    .select("id")
    .eq("sync_run_id", run.id)
    .eq("object_type", completedObject)
    .in("status", ACTIVE_JOB_STATUSES)
    .limit(1);
  if ((activeSameObject ?? []).length > 0) return 0;
  await saveCursor(supabase, connection, completedObject, null, true);
  const nextObject = await nextEnabledObject(connection, completedObject);
  if (!nextObject) {
    await finalizeRunIfDone(supabase, run.id, connection.id);
    return 0;
  }
  const nextIndex = FULL_IMPORT_OBJECT_ORDER.indexOf(nextObject);
  await supabase.from("ghl_sync_runs").update({ metadata_safe: { ...(run.metadata_safe ?? {}), current_object: nextObject, current_object_index: nextIndex, object_count: FULL_IMPORT_OBJECT_ORDER.length, last_progress_at: new Date().toISOString() } }).eq("id", run.id);
  const queued = await queueFanOutJobs(supabase, run, connection, nextObject);
  if (queued === 0) return queueNextObjectIfReady(supabase, run, connection, nextObject);
  return queued;
}

async function finalizeRunIfDone(supabase: SupabaseClient, runId: string, connectionId: string) {
  const { data: active } = await supabase.from("ghl_sync_jobs").select("id").eq("sync_run_id", runId).in("status", ACTIVE_JOB_STATUSES).limit(1);
  if ((active ?? []).length > 0) return;
  const { data: dead } = await supabase.from("ghl_sync_jobs").select("id").eq("sync_run_id", runId).in("status", INTERRUPTED_JOB_STATUSES).limit(1);
  const { data: run } = await supabase.from("ghl_sync_runs").select("metadata_safe").eq("id", runId).maybeSingle();
  const status = (dead ?? []).length > 0 ? "partial" : "succeeded";
  await supabase.from("ghl_sync_runs").update({
    status,
    completed_at: new Date().toISOString(),
    metadata_safe: { ...(record(run?.metadata_safe)), historical_import_complete: status === "succeeded", reconciliation_status: "pending", last_progress_at: new Date().toISOString() }
  }).eq("id", runId);
  await supabase.from("ghl_connections").update({
    status: status === "succeeded" ? "healthy" : "warning",
    last_full_sync_at: status === "succeeded" ? new Date().toISOString() : null,
    last_successful_sync_at: status === "succeeded" ? new Date().toISOString() : null
  }).eq("id", connectionId);
}

async function finalizeOneObjectRunIfDone(supabase: SupabaseClient, run: SyncRunRow, connectionId: string) {
  const { data: active } = await supabase.from("ghl_sync_jobs").select("id").eq("sync_run_id", run.id).in("status", ACTIVE_JOB_STATUSES).limit(1);
  if ((active ?? []).length > 0) return;
  const { data: dead } = await supabase.from("ghl_sync_jobs").select("id").eq("sync_run_id", run.id).in("status", INTERRUPTED_JOB_STATUSES).limit(1);
  const status = (dead ?? []).length > 0 ? "partial" : "succeeded";
  await supabase.from("ghl_sync_runs").update({
    status,
    completed_at: new Date().toISOString(),
    metadata_safe: {
      ...(run.metadata_safe ?? {}),
      one_object_sync_complete: status === "succeeded",
      last_progress_at: new Date().toISOString()
    }
  }).eq("id", run.id);
  const connectionUpdate = status === "succeeded"
    ? { status: "healthy", last_successful_sync_at: new Date().toISOString() }
    : { status: "warning" };
  await supabase.from("ghl_connections").update(connectionUpdate).eq("id", connectionId);
}

export async function queueGhlFullImport(supabase: SupabaseClient, profile: CurrentProfile, connection: GhlConnection) {
  assertGhlReadMode();
  if (isMockGhlConnection(connection)) throw new Error("Full historical import is only available for real read-only GHL connections.");
  if (!tokenPresentForConnection(connection)) throw new Error("GoHighLevel token is not configured for this connection.");
  const { data: existingRun } = await supabase
    .from("ghl_sync_runs")
    .select("*")
    .eq("connection_id", connection.id)
    .eq("sync_type", "full_import")
    .in("status", resumableFullImportStatuses())
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingRun?.id && ["queued", "running"].includes(String(existingRun.status))) return String(existingRun.id);
  if (existingRun?.id && ["partial", "failed", "cancelled"].includes(String(existingRun.status)) && fullImportRunLooksIncomplete(existingRun as SyncRunRow)) {
    await resumeGhlFullImport(supabase, profile, connection, String(existingRun.id));
    return String(existingRun.id);
  }

  const firstObject = FULL_IMPORT_OBJECT_ORDER.find((objectType) => fullImportObjectEnabled(connection, objectType)) ?? "location_metadata";
  const firstIndex = FULL_IMPORT_OBJECT_ORDER.indexOf(firstObject);
  const { data: run, error } = await supabase.from("ghl_sync_runs").insert({
    organization_id: profile.organizationId,
    connection_id: connection.id,
    sync_type: "full_import",
    object_type: null,
    status: "queued",
    started_at: new Date().toISOString(),
    metadata_safe: {
      phase: 21,
      read_only: true,
      ghl_writes_performed: false,
      normalized_business_records_written: true,
      current_object: firstObject,
      current_object_index: firstIndex,
      object_count: FULL_IMPORT_OBJECT_ORDER.length,
      page_size: FULL_IMPORT_PAGE_SIZE,
      record_batch_size: FULL_IMPORT_RECORD_BATCH_SIZE
    }
  }).select("*").single();
  if (error) throw new Error(error.message);
  const syncRun = run as SyncRunRow;
  await queueFanOutJobs(supabase, syncRun, connection, firstObject);
  await supabase.from("ghl_connections").update({ status: "syncing" }).eq("id", connection.id);
  return syncRun.id;
}

export async function resumeGhlFullImport(supabase: SupabaseClient, profile: CurrentProfile, connection: GhlConnection, runId?: string) {
  assertGhlReadMode();
  const { data: runData } = runId
    ? await supabase.from("ghl_sync_runs").select("*").eq("id", runId).eq("connection_id", connection.id).single()
    : await supabase.from("ghl_sync_runs").select("*").eq("connection_id", connection.id).eq("sync_type", "full_import").in("status", resumableFullImportStatuses()).order("started_at", { ascending: false }).limit(1).single();
  const run = runData as SyncRunRow | null;
  if (!run) throw new Error("No resumable GHL full import was found.");
  if (run.organization_id !== profile.organizationId) throw new Error("Import run is not available for this organization.");
  if (!fullImportRunLooksIncomplete(run)) throw new Error("No incomplete GHL full import was found.");
  const { data: active } = await supabase.from("ghl_sync_jobs").select("id").eq("sync_run_id", run.id).in("status", ACTIVE_JOB_STATUSES).limit(1);
  if ((active ?? []).length === 0) {
    const { data: deadJob } = await supabase.from("ghl_sync_jobs").select("*").eq("sync_run_id", run.id).in("status", INTERRUPTED_JOB_STATUSES).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (deadJob?.id) {
      await supabase.from("ghl_sync_jobs").update({ status: "queued", run_at: new Date().toISOString(), last_error: null, locked_at: null, locked_by: null }).eq("id", deadJob.id);
    } else {
      const currentObject = (run.metadata_safe?.current_object as GhlImportObjectType | undefined) ?? "location_metadata";
      await queueResumeCheckpointJob(supabase, run, connection, currentObject);
    }
  }
  await supabase.from("ghl_sync_runs").update({
    status: "queued",
    completed_at: null,
    error_summary: null,
    metadata_safe: {
      ...(run.metadata_safe ?? {}),
      resumed_at: new Date().toISOString(),
      resume_reason: run.status === "cancelled" ? "user_paused_cancelled_run" : "manual_resume"
    }
  }).eq("id", run.id);
  await supabase.from("ghl_connections").update({ status: "syncing" }).eq("id", connection.id);
  return run.id;
}

export async function cancelGhlFullImport(supabase: SupabaseClient, profile: CurrentProfile, connection: GhlConnection) {
  const { data: run } = await supabase.from("ghl_sync_runs").select("*").eq("connection_id", connection.id).eq("sync_type", "full_import").in("status", ["queued", "running", "partial", "failed"]).order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (!run) return null;
  if (String(run.organization_id) !== profile.organizationId) throw new Error("Import run is not available for this organization.");
  await supabase.from("ghl_sync_jobs").update({ status: "dead_letter", last_error: "Paused by user", completed_at: new Date().toISOString() }).eq("sync_run_id", run.id).in("status", ACTIVE_JOB_STATUSES);
  await supabase.from("ghl_sync_runs").update({
    status: "partial",
    completed_at: null,
    error_summary: "Paused by user",
    metadata_safe: {
      ...(record(run.metadata_safe)),
      paused_at: new Date().toISOString(),
      pause_reason: "user_cancelled_future_pages"
    }
  }).eq("id", run.id);
  await supabase.from("ghl_connections").update({ status: "warning" }).eq("id", connection.id);
  return String(run.id);
}

async function handleJobError(supabase: SupabaseClient, run: SyncRunRow, job: SyncJobRow, error: unknown) {
  const safeError = safeGhlError(error);
  const retryable = error instanceof GhlIntegrationError ? error.retryable : true;
  if (retryable && job.attempts < FULL_IMPORT_MAX_ATTEMPTS) {
    const runAt = new Date(Date.now() + retryDelayMs({ attempt: job.attempts, maxAttempts: FULL_IMPORT_MAX_ATTEMPTS })).toISOString();
    await supabase.from("ghl_sync_jobs").update({ status: "queued", run_at: runAt, last_error: safeError.message, metadata_safe: { ...(job.metadata_safe ?? {}), last_safe_error: safeError } }).eq("id", job.id);
    console.log(JSON.stringify({ event: "ghl_worker_retry_scheduled", jobId: job.id, objectType: job.object_type, runAt, attempt: Number(job.attempts ?? 0) + 1 }));
    return "retried";
  }
  await supabase.from("ghl_sync_jobs").update({ status: "dead_letter", completed_at: new Date().toISOString(), last_error: safeError.message, metadata_safe: { ...(job.metadata_safe ?? {}), terminal_safe_error: safeError } }).eq("id", job.id);
  await updateRunCounts(supabase, run, { ...zeroCounts(), failed: 1 }, { last_error: safeError.message });
  await supabase.from("ghl_sync_runs").update({ status: "partial", error_summary: safeError.message }).eq("id", run.id);
  return "failed";
}

async function processClaimedJob(supabase: SupabaseClient, job: SyncJobRow) {
  const [{ data: connectionData }, { data: runData }] = await Promise.all([
    supabase.from("ghl_connections").select("*").eq("id", job.connection_id).single(),
    supabase.from("ghl_sync_runs").select("*").eq("id", job.sync_run_id).single()
  ]);
  const connection = connectionData as GhlConnection;
  const run = runData as SyncRunRow;
  if (run.status === "cancelled") {
    await supabase.from("ghl_sync_jobs").update({ status: "dead_letter", completed_at: new Date().toISOString(), last_error: "Run cancelled" }).eq("id", job.id);
    return { status: "failed", queuedNext: 0 };
  }

  try {
    const result = await processPage(supabase, run, connection, job);
    const isTargetedContactRetry = job.object_type === "contact" && record(job.metadata_safe).targeted_failed_record_retry === true;
    await updateRunCounts(supabase, run, result.counts, isTargetedContactRetry
      ? { targeted_retry_object: job.object_type, targeted_retry_cursor: job.cursor_value, last_targeted_retry_page: result.pageMetadata }
      : { current_object: job.object_type, current_cursor: result.nextPageToken, current_page: job.page_token, last_page: result.pageMetadata });
    const jobMetadata = record(job.metadata_safe);
    const incrementalPageCount = Number(jobMetadata.incremental_page_count ?? 1);
    const maxIncrementalPages = positiveInteger(process.env.GHL_INCREMENTAL_MAX_PAGES_PER_OBJECT, GHL_INCREMENTAL_MAX_PAGES_PER_OBJECT);
    const pauseIncrementalPage = run.sync_type === "incremental" && Boolean(result.nextPageToken) && incrementalPageCount >= maxIncrementalPages;
    if (!isTargetedContactRetry) await saveCursor(supabase, connection, job.object_type, result.nextPageToken, !result.nextPageToken || pauseIncrementalPage);
    await supabase.from("ghl_sync_jobs").update({ status: "completed", completed_at: new Date().toISOString(), metadata_safe: { ...(job.metadata_safe ?? {}), completed_page: result.pageMetadata, counts: result.counts } }).eq("id", job.id);
    await insertEvent(supabase, run, connection, job.object_type, job.cursor_value, "import_page", result.counts.failed ? "failed" : "mapped", null, { counts: result.counts, next_page_token: result.nextPageToken });
    if (pauseIncrementalPage) {
      await finalizeOneObjectRunIfDone(supabase, run, connection.id);
      return { status: "completed", queuedNext: 0 };
    }
    if (isTargetedContactRetry) {
      const queuedNext = await requeueOpportunityDeadLettersIfDependenciesReady(supabase, run, connection);
      if (queuedNext > 0) return { status: "completed", queuedNext };
    }
    if (result.nextPageToken) {
      await queueJob(supabase, run, connection, job.object_type, {
        pageToken: result.nextPageToken,
        cursorValue: job.cursor_value,
        metadata: {
          ...jobMetadata,
          incremental_page_count: run.sync_type === "incremental" ? incrementalPageCount + 1 : undefined,
          resumed_from_job_id: job.id
        }
      });
      return { status: "completed", queuedNext: 1 };
    }
    if (run.sync_type === "webhook" || run.sync_type === "incremental") {
      await finalizeOneObjectRunIfDone(supabase, run, connection.id);
      return { status: "completed", queuedNext: 0 };
    }
    const queuedNext = await queueNextObjectIfReady(supabase, run, connection, job.object_type);
    return { status: "completed", queuedNext };
  } catch (error) {
    const status = await handleJobError(supabase, run, job, error);
    return { status, queuedNext: 0 };
  }
}

function staleLockCutoffIso(now = Date.now()) {
  return new Date(now - FULL_IMPORT_STALE_LOCK_MS).toISOString();
}

function jobHeartbeatAt(job: { metadata_safe?: Record<string, unknown> | null; updated_at?: string | null; locked_at?: string | null }) {
  const metadata = record(job.metadata_safe);
  return text(metadata.heartbeat_at) || text(job.updated_at) || text(job.locked_at);
}

async function recoverStaleGhlLocks(supabase: SupabaseClient, workerId: string) {
  const cutoff = staleLockCutoffIso();
  const { data: staleJobs, error } = await supabase
    .from("ghl_sync_jobs")
    .select("id, object_type, locked_at, locked_by, updated_at, metadata_safe")
    .in("status", ["locked", "running"])
    .limit(50);
  if (error) throw new Error(error.message);
  const staleIds = (staleJobs ?? [])
    .filter((job) => {
      const heartbeatAt = jobHeartbeatAt(job);
      return heartbeatAt ? heartbeatAt < cutoff : false;
    })
    .map((job) => String(job.id));
  if (staleIds.length === 0) return 0;
  const { error: updateError } = await supabase
    .from("ghl_sync_jobs")
    .update({
      status: "queued",
      locked_at: null,
      locked_by: null,
      run_at: new Date().toISOString(),
      last_error: "Recovered stale GHL worker heartbeat"
    })
    .in("id", staleIds);
  if (updateError) throw new Error(updateError.message);
  console.log(JSON.stringify({ event: "ghl_worker_stale_locks_recovered", workerId, count: staleIds.length, cutoff }));
  return staleIds.length;
}

export async function getGhlWorkerQueueDiagnostics(supabase: SupabaseClient) {
  const now = new Date().toISOString();
  const { data: jobs, error } = await supabase
    .from("ghl_sync_jobs")
    .select("id, sync_run_id, object_type, page_token, status, attempts, run_at, locked_at, locked_by, updated_at, metadata_safe")
    .in("status", ["queued", "locked", "running", "failed", "dead_letter", "completed"])
    .order("run_at", { ascending: true })
    .limit(1000);
  if (error) throw new Error(error.message);
  const rows = jobs ?? [];
  const dueQueued = rows.filter((job) => job.status === "queued" && String(job.run_at) <= now);
  const futureQueued = rows.filter((job) => job.status === "queued" && String(job.run_at) > now);
  const active = rows.filter((job) => job.status === "locked" || job.status === "running");
  const staleCutoff = staleLockCutoffIso();
  const stale = active.filter((job) => {
    const heartbeatAt = jobHeartbeatAt(job);
    return heartbeatAt ? heartbeatAt < staleCutoff : false;
  });
  const counts = rows.reduce<Record<string, number>>((memo, job) => {
    const status = String(job.status ?? "unknown");
    memo[status] = (memo[status] ?? 0) + 1;
    return memo;
  }, {});
  const nextDue = dueQueued[0] ?? null;
  const nextFuture = futureQueued[0] ?? null;
  return {
    now,
    counts,
    dueQueued: dueQueued.length,
    futureQueued: futureQueued.length,
    active: active.length,
    staleLocks: stale.length,
    nextDueJob: nextDue ? {
      id: String(nextDue.id),
      syncRunId: String(nextDue.sync_run_id),
      objectType: String(nextDue.object_type),
      pageToken: nextDue.page_token ? String(nextDue.page_token) : null,
      attempts: Number(nextDue.attempts ?? 0),
      runAt: String(nextDue.run_at),
      lockedAt: nextDue.locked_at ? String(nextDue.locked_at) : null,
      lockedBy: nextDue.locked_by ? String(nextDue.locked_by) : null
    } : null,
    activeJobs: active.slice(0, 10).map((job) => ({
      id: String(job.id),
      syncRunId: String(job.sync_run_id),
      objectType: String(job.object_type),
      pageToken: job.page_token ? String(job.page_token) : null,
      status: String(job.status),
      attempts: Number(job.attempts ?? 0),
      runAt: String(job.run_at),
      lockedAt: job.locked_at ? String(job.locked_at) : null,
      lockedBy: job.locked_by ? String(job.locked_by) : null,
      updatedAt: job.updated_at ? String(job.updated_at) : null,
      heartbeatAt: jobHeartbeatAt(job) || null,
      heartbeatStage: text(record(job.metadata_safe).heartbeat_stage) || null,
      stale: stale.some((staleJob) => String(staleJob.id) === String(job.id))
    })),
    nextFutureJob: nextFuture ? {
      id: String(nextFuture.id),
      objectType: String(nextFuture.object_type),
      pageToken: nextFuture.page_token ? String(nextFuture.page_token) : null,
      attempts: Number(nextFuture.attempts ?? 0),
      runAt: String(nextFuture.run_at)
    } : null
  };
}

async function claimNextJob(supabase: SupabaseClient, workerId: string, diagnostics: string[]) {
  await recoverStaleGhlLocks(supabase, workerId);
  const snapshot = await getGhlWorkerQueueDiagnostics(supabase);
  diagnostics.push(`jobs_found due=${snapshot.dueQueued} future=${snapshot.futureQueued} active=${snapshot.active} stale=${snapshot.staleLocks}`);
  if (snapshot.dueQueued === 0) {
    diagnostics.push(snapshot.nextFutureJob ? `no_jobs_due next_run_at=${snapshot.nextFutureJob.runAt}` : "no_jobs_due");
    console.log(JSON.stringify({ event: "ghl_worker_no_jobs_due", dueQueued: snapshot.dueQueued, futureQueued: snapshot.futureQueued, active: snapshot.active, staleLocks: snapshot.staleLocks, nextRunAt: snapshot.nextFutureJob?.runAt ?? null }));
    return null;
  }
  const { data: job } = await supabase
    .from("ghl_sync_jobs")
    .select("*")
    .eq("status", "queued")
    .lte("run_at", new Date().toISOString())
    .order("run_at")
    .limit(1)
    .maybeSingle();
  if (!job) return null;
  const { data: claimed } = await supabase
    .from("ghl_sync_jobs")
    .update({
      status: "running",
      locked_at: new Date().toISOString(),
      locked_by: workerId,
      attempts: Number(job.attempts ?? 0) + 1
    })
    .eq("id", job.id)
    .eq("status", "queued")
    .select("*")
    .maybeSingle();
  if (claimed?.id) {
    diagnostics.push(`job_claimed id=${claimed.id} object=${claimed.object_type} page=${claimed.page_token ?? "first"}`);
    console.log(JSON.stringify({ event: "ghl_worker_job_claimed", jobId: claimed.id, objectType: claimed.object_type, pageToken: claimed.page_token ?? null, workerId }));
  }
  return (claimed ?? null) as SyncJobRow | null;
}

export async function processGhlSyncJobs(supabase: SupabaseClient, options: { maxJobs?: number; workerId?: string } = {}): Promise<WorkerResult> {
  assertGhlReadMode();
  const result: WorkerResult = { claimed: 0, completed: 0, retried: 0, failed: 0, queuedNext: 0, diagnostics: [] };
  const maxJobs = options.maxJobs ?? FULL_IMPORT_MAX_JOBS_PER_INVOCATION;
  const workerId = options.workerId ?? `phase21-worker-${Date.now()}`;
  result.diagnostics.push(`poll_started worker=${workerId} maxJobs=${maxJobs}`);
  console.log(JSON.stringify({ event: "ghl_worker_poll_started", workerId, maxJobs }));
  for (let index = 0; index < maxJobs; index += 1) {
    const job = await claimNextJob(supabase, workerId, result.diagnostics);
    if (!job) break;
    result.claimed += 1;
    const processed = await processClaimedJob(supabase, job);
    result.queuedNext += processed.queuedNext;
    if (processed.status === "completed") result.completed += 1;
    else if (processed.status === "retried") result.retried += 1;
    else result.failed += 1;
  }
  return result;
}
