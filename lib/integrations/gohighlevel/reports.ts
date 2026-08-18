import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentProfile } from "@/lib/auth/profile";
import { credentialDiagnosticForConnection } from "./auth.ts";
import { getGhlIntegrationMode, ghlReadSyncEnabled, ghlWritesAllowed } from "./config.ts";
import type { GhlDryRunPreview } from "./dry-run.ts";
import { fullImportProgressPercent, getGhlDriftReconciliationEveryMinutes, getGhlIncrementalSchedule } from "./importer.ts";
import { assertGhlPermission, ghlLocationAllowed } from "./permissions.ts";
import type { GhlConnection } from "./types.ts";

type CountRow = { external_object_type?: string | null; status?: string | null };
type MappingDiagnosticRow = { external_object_type?: string | null; internal_object_type?: string | null };
type SyncRunRow = { connection_id?: string | null; sync_type?: string | null; metadata_safe?: { dry_run_preview?: GhlDryRunPreview } | null };
type ExceptionRow = {
  sync_run_id?: string | null;
  status?: string | null;
  exception_type?: string | null;
  object_type?: string | null;
  summary?: string | null;
  metadata_safe?: { root_cause?: string | null } | null;
};
type JobRow = {
  id?: string | null;
  sync_run_id?: string | null;
  status?: string | null;
  object_type?: string | null;
  page_token?: string | null;
  cursor_value?: string | null;
  attempts?: number | null;
  last_error?: string | null;
  metadata_safe?: Record<string, unknown> | null;
};
type OAuthInstallationRow = {
  id?: string | null;
  ghl_connection_id?: string | null;
  status?: string | null;
  ghl_location_id?: string | null;
  expected_ghl_location_id?: string | null;
  scopes?: string[] | null;
  access_token_expires_at?: string | null;
  installed_at?: string | null;
  last_refreshed_at?: string | null;
  webhook_ready?: boolean | null;
  status_reason?: string | null;
};
type CursorRow = {
  connection_id?: string | null;
  object_type?: string | null;
  cursor_value?: string | null;
  last_page_token?: string | null;
  last_sync_started_at?: string | null;
  last_sync_completed_at?: string | null;
};
type ExternalMappingRow = {
  id?: string | null;
  connection_id?: string | null;
  external_id?: string | null;
  internal_id?: string | null;
  external_object_type?: string | null;
  internal_object_type?: string | null;
  metadata_safe?: Record<string, unknown> | null;
  ghl_connections?: { display_name?: string | null; ghl_location_id?: string | null } | null;
  locations?: { name?: string | null } | null;
};
type AppointmentMirrorRow = {
  id?: string | null;
  appointment_type_id?: string | null;
  provider_id?: string | null;
  location_id?: string | null;
  start_at?: string | null;
  end_at?: string | null;
};
type CalendarTypeMappingRow = {
  connection_id?: string | null;
  external_calendar_id?: string | null;
  appointment_type_id?: string | null;
};
type AppointmentTypeRow = {
  id: string;
  name: string;
  duration_minutes?: number | null;
};

const APPOINTMENT_LOOKUP_BATCH_SIZE = 100;
const REPORT_MAPPING_PAGE_SIZE = 1000;
const REAL_MIAMI_GHL_LOCATION_ID = "Y4e3rWEXVyXCZmZaCs8d";
const CALENDAR_MAPPING_OBJECT_TYPES = ["calendar", "calendars", "ghl_calendar"] as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function countRows(rows: CountRow[] | null | undefined, key: "external_object_type" | "status") {
  return (rows ?? []).reduce<Record<string, number>>((counts, row) => {
    const value = String(row[key] ?? "unknown");
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function sanitizeExceptionSummary(summary: string) {
  return summary
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\+?1?[\s(.-]*\d{3}[\s).=-]*\d{3}[\s.-]*\d{4}\b/g, "[phone]")
    .slice(0, 240);
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function metadata(value: unknown) {
  return isPlainRecord(value) ? value : {};
}

function uniqueById<T extends { id?: string | null }>(rows: T[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const id = text(row.id);
    if (!id) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function uniqueUuidValues(values: string[]) {
  return Array.from(new Set(values.filter((value) => UUID_PATTERN.test(value))));
}

function safeSupabaseReportError(context: string, error: { message?: string; code?: string; details?: string; hint?: string }) {
  const parts = [
    `message=${error.message ?? "Unknown Supabase error"}`,
    error.code ? `code=${error.code}` : null,
    error.details ? `details=${error.details}` : null,
    error.hint ? `hint=${error.hint}` : null
  ].filter(Boolean);
  return `${context}: ${parts.join("; ")}`;
}

function calendarIdFromAppointmentMapping(mapping: ExternalMappingRow) {
  const data = metadata(mapping.metadata_safe);
  return text(data.calendar_id ?? data.calendarId ?? data.calendarID ?? data.ghl_calendar_id ?? data.external_calendar_id);
}

function calendarNameFromAppointmentMapping(mapping: ExternalMappingRow) {
  const data = metadata(mapping.metadata_safe);
  return text(data.calendar_name ?? data.calendarName ?? data.ghl_calendar_name ?? data.name);
}

function safeExternalId(value: unknown) {
  const id = text(value);
  if (!id || id.length > 256 || /[\u0000-\u001f]/.test(id)) return "";
  return id;
}

async function fetchAllAppointmentMappingsForCalendarReport(supabase: SupabaseClient, connectionIds: string[]) {
  const rows: ExternalMappingRow[] = [];
  for (let from = 0; ; from += REPORT_MAPPING_PAGE_SIZE) {
    const to = from + REPORT_MAPPING_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("external_record_mappings")
      .select("id, connection_id, external_id, internal_id, external_object_type, internal_object_type, metadata_safe")
      .eq("external_object_type", "appointment")
      .in("connection_id", connectionIds)
      .range(from, to);
    if (error) throw new Error(safeSupabaseReportError("GHL calendar report appointment mappings query failed", error));
    const page = (data ?? []) as ExternalMappingRow[];
    rows.push(...page);
    if (page.length < REPORT_MAPPING_PAGE_SIZE) return rows;
  }
}

function deriveCalendarMappingsFromAppointmentMappings(
  appointmentMappings: ExternalMappingRow[],
  typeMappings: CalendarTypeMappingRow[],
  appointmentTypesById: Map<string, AppointmentTypeRow>,
  selectedConnection: (GhlConnection & { display_name?: string | null; locations?: { name?: string | null } | null }) | null
) {
  const diagnostics = {
    malformedAppointmentMappingMetadataCount: 0,
    nullCalendarIdAppointmentMappingCount: 0,
    invalidCalendarIdAppointmentMappingCount: 0,
    duplicateDerivedCalendarIdCount: 0,
    invalidTypeMappingCalendarIdCount: 0
  };
  if (!selectedConnection) return { rows: [], diagnostics };
  const connectionId = text(selectedConnection.id);
  const rowsByCalendar = new Map<string, ExternalMappingRow>();
  const addCalendar = (calendarId: string, calendarName?: string | null) => {
    const cleanCalendarId = safeExternalId(calendarId);
    if (!cleanCalendarId) return false;
    if (rowsByCalendar.has(cleanCalendarId)) {
      diagnostics.duplicateDerivedCalendarIdCount += 1;
      return true;
    }
    rowsByCalendar.set(cleanCalendarId, {
      id: `derived-calendar:${connectionId}:${cleanCalendarId}`,
      connection_id: connectionId,
      external_id: cleanCalendarId,
      internal_id: null,
      external_object_type: "calendar",
      internal_object_type: "derived_from_appointment_mappings",
      metadata_safe: {
        calendar_name: text(calendarName) || cleanCalendarId,
        derived_from_appointment_mappings: true
      },
      ghl_connections: {
        display_name: selectedConnection.display_name,
        ghl_location_id: selectedConnection.ghl_location_id
      },
      locations: {
        name: selectedConnection.locations?.name ?? null
      }
    });
    return true;
  };

  for (const mapping of appointmentMappings) {
    if (text(mapping.connection_id) !== connectionId) continue;
    if (mapping.metadata_safe !== null && mapping.metadata_safe !== undefined && !isPlainRecord(mapping.metadata_safe)) {
      diagnostics.malformedAppointmentMappingMetadataCount += 1;
    }
    const calendarId = calendarIdFromAppointmentMapping(mapping);
    if (!calendarId) {
      diagnostics.nullCalendarIdAppointmentMappingCount += 1;
      continue;
    }
    if (!addCalendar(calendarId, calendarNameFromAppointmentMapping(mapping))) {
      diagnostics.invalidCalendarIdAppointmentMappingCount += 1;
    }
  }

  for (const mapping of typeMappings) {
    if (text(mapping.connection_id) !== connectionId) continue;
    const calendarId = text(mapping.external_calendar_id);
    const appointmentTypeName = appointmentTypesById.get(text(mapping.appointment_type_id))?.name;
    if (calendarId && !addCalendar(calendarId, appointmentTypeName)) diagnostics.invalidTypeMappingCalendarIdCount += 1;
  }

  return {
    rows: Array.from(rowsByCalendar.values()).sort((a, b) => {
      const nameA = text(metadata(a.metadata_safe).calendar_name) || text(a.external_id);
      const nameB = text(metadata(b.metadata_safe).calendar_name) || text(b.external_id);
      return nameA.localeCompare(nameB);
    }),
    diagnostics
  };
}

export function isRealGhlConnectionForMapping(connection: GhlConnection & { display_name?: string | null }) {
  const ghlLocationId = text(connection.ghl_location_id);
  const displayName = text(connection.display_name).toLowerCase();
  const credentialDiagnostic = credentialDiagnosticForConnection(connection);
  const hasRealMiamiLocationId = ghlLocationId === REAL_MIAMI_GHL_LOCATION_ID;
  const hasServerCredential = Boolean(connection.token_present || credentialDiagnostic.tokenPresent);
  const hasStrongRealEvidence = hasRealMiamiLocationId && (hasServerCredential || connection.status === "healthy");
  const hasMockEvidence = connection.connection_type === "mock"
    || ghlLocationId.toLowerCase().startsWith("ghl_mock_")
    || displayName.includes("mock gohighlevel");
  if (hasStrongRealEvidence) return true;
  return !hasMockEvidence && (hasRealMiamiLocationId || hasServerCredential || connection.connection_type === "private_integration" || connection.connection_type === "oauth_future");
}

export function chooseDefaultGhlCalendarConnection<T extends GhlConnection & { display_name?: string | null }>(connections: T[], selectedConnectionId?: string | null) {
  const realConnections = connections.filter(isRealGhlConnectionForMapping);
  const selected = realConnections.find((connection) => connection.id === selectedConnectionId);
  return selected
    ?? realConnections.find((connection) => connection.ghl_location_id === REAL_MIAMI_GHL_LOCATION_ID)
    ?? realConnections[0]
    ?? null;
}

export function sanitizeGhlDiagnosticText(value: string) {
  return sanitizeExceptionSummary(value);
}

function exceptionBreakdowns(rows: ExceptionRow[] | null | undefined) {
  return (rows ?? []).reduce<Record<string, Array<{ reason: string; count: number; exceptionType: string; objectType: string; summary: string }>>>((groups, row) => {
    const runId = row.sync_run_id;
    if (!runId) return groups;
    const reason = String(row.metadata_safe?.root_cause ?? row.exception_type ?? "unknown");
    const exceptionType = String(row.exception_type ?? "unknown");
    const objectType = String(row.object_type ?? "unknown");
    const summary = sanitizeExceptionSummary(String(row.summary ?? "No summary available"));
    const current = groups[runId] ?? [];
    const existing = current.find((item) => item.reason === reason && item.exceptionType === exceptionType && item.objectType === objectType && item.summary === summary);
    if (existing) existing.count += 1;
    else current.push({ reason, count: 1, exceptionType, objectType, summary });
    groups[runId] = current.sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
    return groups;
  }, {});
}

export async function getGhlConnectionRows(supabase: SupabaseClient, profile: CurrentProfile) {
  assertGhlPermission(profile, "integrations.ghl.read");
  const query = supabase
    .from("ghl_connections")
    .select("*, locations(name, slug)")
    .eq("organization_id", profile.organizationId)
    .order("display_name");
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).filter((connection) => ghlLocationAllowed(profile, (connection as GhlConnection).location_id));
}

export async function getGhlDashboardReport(supabase: SupabaseClient, profile: CurrentProfile) {
  const connections = await getGhlConnectionRows(supabase, profile);
  const connectionIds = connections.map((connection) => String(connection.id));
  const [{ data: mappedCounts }, { data: exceptions }, { data: runs }, { data: jobs }, { data: webhookEvents }, { data: oauthInstallations }, { data: cursors }] = await Promise.all([
    connectionIds.length
      ? supabase.from("external_record_mappings").select("external_object_type").eq("provider", "gohighlevel").in("connection_id", connectionIds)
      : Promise.resolve({ data: [] }),
    connectionIds.length
      ? supabase.from("ghl_sync_exceptions").select("sync_run_id,status,exception_type,object_type,summary,metadata_safe").in("connection_id", connectionIds)
      : Promise.resolve({ data: [] }),
    connectionIds.length
      ? supabase.from("ghl_sync_runs").select("*").in("connection_id", connectionIds).order("started_at", { ascending: false }).limit(12)
      : Promise.resolve({ data: [] }),
    connectionIds.length
      ? supabase.from("ghl_sync_jobs").select("*").in("connection_id", connectionIds).order("updated_at", { ascending: false }).limit(50)
      : Promise.resolve({ data: [] }),
    connectionIds.length
      ? supabase.from("ghl_webhook_events").select("*").in("connection_id", connectionIds).order("received_at", { ascending: false }).limit(12)
      : Promise.resolve({ data: [] }),
    connectionIds.length
      ? supabase.from("ghl_oauth_installations").select("id, ghl_connection_id, status, ghl_location_id, expected_ghl_location_id, scopes, access_token_expires_at, installed_at, last_refreshed_at, webhook_ready, status_reason").in("ghl_connection_id", connectionIds)
      : Promise.resolve({ data: [] }),
    connectionIds.length
      ? supabase.from("ghl_sync_cursors").select("connection_id, object_type, cursor_value, last_page_token, last_sync_started_at, last_sync_completed_at").in("connection_id", connectionIds)
      : Promise.resolve({ data: [] })
  ]);

  return {
    mode: getGhlIntegrationMode(),
    readSyncEnabled: ghlReadSyncEnabled(),
    writesAllowed: ghlWritesAllowed(),
    connections: connections.map((connection) => {
      const credentialDiagnostic = credentialDiagnosticForConnection(connection as GhlConnection);
      return {
        ...connection,
        credentialDiagnostic,
        tokenPresentRuntime: credentialDiagnostic.tokenPresent
      };
    }),
    mappedCounts: countRows(mappedCounts as CountRow[], "external_object_type"),
    exceptionCounts: countRows(exceptions as CountRow[], "status"),
    exceptionBreakdownByRun: exceptionBreakdowns(exceptions as ExceptionRow[]),
    runs: (runs ?? []).map((run) => ({ ...run, progress_percent: fullImportProgressPercent(run) })),
    jobs: jobs ?? [],
    jobsByRun: ((jobs ?? []) as JobRow[]).reduce<Record<string, JobRow[]>>((groups, job) => {
      if (!job.sync_run_id) return groups;
      groups[job.sync_run_id] = [...(groups[job.sync_run_id] ?? []), job];
      return groups;
    }, {}),
    cursorsByConnection: ((cursors ?? []) as CursorRow[]).reduce<Record<string, Record<string, CursorRow>>>((groups, cursor) => {
      if (!cursor.connection_id || !cursor.object_type) return groups;
      groups[cursor.connection_id] = { ...(groups[cursor.connection_id] ?? {}), [cursor.object_type]: cursor };
      return groups;
    }, {}),
    incrementalSchedule: getGhlIncrementalSchedule(),
    driftReconciliationEveryMinutes: getGhlDriftReconciliationEveryMinutes(),
    oauthInstallationsByConnection: ((oauthInstallations ?? []) as OAuthInstallationRow[]).reduce<Record<string, OAuthInstallationRow>>((groups, installation) => {
      if (installation.ghl_connection_id) groups[installation.ghl_connection_id] = installation;
      return groups;
    }, {}),
    latestDryRunPreviews: ((runs ?? []) as SyncRunRow[]).reduce<Record<string, GhlDryRunPreview>>((previews, run) => {
      const preview = run.sync_type === "dry_run" ? run.metadata_safe?.dry_run_preview : undefined;
      if (run.connection_id && preview && !previews[run.connection_id]) previews[run.connection_id] = preview;
      return previews;
    }, {}),
    webhookEvents: webhookEvents ?? []
  };
}

export async function getGhlCalendarReport(supabase: SupabaseClient, profile: CurrentProfile, options: { connectionId?: string | null } = {}) {
  const connections = await getGhlConnectionRows(supabase, profile);
  const realConnections = connections.filter((connection) => isRealGhlConnectionForMapping(connection as GhlConnection));
  const selectedConnection = chooseDefaultGhlCalendarConnection(realConnections as Array<GhlConnection & { display_name?: string | null }>, options.connectionId);
  const connectionIds = selectedConnection ? [String(selectedConnection.id)] : [];
  const connectionAuditRows = connections.map((connection) => {
    const typedConnection = connection as GhlConnection & { display_name?: string | null; locations?: { name?: string | null; slug?: string | null } | null };
    const diagnostic = credentialDiagnosticForConnection(typedConnection);
    const ghlLocationId = text(typedConnection.ghl_location_id);
    const displayName = text(typedConnection.display_name);
    const hasRealMiamiLocationId = ghlLocationId === REAL_MIAMI_GHL_LOCATION_ID;
    const tokenPresent = Boolean(typedConnection.token_present || diagnostic.tokenPresent);
    const hasStrongRealEvidence = hasRealMiamiLocationId && (tokenPresent || typedConnection.status === "healthy");
    const hasMockEvidence = typedConnection.connection_type === "mock"
      || ghlLocationId.toLowerCase().startsWith("ghl_mock_")
      || displayName.toLowerCase().includes("mock gohighlevel");
    return {
      id: typedConnection.id,
      displayName,
      ghlLocationId,
      devDashboardLocationId: typedConnection.location_id,
      devDashboardLocationName: typedConnection.locations?.name ?? null,
      connectionType: typedConnection.connection_type,
      syncMode: typedConnection.sync_mode,
      status: typedConnection.status,
      tokenPresent,
      profileCanAccessLocation: ghlLocationAllowed(profile, typedConnection.location_id),
      classifiedAsReal: isRealGhlConnectionForMapping(typedConnection),
      classificationReason: hasStrongRealEvidence
        ? "real_expected_miami_location_id"
        : hasMockEvidence
          ? "excluded_mock_evidence"
          : hasRealMiamiLocationId
          ? "real_expected_miami_location_id"
          : tokenPresent
            ? "real_server_credential_present"
            : `real_${typedConnection.connection_type}`
    };
  });
  const [
    { data: calendarObjectMappings, error: calendarObjectMappingsError },
    { data: calendarMirrorMappings, error: calendarMirrorMappingsError },
    { data: mappingDiagnostics, error: mappingDiagnosticsError },
    { data: typeMappings, error: typeMappingsError },
    { data: appointmentTypes, error: appointmentTypesError }
  ] = connectionIds.length
    ? await Promise.all([
      supabase.from("external_record_mappings").select("*, ghl_connections(display_name, ghl_location_id), locations(name)").in("external_object_type", [...CALENDAR_MAPPING_OBJECT_TYPES]).in("connection_id", connectionIds).order("created_at"),
      supabase.from("external_record_mappings").select("*, ghl_connections(display_name, ghl_location_id), locations(name)").eq("internal_object_type", "ghl_calendar_mirror").in("connection_id", connectionIds).order("created_at"),
      supabase.from("external_record_mappings").select("external_object_type, internal_object_type").in("connection_id", connectionIds).limit(50000),
      supabase.from("ghl_calendar_type_mappings").select("connection_id, external_calendar_id, appointment_type_id").in("connection_id", connectionIds).eq("active", true),
      supabase.from("appointment_types").select("id, name, duration_minutes").eq("organization_id", profile.organizationId).eq("active", true).order("name")
    ])
    : [
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null }
    ];
  if (calendarObjectMappingsError) throw new Error(safeSupabaseReportError("GHL calendar report calendar mappings query failed", calendarObjectMappingsError));
  if (calendarMirrorMappingsError) throw new Error(safeSupabaseReportError("GHL calendar report calendar mirror mappings query failed", calendarMirrorMappingsError));
  if (mappingDiagnosticsError) throw new Error(safeSupabaseReportError("GHL calendar report mapping diagnostics query failed", mappingDiagnosticsError));
  if (typeMappingsError) throw new Error(safeSupabaseReportError("GHL calendar report calendar type mappings query failed", typeMappingsError));
  if (appointmentTypesError) throw new Error(safeSupabaseReportError("GHL calendar report appointment types query failed", appointmentTypesError));

  const typedAppointmentMappings = connectionIds.length ? await fetchAllAppointmentMappingsForCalendarReport(supabase, connectionIds) : [];
  const typedMappingDiagnostics = (mappingDiagnostics ?? []) as MappingDiagnosticRow[];
  const externalObjectTypeCounts = typedMappingDiagnostics.reduce<Record<string, number>>((counts, row) => {
    const key = text(row.external_object_type) || "blank";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  const internalObjectTypeCounts = typedMappingDiagnostics.reduce<Record<string, number>>((counts, row) => {
    const key = text(row.internal_object_type) || "blank";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  const appointmentTypesById = new Map(((appointmentTypes ?? []) as AppointmentTypeRow[]).map((type) => [type.id, type]));
  const explicitCalendarMappings = uniqueById([...(calendarObjectMappings ?? []), ...(calendarMirrorMappings ?? [])] as ExternalMappingRow[]);
  const derivedCalendarResult = explicitCalendarMappings.length === 0
    ? deriveCalendarMappingsFromAppointmentMappings(
      typedAppointmentMappings,
      (typeMappings ?? []) as CalendarTypeMappingRow[],
      appointmentTypesById,
      selectedConnection as GhlConnection & { display_name?: string | null; locations?: { name?: string | null } | null }
    )
    : {
      rows: [],
      diagnostics: {
        malformedAppointmentMappingMetadataCount: 0,
        nullCalendarIdAppointmentMappingCount: 0,
        invalidCalendarIdAppointmentMappingCount: 0,
        duplicateDerivedCalendarIdCount: 0,
        invalidTypeMappingCalendarIdCount: 0
      }
    };
  const derivedCalendarMappings = derivedCalendarResult.rows;
  const mappings = explicitCalendarMappings.length > 0 ? explicitCalendarMappings : derivedCalendarMappings;
  const calendarIdsFromAppointmentMappings = new Set(typedAppointmentMappings.map(calendarIdFromAppointmentMapping).map(safeExternalId).filter(Boolean)).size;
  const invalidAppointmentInternalIdCount = typedAppointmentMappings.filter((mapping) => text(mapping.internal_id) && !UUID_PATTERN.test(text(mapping.internal_id))).length;
  const appointmentIds = uniqueUuidValues(typedAppointmentMappings.map((mapping) => text(mapping.internal_id)));
  const appointmentRows: AppointmentMirrorRow[] = [];
  for (let index = 0; index < appointmentIds.length; index += APPOINTMENT_LOOKUP_BATCH_SIZE) {
    const ids = appointmentIds.slice(index, index + APPOINTMENT_LOOKUP_BATCH_SIZE);
    const { data, error } = await supabase
      .from("appointments")
      .select("id, appointment_type_id, provider_id, location_id, start_at, end_at")
      .in("id", ids);
    if (error) throw new Error(safeSupabaseReportError("GHL calendar report appointments lookup failed", error));
    appointmentRows.push(...((data ?? []) as AppointmentMirrorRow[]));
  }

  const appointmentById = new Map(appointmentRows.map((appointment) => [text(appointment.id), appointment]));
  const typeMappingByCalendar = new Map(
    ((typeMappings ?? []) as CalendarTypeMappingRow[]).map((mapping) => [
      `${text(mapping.connection_id)}:${text(mapping.external_calendar_id)}`,
      text(mapping.appointment_type_id)
    ])
  );

  let skippedMalformedCalendarMappingCount = 0;
  const calendarRows = mappings.flatMap((mapping) => {
    const externalCalendarId = safeExternalId(mapping.external_id);
    const connectionId = text(mapping.connection_id);
    if (!externalCalendarId || !connectionId) {
      skippedMalformedCalendarMappingCount += 1;
      return [];
    }
    const typeId = typeMappingByCalendar.get(`${connectionId}:${externalCalendarId}`) ?? null;
    const mappedAppointments = typedAppointmentMappings.filter((appointmentMapping) => (
      text(appointmentMapping.connection_id) === connectionId
      && calendarIdFromAppointmentMapping(appointmentMapping) === externalCalendarId
    ));
    const appointmentRowsForCalendar = mappedAppointments.map((appointmentMapping) => appointmentById.get(text(appointmentMapping.internal_id))).filter((appointment): appointment is AppointmentMirrorRow => Boolean(appointment));
    const mappedProviderCount = appointmentRowsForCalendar.filter((appointment) => Boolean(appointment.provider_id)).length;
    const externalProviderUserCount = mappedAppointments.filter((appointmentMapping) => {
      const data = metadata(appointmentMapping.metadata_safe);
      return Boolean(text(data.external_assigned_user_id ?? data.assigned_user_id ?? data.provider_user_id));
    }).length;
    const visibleThroughCalendarQuery = typeId
      ? appointmentRowsForCalendar.filter((appointment) => text(appointment.appointment_type_id) === typeId).length
      : 0;
    const mismatchCount = typeId
      ? mappedAppointments.length - visibleThroughCalendarQuery
      : mappedAppointments.length;
    const calendarMetadata = metadata(mapping.metadata_safe);
    return {
      ...mapping,
      calendarName: text(calendarMetadata.calendar_name) || text(calendarMetadata.name) || externalCalendarId,
      mappedAppointmentTypeId: typeId,
      mappedAppointmentTypeName: typeId ? appointmentTypesById.get(typeId)?.name ?? "Unknown appointment type" : null,
      importedAppointmentCount: mappedAppointments.length,
      visibleThroughCalendarQuery,
      mismatchCount,
      externalProviderUserCount,
      mappedProviderCount,
      unassignedProviderCount: appointmentRowsForCalendar.length - mappedProviderCount,
      appointmentRows: appointmentRowsForCalendar
    };
  });

  return {
    connections: selectedConnection ? [selectedConnection] : [],
    realConnections,
    selectedConnection,
    hiddenMockConnectionCount: connections.length - realConnections.length,
    diagnostics: {
      selectedConnectionId: selectedConnection?.id ?? null,
      selectedGhlLocationId: selectedConnection?.ghl_location_id ?? null,
      realConnectionsFound: realConnections.length,
      mockConnectionsExcluded: connections.length - realConnections.length,
      connectionAuditRows,
      calendarMappingCount: mappings.length,
      explicitCalendarMappingCount: explicitCalendarMappings.length,
      derivedCalendarMappingCount: derivedCalendarMappings.length,
      calendarIdsFromAppointmentMappings,
      appointmentMappingCount: typedAppointmentMappings.length,
      invalidAppointmentInternalIdCount,
      skippedMalformedCalendarMappingCount,
      malformedAppointmentMappingMetadataCount: derivedCalendarResult.diagnostics.malformedAppointmentMappingMetadataCount,
      nullCalendarIdAppointmentMappingCount: derivedCalendarResult.diagnostics.nullCalendarIdAppointmentMappingCount,
      invalidCalendarIdAppointmentMappingCount: derivedCalendarResult.diagnostics.invalidCalendarIdAppointmentMappingCount,
      duplicateDerivedCalendarIdCount: derivedCalendarResult.diagnostics.duplicateDerivedCalendarIdCount,
      invalidTypeMappingCalendarIdCount: derivedCalendarResult.diagnostics.invalidTypeMappingCalendarIdCount,
      externalObjectTypeCounts,
      internalObjectTypeCounts,
      externalObjectTypeFilter: [...CALENDAR_MAPPING_OBJECT_TYPES],
      internalObjectTypeFallback: "ghl_calendar_mirror",
      mappingStatusFilter: "none; external_record_mappings has no status column",
      zeroRowsReason: !selectedConnection
        ? "No eligible real GHL connection is visible for this profile/location."
        : mappings.length === 0
          ? "No calendar mappings matched the selected real connection, and appointment mappings did not include source GHL calendar IDs."
          : null
    },
    mappings,
    appointmentCounts: typedAppointmentMappings,
    appointmentTypes: (appointmentTypes ?? []) as AppointmentTypeRow[],
    typeMappings: typeMappings ?? [],
    calendarRows
  };
}

export async function getGhlReconciliationReport(supabase: SupabaseClient, profile: CurrentProfile) {
  const dashboard = await getGhlDashboardReport(supabase, profile);
  const connectionIds = dashboard.connections.map((connection) => String(connection.id));
  const { data: exceptions } = connectionIds.length
    ? await supabase.from("ghl_sync_exceptions").select("*, ghl_connections(display_name), locations(name)").in("connection_id", connectionIds).order("created_at", { ascending: false }).limit(50)
    : { data: [] };
  return { ...dashboard, exceptions: exceptions ?? [] };
}
