import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentProfile } from "@/lib/auth/profile";
import type { GhlConnection } from "./types.ts";

export const GHL_CALENDAR_TYPE_BACKFILL_CONFIRMATION = "APPLY GHL CALENDAR TYPE BACKFILL";

export const EXPLICIT_GHL_CALENDAR_TYPE_NAME_MAPPINGS = [
  { ghlCalendarName: "Hair Restoration Consultation", appointmentTypeName: "Hair Restoration Consultation" },
  { ghlCalendarName: "Stem Cell Consultation", appointmentTypeName: "Hair Restoration Consultation" }
] as const;

type MappingRow = {
  id: string;
  external_id: string;
  internal_id: string;
  metadata_safe: Record<string, unknown> | null;
};

type AppointmentRow = {
  id: string;
  appointment_type_id: string | null;
  provider_id: string | null;
  location_id: string | null;
};

type TypeMappingRow = {
  external_calendar_id: string | null;
  appointment_type_id: string | null;
};

const APPOINTMENT_LOOKUP_BATCH_SIZE = 100;
const BACKFILL_MAPPING_PAGE_SIZE = 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function record(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export function explicitAppointmentTypeNameForGhlCalendar(calendarName: string) {
  const cleanName = text(calendarName).toLowerCase();
  return EXPLICIT_GHL_CALENDAR_TYPE_NAME_MAPPINGS.find((item) => item.ghlCalendarName.toLowerCase() === cleanName)?.appointmentTypeName ?? null;
}

function normalizeBackfillConfirmation(value: unknown) {
  return text(value).replace(/\s+/g, " ").toUpperCase();
}

function uniqueUuidValues(values: string[]) {
  return Array.from(new Set(values.filter((value) => UUID_PATTERN.test(value))));
}

function safeSupabaseCalendarTypeError(context: string, error: { message?: string; code?: string; details?: string; hint?: string }) {
  const parts = [
    `message=${error.message ?? "Unknown Supabase error"}`,
    error.code ? `code=${error.code}` : null,
    error.details ? `details=${error.details}` : null,
    error.hint ? `hint=${error.hint}` : null
  ].filter(Boolean);
  return `${context}: ${parts.join("; ")}`;
}

async function fetchAllCalendarTypeMappings(supabase: SupabaseClient, connectionId: string) {
  const rows: TypeMappingRow[] = [];
  for (let from = 0; ; from += BACKFILL_MAPPING_PAGE_SIZE) {
    const to = from + BACKFILL_MAPPING_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("ghl_calendar_type_mappings")
      .select("external_calendar_id, appointment_type_id")
      .eq("connection_id", connectionId)
      .eq("active", true)
      .range(from, to);
    if (error) throw new Error(safeSupabaseCalendarTypeError("GHL calendar type mapping query failed", error));
    const page = (data ?? []) as TypeMappingRow[];
    rows.push(...page);
    if (page.length < BACKFILL_MAPPING_PAGE_SIZE) return rows;
  }
}

async function fetchAllAppointmentMappingsForBackfill(supabase: SupabaseClient, connectionId: string) {
  const rows: MappingRow[] = [];
  for (let from = 0; ; from += BACKFILL_MAPPING_PAGE_SIZE) {
    const to = from + BACKFILL_MAPPING_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("external_record_mappings")
      .select("id, external_id, internal_id, metadata_safe")
      .eq("connection_id", connectionId)
      .eq("external_object_type", "appointment")
      .range(from, to);
    if (error) throw new Error(safeSupabaseCalendarTypeError("GHL appointment mapping query failed", error));
    const page = (data ?? []) as MappingRow[];
    rows.push(...page);
    if (page.length < BACKFILL_MAPPING_PAGE_SIZE) return rows;
  }
}

export function validateCalendarTypeBackfillRequest(input: { connectionId?: unknown; confirmation?: unknown; expectedCandidateCount?: unknown }) {
  const connectionId = text(input.connectionId);
  if (!connectionId) throw new Error("Connection is required");
  if (normalizeBackfillConfirmation(input.confirmation) !== GHL_CALENDAR_TYPE_BACKFILL_CONFIRMATION) {
    throw new Error(`Type ${GHL_CALENDAR_TYPE_BACKFILL_CONFIRMATION} to update imported appointment types`);
  }
  const expectedCandidateCount = Number(input.expectedCandidateCount);
  if (!Number.isInteger(expectedCandidateCount) || expectedCandidateCount < 1) throw new Error("Run calendar type backfill preview before applying");
  return { connectionId, confirmation: GHL_CALENDAR_TYPE_BACKFILL_CONFIRMATION, expectedCandidateCount };
}

function externalProviderUserId(mapping: MappingRow) {
  const data = record(mapping.metadata_safe);
  return text(data.external_assigned_user_id ?? data.assigned_user_id ?? data.provider_user_id);
}

export async function upsertGhlCalendarTypeMapping(
  supabase: SupabaseClient,
  profile: CurrentProfile,
  connection: GhlConnection,
  input: { externalCalendarId: string; appointmentTypeId: string }
) {
  const calendarId = text(input.externalCalendarId);
  const appointmentTypeId = text(input.appointmentTypeId);
  if (!calendarId || !appointmentTypeId) throw new Error("GHL calendar and appointment type are required");
  const { error } = await supabase.from("ghl_calendar_type_mappings").upsert({
    organization_id: profile.organizationId,
    location_id: connection.location_id,
    connection_id: connection.id,
    external_calendar_id: calendarId,
    appointment_type_id: appointmentTypeId,
    active: true,
    created_by: profile.id,
    metadata_safe: { phase: "21C", configured_from_ui: true, ghl_writes_performed: false }
  }, { onConflict: "connection_id,external_calendar_id" });
  if (error) throw new Error(error.message);
}

export async function buildGhlCalendarTypeBackfillPlan(supabase: SupabaseClient, connection: GhlConnection) {
  const [typeMappings, appointmentMappings] = await Promise.all([
    fetchAllCalendarTypeMappings(supabase, connection.id),
    fetchAllAppointmentMappingsForBackfill(supabase, connection.id)
  ]);

  const typeMappingGroups = typeMappings.reduce<Map<string, Set<string>>>((groups, row) => {
    const calendarId = text(row.external_calendar_id);
    const typeId = text(row.appointment_type_id);
    if (!calendarId || !typeId) return groups;
    groups.set(calendarId, (groups.get(calendarId) ?? new Set()).add(typeId));
    return groups;
  }, new Map());
  const typeByCalendar = new Map(
    Array.from(typeMappingGroups.entries())
      .filter(([, typeIds]) => typeIds.size === 1)
      .map(([calendarId, typeIds]) => [calendarId, Array.from(typeIds)[0]])
  );
  const mappings = appointmentMappings;
  const appointmentIds = uniqueUuidValues(mappings.map((mapping) => mapping.internal_id));
  const appointmentById = new Map<string, AppointmentRow>();

  for (let index = 0; index < appointmentIds.length; index += APPOINTMENT_LOOKUP_BATCH_SIZE) {
    const ids = appointmentIds.slice(index, index + APPOINTMENT_LOOKUP_BATCH_SIZE);
    const { data, error } = await supabase
      .from("appointments")
      .select("id, appointment_type_id, provider_id, location_id")
      .in("id", ids);
    if (error) throw new Error(safeSupabaseCalendarTypeError("GHL calendar type backfill appointments lookup failed", error));
    for (const appointment of (data ?? []) as AppointmentRow[]) appointmentById.set(appointment.id, appointment);
  }

  let missingCalendarMapping = 0;
  let ambiguousMapping = 0;
  let mapped = 0;
  let alreadyCorrect = 0;
  let locationMismatch = 0;
  let missingInternalAppointment = 0;
  let importedWithExternalProviderUser = 0;
  let mappedToInternalProvider = 0;
  let stillUnassigned = 0;
  let externalProviderMappedToInternalProvider = 0;
  let externalProviderStillUnassigned = 0;

  const candidates = mappings.flatMap((mapping) => {
    const calendarId = text(record(mapping.metadata_safe).calendar_id);
    const appointment = appointmentById.get(mapping.internal_id);
    if (!appointment) {
      missingInternalAppointment += 1;
      return [];
    }
    if (connection.location_id && appointment.location_id !== connection.location_id) {
      locationMismatch += 1;
      return [];
    }
    const providerExternalId = externalProviderUserId(mapping);
    if (providerExternalId) importedWithExternalProviderUser += 1;
    if (appointment.provider_id) {
      mappedToInternalProvider += 1;
      if (providerExternalId) externalProviderMappedToInternalProvider += 1;
    } else {
      stillUnassigned += 1;
      if (providerExternalId) externalProviderStillUnassigned += 1;
    }
    const typeGroup = calendarId ? typeMappingGroups.get(calendarId) : null;
    const targetTypeId = calendarId ? typeByCalendar.get(calendarId) : null;
    if (!calendarId || !typeGroup?.size || !targetTypeId) {
      if (typeGroup && typeGroup.size > 1) ambiguousMapping += 1;
      else missingCalendarMapping += 1;
      return [];
    }
    mapped += 1;
    if (appointment.appointment_type_id === targetTypeId) {
      alreadyCorrect += 1;
      return [];
    }
    return [{
      mappingId: mapping.id,
      appointmentId: mapping.internal_id,
      externalAppointmentId: mapping.external_id,
      externalCalendarId: calendarId,
      fromAppointmentTypeId: appointment.appointment_type_id,
      toAppointmentTypeId: targetTypeId,
      metadata: { ...record(mapping.metadata_safe), appointment_type_id: targetTypeId, calendar_type_mapping_backfilled_at: new Date().toISOString() }
    }];
  });

  return {
    connectionId: connection.id,
    appointmentMappings: mappings.length,
    appointmentsScanned: mappings.length,
    mappedCalendars: typeByCalendar.size,
    mappedAppointments: mapped,
    alreadyCorrect,
    missingCalendarMapping,
    ambiguousMapping,
    locationMismatch,
    missingInternalAppointment,
    providerAudit: {
      importedWithExternalProviderUser,
      mappedToInternalProvider,
      stillUnassigned,
      externalProviderMappedToInternalProvider,
      externalProviderStillUnassigned
    },
    candidates,
    candidateCount: candidates.length,
    wouldUpdate: candidates.length,
    ghlWritesPerformed: false,
    normalizedBusinessRecordsWritten: candidates.length > 0
  };
}

export async function applyGhlCalendarTypeBackfill(
  supabase: SupabaseClient,
  connection: GhlConnection,
  expectedCandidateCount: number
) {
  const plan = await buildGhlCalendarTypeBackfillPlan(supabase, connection);
  if (plan.candidateCount !== expectedCandidateCount) {
    throw new Error(`Calendar type backfill candidate count changed from ${expectedCandidateCount} to ${plan.candidateCount}. Run preview again.`);
  }
  let changed = 0;
  let failed = 0;
  for (const candidate of plan.candidates) {
    const { error: appointmentError } = await supabase
      .from("appointments")
      .update({ appointment_type_id: candidate.toAppointmentTypeId })
      .eq("id", candidate.appointmentId)
      .eq("location_id", connection.location_id);
    if (appointmentError) {
      failed += 1;
      continue;
    }
    const { error: mappingError } = await supabase
      .from("external_record_mappings")
      .update({ metadata_safe: candidate.metadata })
      .eq("id", candidate.mappingId);
    if (mappingError) failed += 1;
    else changed += 1;
  }
  return { ...plan, changed, failed };
}
