"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { assertGhlReadMode, credentialEnvKeyForLocationSlug } from "@/lib/integrations/gohighlevel/config";
import { applyAppointmentStatusBackfill, buildAppointmentStatusBackfillDryRun } from "@/lib/integrations/gohighlevel/appointment-status-backfill";
import {
  applyGhlCalendarTypeBackfill,
  buildGhlCalendarTypeBackfillPlan,
  upsertGhlCalendarTypeMapping,
  validateCalendarTypeBackfillRequest
} from "@/lib/integrations/gohighlevel/calendar-type-mapping";
import { buildGhlDryRunPreview, countsFromDryRunPreview } from "@/lib/integrations/gohighlevel/dry-run";
import { safeGhlError } from "@/lib/integrations/gohighlevel/errors";
import { validateAppointmentStatusBackfillRequest } from "@/lib/integrations/gohighlevel/appointment-status-backfill-request";
import { cancelGhlFullImport, queueDueGhlIncrementalReconciliation, queueGhlFullImport, resumeGhlFullImport, retryGhlFailedRecords } from "@/lib/integrations/gohighlevel/importer";
import { assertGhlPermission, ghlLocationAllowed } from "@/lib/integrations/gohighlevel/permissions";
import { testGhlConnection, createSyncRun } from "@/lib/integrations/gohighlevel/sync";
import type { GhlConnection } from "@/lib/integrations/gohighlevel/types";

function required(value: FormDataEntryValue | null, label: string) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function isMockGhlLocationId(ghlLocationId: string) {
  return ghlLocationId.startsWith("ghl_mock_");
}

async function loadConnection(connectionId: string) {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const { data, error } = await supabase.from("ghl_connections").select("*").eq("id", connectionId).eq("organization_id", profile.organizationId).single();
  if (error || !data) throw new Error("GoHighLevel connection not found");
  const connection = data as GhlConnection;
  if (!ghlLocationAllowed(profile, connection.location_id)) throw new Error("GoHighLevel connection is not available for this user");
  return { profile, supabase, connection };
}

function internalGhlWorkerUrl(search = "") {
  const appUrl = process.env.APP_URL;
  if (!appUrl) throw new Error("APP_URL is required to reach the internal GHL worker");
  return new URL(`/api/integrations/gohighlevel/sync${search}`, appUrl);
}

function internalGhlWorkerHeaders() {
  const headers: Record<string, string> = {};
  if (process.env.CRON_SECRET) {
    headers.authorization = `Bearer ${process.env.CRON_SECRET}`;
    headers["x-cron-secret"] = process.env.CRON_SECRET;
  }
  return headers;
}

type WorkerResponsePayload = {
  ok?: boolean;
  error?: string;
  claimed?: number;
  queuedNext?: number;
  diagnostics?: string[];
  queue?: {
    dueQueued?: number;
    futureQueued?: number;
    active?: number;
    staleLocks?: number;
    nextFutureJob?: { runAt?: string | null } | null;
  };
};

async function readWorkerResponse(response: Response) {
  const payload = await response.json().catch(() => null) as WorkerResponsePayload | null;
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Internal GHL worker returned HTTP ${response.status}`);
  }
  return payload;
}

function workerResponseIsStarted(payload: WorkerResponsePayload) {
  if (Number(payload.claimed ?? 0) > 0) return true;
  if (Number(payload.queuedNext ?? 0) > 0) return true;
  if (Number(payload.queue?.active ?? 0) > 0) return true;
  if (Number(payload.queue?.futureQueued ?? 0) > 0) return true;
  return false;
}

function workerStartDiagnostic(payload: WorkerResponsePayload) {
  if (Number(payload.queue?.active ?? 0) > 0) return "a GHL import job is already running.";
  if (Number(payload.queue?.futureQueued ?? 0) > 0) return `the next GHL import job is deferred until ${payload.queue?.nextFutureJob?.runAt ?? "its scheduled retry time"}.`;
  if (Number(payload.queue?.staleLocks ?? 0) > 0) return "stale GHL worker locks were detected and will be recovered on the next poll.";
  const diagnostic = payload.diagnostics?.find((item) => item.includes("jobs_found")) ?? payload.diagnostics?.[0];
  return diagnostic ?? "no due GHL import job was available to claim.";
}

async function verifyGhlWorkerPath() {
  try {
    const response = await fetch(internalGhlWorkerUrl("?diagnostic=1"), {
      method: "POST",
      headers: internalGhlWorkerHeaders(),
      cache: "no-store"
    });
    await readWorkerResponse(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal GHL worker could not be reached";
    throw new Error(`Start Full Import could not verify the internal worker: ${message}`);
  }
}

async function kickGhlWorkerOnce() {
  try {
    const response = await fetch(internalGhlWorkerUrl("?maxJobs=1"), {
      method: "POST",
      headers: internalGhlWorkerHeaders(),
      cache: "no-store"
    });
    const payload = await readWorkerResponse(response);
    if (!workerResponseIsStarted(payload)) {
      throw new Error(`Internal GHL worker responded but did not claim a queued job: ${workerStartDiagnostic(payload)}`);
    }
    return payload;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal GHL worker could not be reached";
    throw new Error(`Full import was queued, but the internal worker did not start: ${message}`);
  }
}

export async function saveGhlConnection(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertGhlPermission(profile, "integrations.ghl.manage");
  const supabase = await createClient();
  const locationId = required(formData.get("location_id"), "Location");
  if (!ghlLocationAllowed(profile, locationId)) throw new Error("Location is not available for this user");
  const location = profile.locations.find((item) => item.id === locationId);
  const displayName = required(formData.get("display_name"), "Connection name").slice(0, 120);
  const ghlLocationId = required(formData.get("ghl_location_id"), "GHL Location ID").slice(0, 120);
  const requestedSyncMode = String(formData.get("sync_mode") ?? "read_only");
  const syncMode = requestedSyncMode === "development" && !isMockGhlLocationId(ghlLocationId) ? "read_only" : requestedSyncMode;
  if (!["disabled", "development", "read_only"].includes(syncMode)) throw new Error("Phase 21 supports disabled, development, or read-only sync only");

  const { error } = await supabase.from("ghl_connections").upsert({
    organization_id: profile.organizationId,
    location_id: locationId,
    display_name: displayName,
    ghl_location_id: ghlLocationId,
    credential_env_key: location ? credentialEnvKeyForLocationSlug(location.slug) : null,
    connection_type: syncMode === "development" && isMockGhlLocationId(ghlLocationId) ? "mock" : "private_integration",
    status: syncMode === "disabled" ? "disabled" : "warning",
    sync_mode: syncMode,
    token_present: false,
    metadata_safe: { configured_from_ui: true, phase: 21 }
  }, { onConflict: "organization_id,ghl_location_id" });
  if (error) throw new Error(error.message);
  revalidatePath("/settings/integrations/gohighlevel");
  revalidatePath("/integrations/gohighlevel");
}

export async function testGhlConnectionAction(formData: FormData) {
  const { profile, supabase, connection } = await loadConnection(required(formData.get("connection_id"), "Connection"));
  assertGhlPermission(profile, "integrations.ghl.sync");
  assertGhlReadMode();
  const result = await testGhlConnection(connection);
  await createSyncRun(supabase, profile, connection, "connection_test", null, {
    fetched: Number(result.counts.contacts ?? 0) + Number(result.counts.calendars ?? 0),
    created: 0,
    updated: 0,
    unchanged: Number(result.counts.contacts ?? 0) + Number(result.counts.calendars ?? 0),
    skipped: 0,
    failed: result.connected ? 0 : 1,
    pages: 1
  });
  await supabase.from("ghl_connections").update({
    status: result.connected ? "healthy" : "warning",
    token_present: !result.mock && result.connected,
    last_successful_sync_at: result.connected ? new Date().toISOString() : connection.last_successful_sync_at,
    metadata_safe: { last_test: { ...result, token: undefined } }
  }).eq("id", connection.id);
  revalidatePath("/integrations/gohighlevel");
}

export async function startGhlDryRunAction(formData: FormData) {
  const { profile, supabase, connection } = await loadConnection(required(formData.get("connection_id"), "Connection"));
  assertGhlPermission(profile, "integrations.ghl.sync");
  assertGhlReadMode();
  const preview = await buildGhlDryRunPreview(supabase, profile, connection);
  await createSyncRun(supabase, profile, connection, "dry_run", null, countsFromDryRunPreview(preview), {
    dry_run_preview: preview,
    normalized_business_records_written: false,
    ghl_writes_performed: false
  });
  revalidatePath("/settings/integrations/gohighlevel");
  revalidatePath("/integrations/gohighlevel");
  revalidatePath("/integrations/gohighlevel/runs");
}

export async function startGhlAppointmentStatusBackfillDryRunAction(formData: FormData) {
  const { profile, supabase, connection } = await loadConnection(required(formData.get("connection_id"), "Connection"));
  assertGhlPermission(profile, "integrations.ghl.sync");
  assertGhlReadMode();
  const report = await buildAppointmentStatusBackfillDryRun(supabase, profile, connection);
  await createSyncRun(supabase, profile, connection, "manual_object_sync", "appointment", {
    fetched: report.providerAppointmentsFetched,
    created: 0,
    updated: 0,
    unchanged: Math.max(0, report.mappingsRead - report.wouldChangeCount),
    skipped: report.unresolvedCount,
    failed: 0,
    pages: report.providerPagesFetched
  }, {
    appointment_status_backfill_dry_run: report,
    normalized_business_records_written: false,
    ghl_writes_performed: false
  });
  revalidatePath("/settings/integrations/gohighlevel");
  revalidatePath("/integrations/gohighlevel");
  revalidatePath("/integrations/gohighlevel/runs");
}

export async function applyGhlAppointmentStatusBackfillAction(formData: FormData) {
  const { connectionId, expectedCandidateCount } = validateAppointmentStatusBackfillRequest({
    connectionId: formData.get("connection_id"),
    confirmation: formData.get("confirmation"),
    expectedCandidateCount: formData.get("expected_candidate_count")
  });
  const { profile, supabase, connection } = await loadConnection(connectionId);
  assertGhlPermission(profile, "integrations.ghl.sync");
  assertGhlReadMode();
  const report = await applyAppointmentStatusBackfill(supabase, profile, connection, { expectedCandidateCount });
  const runId = await createSyncRun(supabase, profile, connection, "manual_object_sync", "appointment", {
    fetched: report.providerAppointmentsFetched,
    created: 0,
    updated: report.appointmentStatusChangedCount,
    unchanged: Math.max(0, report.mappingsRead - report.appointmentStatusChangedCount),
    skipped: report.unresolvedCount,
    failed: report.failedCount,
    pages: report.providerPagesFetched
  }, {
    appointment_status_backfill_apply: report,
    normalized_business_records_written: report.appointmentStatusChangedCount > 0,
    status_update_candidates: report.applyCandidateCount,
    mapping_metadata_updated: report.mappingMetadataUpdatedCount,
    ghl_writes_performed: false
  });
  if (report.failedCount > 0) {
    await supabase.from("ghl_sync_runs").update({ status: "partial", error_summary: `${report.failedCount} appointment status backfill updates failed` }).eq("id", runId);
  }
  revalidatePath("/settings/integrations/gohighlevel");
  revalidatePath("/integrations/gohighlevel");
  revalidatePath("/integrations/gohighlevel/runs");
}

export async function saveGhlCalendarTypeMappingAction(formData: FormData) {
  const { profile, supabase, connection } = await loadConnection(required(formData.get("connection_id"), "Connection"));
  assertGhlPermission(profile, "integrations.ghl.sync");
  assertGhlReadMode();
  await upsertGhlCalendarTypeMapping(supabase, profile, connection, {
    externalCalendarId: required(formData.get("external_calendar_id"), "GHL calendar"),
    appointmentTypeId: required(formData.get("appointment_type_id"), "Appointment type")
  });
  revalidatePath("/settings/integrations/gohighlevel/calendars");
  revalidatePath("/settings/integrations/gohighlevel");
  revalidatePath("/calendar");
}

export async function previewGhlCalendarTypeBackfillAction(formData: FormData) {
  const { profile, supabase, connection } = await loadConnection(required(formData.get("connection_id"), "Connection"));
  assertGhlPermission(profile, "integrations.ghl.sync");
  assertGhlReadMode();
  const plan = await buildGhlCalendarTypeBackfillPlan(supabase, connection);
  await createSyncRun(supabase, profile, connection, "manual_object_sync", "appointment", {
    fetched: plan.appointmentMappings,
    created: 0,
    updated: 0,
    unchanged: Math.max(0, plan.appointmentMappings - plan.candidateCount),
    skipped: plan.missingCalendarMapping + plan.ambiguousMapping + plan.locationMismatch + plan.missingInternalAppointment,
    failed: 0,
    pages: 1
  }, {
    ghl_calendar_type_backfill_preview: {
      appointmentsScanned: plan.appointmentsScanned,
      mappedCalendars: plan.mappedCalendars,
      mappedAppointments: plan.mappedAppointments,
      wouldUpdate: plan.wouldUpdate,
      missingCalendarMapping: plan.missingCalendarMapping,
      ambiguousMapping: plan.ambiguousMapping,
      providerAudit: plan.providerAudit
    },
    normalized_business_records_written: false,
    ghl_writes_performed: false
  });
  revalidatePath("/settings/integrations/gohighlevel/calendars");
  revalidatePath("/settings/integrations/gohighlevel");
  revalidatePath("/integrations/gohighlevel/runs");
  return {
    appointmentsScanned: plan.appointmentsScanned,
    mapped: plan.mappedAppointments,
    wouldUpdate: plan.wouldUpdate,
    missingCalendarMapping: plan.missingCalendarMapping,
    ambiguousMapping: plan.ambiguousMapping,
    alreadyCorrect: plan.alreadyCorrect,
    locationMismatch: plan.locationMismatch,
    providerAudit: plan.providerAudit
  };
}

export async function applyGhlCalendarTypeBackfillAction(formData: FormData) {
  const { connectionId, expectedCandidateCount } = validateCalendarTypeBackfillRequest({
    connectionId: formData.get("connection_id"),
    confirmation: formData.get("confirmation"),
    expectedCandidateCount: formData.get("expected_candidate_count")
  });
  const { profile, supabase, connection } = await loadConnection(connectionId);
  assertGhlPermission(profile, "integrations.ghl.sync");
  assertGhlReadMode();
  const report = await applyGhlCalendarTypeBackfill(supabase, connection, expectedCandidateCount);
  await createSyncRun(supabase, profile, connection, "manual_object_sync", "appointment", {
    fetched: report.appointmentMappings,
    created: 0,
    updated: report.changed,
    unchanged: Math.max(0, report.appointmentMappings - report.changed),
    skipped: 0,
    failed: report.failed,
    pages: 1
  }, {
    ghl_calendar_type_backfill_apply: {
      appointmentsScanned: report.appointmentsScanned,
      mappedCalendars: report.mappedCalendars,
      mappedAppointments: report.mappedAppointments,
      missingCalendarMapping: report.missingCalendarMapping,
      ambiguousMapping: report.ambiguousMapping,
      candidates: report.candidateCount,
      changed: report.changed,
      failed: report.failed,
      providerAudit: report.providerAudit
    },
    normalized_business_records_written: report.changed > 0,
    ghl_writes_performed: false
  });
  revalidatePath("/settings/integrations/gohighlevel/calendars");
  revalidatePath("/settings/integrations/gohighlevel");
  revalidatePath("/calendar");
  revalidatePath("/integrations/gohighlevel/runs");
  return {
    appointmentsScanned: report.appointmentsScanned,
    mapped: report.mappedAppointments,
    changed: report.changed,
    failed: report.failed,
    missingCalendarMapping: report.missingCalendarMapping,
    ambiguousMapping: report.ambiguousMapping,
    providerAudit: report.providerAudit
  };
}

export async function startGhlFullImportAction(formData: FormData) {
  const confirmation = required(formData.get("confirmation"), "Confirmation");
  if (confirmation !== "READ ONLY IMPORT") throw new Error("Type READ ONLY IMPORT to start a Phase 21 full import");
  const { profile, supabase, connection } = await loadConnection(required(formData.get("connection_id"), "Connection"));
  assertGhlPermission(profile, "integrations.ghl.sync");
  assertGhlReadMode();
  await verifyGhlWorkerPath();
  await queueGhlFullImport(supabase, profile, connection);
  await kickGhlWorkerOnce();
  revalidatePath("/settings/integrations/gohighlevel");
  revalidatePath("/integrations/gohighlevel");
  revalidatePath("/integrations/gohighlevel/runs");
}

export async function resumeGhlFullImportAction(formData: FormData) {
  const { profile, supabase, connection } = await loadConnection(required(formData.get("connection_id"), "Connection"));
  assertGhlPermission(profile, "integrations.ghl.sync");
  await resumeGhlFullImport(supabase, profile, connection);
  await kickGhlWorkerOnce();
  revalidatePath("/settings/integrations/gohighlevel");
  revalidatePath("/integrations/gohighlevel");
  revalidatePath("/integrations/gohighlevel/runs");
}

export async function retryGhlFailedRecordsAction(formData: FormData) {
  const { profile, supabase, connection } = await loadConnection(required(formData.get("connection_id"), "Connection"));
  assertGhlPermission(profile, "integrations.ghl.sync");
  const runId = String(formData.get("run_id") ?? "").trim() || undefined;
  await retryGhlFailedRecords(supabase, profile, connection, runId);
  await kickGhlWorkerOnce();
  revalidatePath("/settings/integrations/gohighlevel");
  revalidatePath("/integrations/gohighlevel");
  revalidatePath("/integrations/gohighlevel/runs");
}

export async function runGhlIncrementalSyncNowAction(formData: FormData) {
  const { profile, supabase, connection } = await loadConnection(required(formData.get("connection_id"), "Connection"));
  assertGhlPermission(profile, "integrations.ghl.sync");
  assertGhlReadMode();
  const queued = await queueDueGhlIncrementalReconciliation(supabase, { force: true, connectionId: connection.id });
  if (queued > 0) await kickGhlWorkerOnce();
  revalidatePath("/settings/integrations/gohighlevel");
  revalidatePath("/integrations/gohighlevel");
  revalidatePath("/integrations/gohighlevel/runs");
}

export async function cancelGhlFullImportAction(formData: FormData) {
  const { profile, supabase, connection } = await loadConnection(required(formData.get("connection_id"), "Connection"));
  assertGhlPermission(profile, "integrations.ghl.sync");
  await cancelGhlFullImport(supabase, profile, connection);
  revalidatePath("/settings/integrations/gohighlevel");
  revalidatePath("/integrations/gohighlevel");
  revalidatePath("/integrations/gohighlevel/runs");
}

export async function runGhlReconciliationAction(formData: FormData) {
  const { profile, supabase, connection } = await loadConnection(required(formData.get("connection_id"), "Connection"));
  assertGhlPermission(profile, "integrations.ghl.reconcile");
  await createSyncRun(supabase, profile, connection, "reconciliation", null, { fetched: 50, created: 0, updated: 0, unchanged: 48, skipped: 2, failed: 0, pages: 2 });
  revalidatePath("/integrations/gohighlevel/reconciliation");
}

export async function resolveGhlExceptionAction(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertGhlPermission(profile, "integrations.ghl.exceptions.manage");
  const supabase = await createClient();
  const exceptionId = required(formData.get("exception_id"), "Exception");
  const status = String(formData.get("status") ?? "resolved");
  if (!["resolved", "ignored", "review"].includes(status)) throw new Error("Invalid exception status");
  const { error } = await supabase.from("ghl_sync_exceptions").update({
    status,
    resolved_by: status === "review" ? null : profile.id,
    resolved_at: status === "review" ? null : new Date().toISOString(),
    resolution_notes: String(formData.get("resolution_notes") ?? "").slice(0, 500)
  }).eq("id", exceptionId).eq("organization_id", profile.organizationId);
  if (error) throw new Error(error.message);
  revalidatePath("/integrations/gohighlevel/exceptions");
}

export async function blockGhlWriteAction() {
  const error = safeGhlError(new Error("GHL writes disabled"));
  throw new Error(error.message ?? "GHL writes disabled");
}
