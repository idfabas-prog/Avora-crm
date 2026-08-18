import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentProfile } from "@/lib/auth/profile";
import { isMockGhlConnection, tokenPresentForConnection } from "./auth.ts";
import { GhlReadOnlyClient } from "./client.ts";
import { assertGhlReadMode } from "./config.ts";
import { mapAppointmentStatus, rawAppointmentStatus } from "./normalization.ts";
import { assertGhlPermission } from "./permissions.ts";
import type { GhlAppointment, GhlConnection } from "./types.ts";

export const appointmentStatusRawBuckets = [
  "scheduled",
  "new",
  "confirmed",
  "active",
  "booked",
  "showed",
  "completed",
  "complete",
  "cancelled",
  "canceled",
  "invalid",
  "noshow",
  "no-show",
  "no_show",
  "null",
  "blank",
  "other/unrecognized"
] as const;

export const appointmentStatusNormalizedBuckets = ["scheduled", "completed", "cancelled", "no_show", "review_required"] as const;

type RawBucket = typeof appointmentStatusRawBuckets[number];
type NormalizedBucket = typeof appointmentStatusNormalizedBuckets[number];

type MappingRow = {
  id?: string | null;
  external_id: string | null;
  internal_id: string | null;
  metadata_safe: Record<string, unknown> | null;
};

type AppointmentRow = {
  id: string;
  status: string | null;
};

type ProviderAppointmentRow = GhlAppointment & Record<string, unknown>;

export type AppointmentStatusBackfillDryRun = {
  generatedAt: string;
  connectionId: string;
  ghlLocationId: string;
  mappingsRead: number;
  providerAppointmentsFetched: number;
  providerPagesFetched: number;
  calendarsChecked: number;
  rawStatusBreakdown: Record<RawBucket, number>;
  proposedNormalizedBreakdown: Record<NormalizedBucket, number>;
  wouldChangeCount: number;
  unresolvedCount: number;
  providerRecordsNotFound: number;
  missingInternalAppointments: number;
  missingCalendarMetadata: number;
  proposedMetadataKeys: string[];
  normalizedBusinessRecordsWritten: false;
  ghlWritesPerformed: false;
};

type StatusBreakdown = Record<NormalizedBucket | "total" | "other", number>;

export type AppointmentStatusBackfillApplyPreview = AppointmentStatusBackfillDryRun & {
  previewedAt: string;
  applyCandidateCount: number;
  providerStatusesResolved: number;
  currentStatusBreakdown: StatusBreakdown;
  dryRunWouldChangeEqualsApplyCandidates: boolean;
};

export type AppointmentStatusBackfillApplyReport = AppointmentStatusBackfillDryRun & {
  appliedAt: string;
  applyCandidateCount: number;
  appointmentStatusChangedCount: number;
  mappingMetadataUpdatedCount: number;
  failedCount: number;
  reconciliation: Record<NormalizedBucket | "total", number>;
};

type AppointmentStatusBackfillPlan = {
  report: AppointmentStatusBackfillDryRun;
  metadataUpdates: Array<{
    mappingId: string | null;
    externalId: string;
    appointmentId: string;
    metadata: Record<string, unknown>;
  }>;
  statusChanges: Array<{
    appointmentId: string;
    fromStatus: string | null;
    toStatus: NormalizedBucket;
  }>;
  diagnostics: {
    providerStatusesResolved: number;
    currentStatusBreakdown: StatusBreakdown;
  };
};

function emptyCounts<T extends readonly string[]>(keys: T) {
  const counts = {} as Record<T[number], number>;
  for (const key of keys) {
    counts[key as T[number]] = 0;
  }
  return counts;
}

function text(value: unknown) {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  return "";
}

export function rawStatusBucket(value: string | null): RawBucket {
  if (value === null) return "null";
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "blank";
  if ((appointmentStatusRawBuckets as readonly string[]).includes(normalized) && normalized !== "null" && normalized !== "blank") return normalized as RawBucket;
  return "other/unrecognized";
}

function calendarIdFromMapping(mapping: MappingRow) {
  return text(mapping.metadata_safe?.calendar_id);
}

function statusReconciliation(rows: AppointmentRow[]) {
  const counts = emptyCounts(appointmentStatusNormalizedBuckets) as StatusBreakdown;
  counts.total = rows.length;
  counts.other = 0;
  for (const row of rows) {
    if ((appointmentStatusNormalizedBuckets as readonly string[]).includes(String(row.status))) {
      counts[row.status as NormalizedBucket] += 1;
    } else {
      counts.other += 1;
    }
  }
  return counts;
}

function mappedAppointmentRows(mappings: MappingRow[], appointments: AppointmentRow[]) {
  const appointmentById = new Map(appointments.map((appointment) => [appointment.id, appointment]));
  const rows: AppointmentRow[] = [];
  const seen = new Set<string>();
  for (const mapping of mappings) {
    if (!mapping.internal_id || seen.has(mapping.internal_id)) continue;
    const appointment = appointmentById.get(mapping.internal_id);
    if (!appointment) continue;
    seen.add(mapping.internal_id);
    rows.push(appointment);
  }
  return rows;
}

export function summarizeAppointmentStatusBackfill(input: {
  connection: Pick<GhlConnection, "id" | "ghl_location_id">;
  mappings: MappingRow[];
  appointments: AppointmentRow[];
  providerAppointments: ProviderAppointmentRow[];
  providerPagesFetched: number;
  calendarsChecked: number;
}): AppointmentStatusBackfillDryRun {
  const appointmentById = new Map(input.appointments.map((appointment) => [appointment.id, appointment]));
  const providerEntries = input.providerAppointments
    .map((appointment): [string, ProviderAppointmentRow] => [text(appointment.id), appointment])
    .filter(([id]) => Boolean(id));
  const providerByExternalId = new Map<string, ProviderAppointmentRow>(providerEntries);
  const rawStatusBreakdown = emptyCounts(appointmentStatusRawBuckets);
  const proposedNormalizedBreakdown = emptyCounts(appointmentStatusNormalizedBuckets);
  let wouldChangeCount = 0;
  let providerRecordsNotFound = 0;
  let missingInternalAppointments = 0;
  let missingCalendarMetadata = 0;
  let reviewRequiredCount = 0;

  for (const mapping of input.mappings) {
    const providerAppointment = providerByExternalId.get(text(mapping.external_id));
    const internalAppointment = mapping.internal_id ? appointmentById.get(mapping.internal_id) : null;
    if (!calendarIdFromMapping(mapping)) missingCalendarMetadata += 1;
    if (!internalAppointment) missingInternalAppointments += 1;
    if (!providerAppointment) {
      providerRecordsNotFound += 1;
      rawStatusBreakdown["null"] += 1;
      proposedNormalizedBreakdown.review_required += 1;
      reviewRequiredCount += 1;
      if (internalAppointment?.status !== "review_required") wouldChangeCount += 1;
      continue;
    }

    const rawStatus = rawAppointmentStatus(providerAppointment);
    const rawValue = rawStatus.value === null ? null : rawStatus.value;
    const rawBucket = rawStatusBucket(rawValue);
    rawStatusBreakdown[rawBucket] += 1;
    const mapped = mapAppointmentStatus(rawValue);
    const normalized = mapped.status as NormalizedBucket;
    proposedNormalizedBreakdown[normalized] += 1;
    if (normalized === "review_required") reviewRequiredCount += 1;
    if (internalAppointment && internalAppointment.status !== normalized) wouldChangeCount += 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    connectionId: input.connection.id,
    ghlLocationId: input.connection.ghl_location_id,
    mappingsRead: input.mappings.length,
    providerAppointmentsFetched: input.providerAppointments.length,
    providerPagesFetched: input.providerPagesFetched,
    calendarsChecked: input.calendarsChecked,
    rawStatusBreakdown,
    proposedNormalizedBreakdown,
    wouldChangeCount,
    unresolvedCount: providerRecordsNotFound + missingInternalAppointments + reviewRequiredCount,
    providerRecordsNotFound,
    missingInternalAppointments,
    missingCalendarMetadata,
    proposedMetadataKeys: ["raw_status", "raw_status_field", "status_requires_review"],
    normalizedBusinessRecordsWritten: false,
    ghlWritesPerformed: false
  };
}

export function planAppointmentStatusBackfill(input: {
  connection: Pick<GhlConnection, "id" | "ghl_location_id">;
  mappings: MappingRow[];
  appointments: AppointmentRow[];
  providerAppointments: ProviderAppointmentRow[];
  providerPagesFetched: number;
  calendarsChecked: number;
}): AppointmentStatusBackfillPlan {
  const report = summarizeAppointmentStatusBackfill(input);
  const appointmentById = new Map(input.appointments.map((appointment) => [appointment.id, appointment]));
  const providerByExternalId = new Map<string, ProviderAppointmentRow>(
    input.providerAppointments
      .map((appointment): [string, ProviderAppointmentRow] => [text(appointment.id), appointment])
      .filter(([id]) => Boolean(id))
  );
  const metadataUpdates: AppointmentStatusBackfillPlan["metadataUpdates"] = [];
  const statusChanges: AppointmentStatusBackfillPlan["statusChanges"] = [];

  for (const mapping of input.mappings) {
    const externalId = text(mapping.external_id);
    const providerAppointment = providerByExternalId.get(externalId);
    const internalAppointment = mapping.internal_id ? appointmentById.get(mapping.internal_id) : null;
    if (!externalId || !providerAppointment || !internalAppointment) continue;
    const rawStatus = rawAppointmentStatus(providerAppointment);
    const mapped = mapAppointmentStatus(rawStatus.value);
    const proposedStatus = mapped.status as NormalizedBucket;
    const currentMetadata = mapping.metadata_safe ?? {};
    const metadata = {
      ...currentMetadata,
      raw_status: mapped.raw,
      raw_status_field: rawStatus.field,
      status_requires_review: mapped.needsReview,
      normalized_status: proposedStatus,
      status_backfill_source: "gohighlevel_calendar_events"
    };
    if (
      currentMetadata.raw_status !== metadata.raw_status
      || currentMetadata.raw_status_field !== metadata.raw_status_field
      || currentMetadata.status_requires_review !== metadata.status_requires_review
      || currentMetadata.normalized_status !== metadata.normalized_status
      || currentMetadata.status_backfill_source !== metadata.status_backfill_source
    ) {
      metadataUpdates.push({
        mappingId: mapping.id ?? null,
        externalId,
        appointmentId: internalAppointment.id,
        metadata
      });
    }
    if (internalAppointment.status !== proposedStatus) {
      statusChanges.push({
        appointmentId: internalAppointment.id,
        fromStatus: internalAppointment.status,
        toStatus: proposedStatus
      });
    }
  }

  return {
    report,
    metadataUpdates,
    statusChanges,
    diagnostics: {
      providerStatusesResolved: report.mappingsRead - report.providerRecordsNotFound,
      currentStatusBreakdown: statusReconciliation(mappedAppointmentRows(input.mappings, input.appointments))
    }
  };
}

export function previewAppointmentStatusBackfillPlan(plan: AppointmentStatusBackfillPlan): AppointmentStatusBackfillApplyPreview {
  return {
    ...plan.report,
    previewedAt: new Date().toISOString(),
    applyCandidateCount: plan.statusChanges.length,
    providerStatusesResolved: plan.diagnostics.providerStatusesResolved,
    currentStatusBreakdown: plan.diagnostics.currentStatusBreakdown,
    dryRunWouldChangeEqualsApplyCandidates: plan.report.wouldChangeCount === plan.statusChanges.length
  };
}

function appointmentWindow() {
  const start = new Date();
  start.setFullYear(start.getFullYear() - 5);
  const end = new Date();
  end.setFullYear(end.getFullYear() + 2);
  return { startTime: start.getTime(), endTime: end.getTime() };
}

async function selectAll<T>(queryFactory: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, pageSize = 1000) {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await queryFactory(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function loadAppointmentRows(supabase: SupabaseClient, organizationId: string, locationId: string | null) {
  return selectAll<AppointmentRow>((from, to) => {
    let query = supabase
      .from("appointments")
      .select("id,status")
      .eq("organization_id", organizationId)
      .range(from, to);
    if (locationId) query = query.eq("location_id", locationId);
    return query;
  });
}

async function loadAppointmentMappings(supabase: SupabaseClient, connectionId: string) {
  return selectAll<MappingRow>((from, to) => supabase
    .from("external_record_mappings")
    .select("id,external_id,internal_id,metadata_safe")
    .eq("provider", "gohighlevel")
    .eq("connection_id", connectionId)
    .eq("external_object_type", "appointment")
    .range(from, to));
}

async function loadAppointmentsByIds(supabase: SupabaseClient, organizationId: string, ids: string[]) {
  const rows: AppointmentRow[] = [];
  for (let index = 0; index < ids.length; index += 1000) {
    const chunk = ids.slice(index, index + 1000);
    const { data, error } = await supabase
      .from("appointments")
      .select("id,status")
      .eq("organization_id", organizationId)
      .in("id", chunk);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as AppointmentRow[]));
  }
  return rows;
}

async function fetchProviderAppointments(client: GhlReadOnlyClient, calendarIds: string[]) {
  const rows: ProviderAppointmentRow[] = [];
  let pagesFetched = 0;
  for (const calendarId of calendarIds) {
    let pageToken: string | null = null;
    for (let page = 0; page < 100; page += 1) {
      const result = await client.getAppointments({ pageToken, query: { ...appointmentWindow(), calendarId } });
      rows.push(...(result.data as ProviderAppointmentRow[]));
      pagesFetched += 1;
      pageToken = result.nextPageToken ?? result.cursor ?? null;
      if (!result.hasMore || !pageToken) break;
    }
  }
  return { rows, pagesFetched };
}

export async function buildAppointmentStatusBackfillDryRun(supabase: SupabaseClient, profile: CurrentProfile, connection: GhlConnection) {
  assertGhlPermission(profile, "integrations.ghl.sync");
  assertGhlReadMode();
  if (isMockGhlConnection(connection)) throw new Error("Appointment status backfill dry run is only available for real read-only GHL connections.");
  if (!tokenPresentForConnection(connection)) throw new Error("GoHighLevel token is not configured for this connection.");

  return (await buildAppointmentStatusBackfillCandidatePlan(supabase, profile, connection)).report;
}

export async function buildAppointmentStatusBackfillCandidatePlan(supabase: SupabaseClient, profile: CurrentProfile, connection: GhlConnection) {
  assertGhlPermission(profile, "integrations.ghl.sync");
  assertGhlReadMode();
  if (isMockGhlConnection(connection)) throw new Error("Appointment status backfill is only available for real read-only GHL connections.");
  if (!tokenPresentForConnection(connection)) throw new Error("GoHighLevel token is not configured for this connection.");

  const mappings = await loadAppointmentMappings(supabase, connection.id);
  const appointments = await loadAppointmentRows(supabase, profile.organizationId, connection.location_id);
  const calendarIds = Array.from(new Set(mappings.map(calendarIdFromMapping).filter(Boolean))).sort();
  const provider = await fetchProviderAppointments(new GhlReadOnlyClient(connection), calendarIds);
  return planAppointmentStatusBackfill({
    connection,
    mappings,
    appointments,
    providerAppointments: provider.rows,
    providerPagesFetched: provider.pagesFetched,
    calendarsChecked: calendarIds.length
  });
}

export async function buildAppointmentStatusBackfillApplyPreview(supabase: SupabaseClient, profile: CurrentProfile, connection: GhlConnection) {
  return previewAppointmentStatusBackfillPlan(await buildAppointmentStatusBackfillCandidatePlan(supabase, profile, connection));
}

async function applyStatusChanges(supabase: SupabaseClient, organizationId: string, changes: AppointmentStatusBackfillPlan["statusChanges"]) {
  let failedCount = 0;
  let updatedCount = 0;
  for (const status of appointmentStatusNormalizedBuckets) {
    const ids = changes.filter((change) => change.toStatus === status).map((change) => change.appointmentId);
    for (let index = 0; index < ids.length; index += 250) {
      const chunk = ids.slice(index, index + 250);
      if (!chunk.length) continue;
      const { data, error } = await supabase
        .from("appointments")
        .update({ status })
        .eq("organization_id", organizationId)
        .in("id", chunk)
        .select("id");
      if (error) {
        failedCount += chunk.length;
      } else {
        const affected = data?.length ?? 0;
        updatedCount += affected;
        if (affected !== chunk.length) failedCount += chunk.length - affected;
      }
    }
  }
  return { failedCount, updatedCount };
}

async function applyMappingMetadataUpdates(supabase: SupabaseClient, connectionId: string, updates: AppointmentStatusBackfillPlan["metadataUpdates"]) {
  let failedCount = 0;
  for (let index = 0; index < updates.length; index += 25) {
    const chunk = updates.slice(index, index + 25);
    const results = await Promise.all(chunk.map((update) => {
      let query = supabase
        .from("external_record_mappings")
        .update({ metadata_safe: update.metadata })
        .eq("connection_id", connectionId)
        .eq("external_object_type", "appointment")
        .eq("external_id", update.externalId);
      if (update.mappingId) query = query.eq("id", update.mappingId);
      return query;
    }));
    failedCount += results.filter((result) => result.error).length;
  }
  return failedCount;
}

export async function applyAppointmentStatusBackfill(
  supabase: SupabaseClient,
  profile: CurrentProfile,
  connection: GhlConnection,
  options: { expectedCandidateCount?: number } = {}
): Promise<AppointmentStatusBackfillApplyReport> {
  assertGhlPermission(profile, "integrations.ghl.sync");
  assertGhlReadMode();
  if (process.env.GHL_ALLOW_WRITES === "true") throw new Error("GHL_ALLOW_WRITES must remain false for the appointment status backfill.");
  if (isMockGhlConnection(connection)) throw new Error("Appointment status backfill is only available for real read-only GHL connections.");
  if (!tokenPresentForConnection(connection)) throw new Error("GoHighLevel token is not configured for this connection.");

  const plan = await buildAppointmentStatusBackfillCandidatePlan(supabase, profile, connection);
  if (plan.report.unresolvedCount > 0 || plan.report.proposedNormalizedBreakdown.review_required > 0) {
    throw new Error("Appointment status backfill blocked because unresolved or review-required statuses remain. Run the dry run and resolve those first.");
  }

  if (plan.statusChanges.length !== plan.report.wouldChangeCount) {
    throw new Error("Appointment status backfill candidate mismatch. Run the dry run again before applying.");
  }
  if (typeof options.expectedCandidateCount === "number" && options.expectedCandidateCount !== plan.statusChanges.length) {
    throw new Error(`Appointment status backfill candidate count changed from preview (${options.expectedCandidateCount}) to apply (${plan.statusChanges.length}). Run Apply Preview again before applying.`);
  }

  const statusResult = await applyStatusChanges(supabase, profile.organizationId, plan.statusChanges);
  const metadataFailures = await applyMappingMetadataUpdates(supabase, connection.id, plan.metadataUpdates);
  const appointmentIds = Array.from(new Set(plan.metadataUpdates.map((update) => update.appointmentId)));
  const reconciliationRows = appointmentIds.length
    ? await loadAppointmentsByIds(supabase, profile.organizationId, appointmentIds)
    : await loadAppointmentRows(supabase, profile.organizationId, connection.location_id);

  return {
    ...plan.report,
    appliedAt: new Date().toISOString(),
    applyCandidateCount: plan.statusChanges.length,
    appointmentStatusChangedCount: statusResult.updatedCount,
    mappingMetadataUpdatedCount: plan.metadataUpdates.length - metadataFailures,
    failedCount: statusResult.failedCount + metadataFailures,
    reconciliation: statusReconciliation(reconciliationRows)
  };
}
