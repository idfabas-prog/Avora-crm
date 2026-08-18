import Link from "next/link";
import {
  GhlCalendarTypeBackfillControls,
  GhlCalendarTypeMappingForm
} from "@/components/crm/GoHighLevelForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { explicitAppointmentTypeNameForGhlCalendar } from "@/lib/integrations/gohighlevel/calendar-type-mapping";
import { getGhlCalendarReport, sanitizeGhlDiagnosticText } from "@/lib/integrations/gohighlevel/reports";
import { createClient } from "@/lib/supabase/server";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function value(searchParams: Record<string, string | string[] | undefined>, key: string) {
  const item = searchParams[key];
  return Array.isArray(item) ? item[0] : item;
}

export default async function GoHighLevelCalendarsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  let report: Awaited<ReturnType<typeof getGhlCalendarReport>> | null = null;
  let reportError: string | null = null;
  try {
    report = await getGhlCalendarReport(supabase, profile, { connectionId: value(params, "connection_id") });
  } catch (error) {
    reportError = sanitizeGhlDiagnosticText(error instanceof Error ? error.message : "Unknown GHL calendar report error");
  }
  const showDevelopmentDiagnostics = process.env.NODE_ENV !== "production";

  return (
    <div className="page-stack">
      <PageHeader action={<Link className="secondary-button" href="/integrations/gohighlevel">Dashboard</Link>} description="Calendar mappings are local mirrors. Staff edits do not write back to GoHighLevel." title="GHL Calendar Mirror" />
      <section className="panel wide-panel">
        <div className="panel-header"><h2>Calendar Mappings</h2><span>Read-only sync</span></div>
        {reportError ? (
          <div className="alert-banner">
            <strong>Calendar report could not load.</strong>
            {showDevelopmentDiagnostics ? <span>{reportError}</span> : <span>Check server diagnostics before changing mappings.</span>}
          </div>
        ) : null}
        {report ? (
          <>
        {report.realConnections.length > 1 ? (
          <form className="query-toolbar">
            <select defaultValue={report.selectedConnection?.id ?? ""} name="connection_id">
              {report.realConnections.map((connection) => (
                <option key={connection.id} value={connection.id}>{connection.display_name} - {connection.ghl_location_id}</option>
              ))}
            </select>
            <button type="submit">Apply</button>
          </form>
        ) : null}
        {showDevelopmentDiagnostics ? (
          <div className="mini-list">
            <span>Real Connections Found {report.diagnostics.realConnectionsFound}</span>
            <span>Mock Connections Excluded {report.diagnostics.mockConnectionsExcluded}</span>
            <span>Selected Connection ID {report.diagnostics.selectedConnectionId ?? "none"}</span>
            <span>Selected GHL Location ID {report.diagnostics.selectedGhlLocationId ?? "none"}</span>
            <span>Real Calendars Shown {report.calendarRows.length}</span>
            <span>Real Calendar Mapping Count {report.diagnostics.calendarMappingCount}</span>
            <span>Explicit Calendar Mapping Count {report.diagnostics.explicitCalendarMappingCount}</span>
            <span>Derived Calendar Mapping Count {report.diagnostics.derivedCalendarMappingCount}</span>
            <span>Calendar IDs From Appointments {report.diagnostics.calendarIdsFromAppointmentMappings}</span>
            <span>Appointment Mapping Count {report.diagnostics.appointmentMappingCount}</span>
            <span>Malformed Mapping Metadata Skipped {report.diagnostics.malformedAppointmentMappingMetadataCount}</span>
            <span>Null Calendar IDs Skipped {report.diagnostics.nullCalendarIdAppointmentMappingCount}</span>
            <span>Invalid Calendar IDs Skipped {report.diagnostics.invalidCalendarIdAppointmentMappingCount}</span>
            <span>Invalid Internal Appointment IDs Skipped {report.diagnostics.invalidAppointmentInternalIdCount}</span>
            <span>Duplicate Derived Calendar IDs {report.diagnostics.duplicateDerivedCalendarIdCount}</span>
            <span>Malformed Calendar Rows Skipped {report.diagnostics.skippedMalformedCalendarMappingCount}</span>
            <span>Calendar Mapping Object Types {Object.entries(report.diagnostics.externalObjectTypeCounts).map(([type, count]) => `${type}: ${count}`).join(", ") || "none"}</span>
            <span>Internal Mapping Object Types {Object.entries(report.diagnostics.internalObjectTypeCounts).map(([type, count]) => `${type}: ${count}`).join(", ") || "none"}</span>
          </div>
        ) : null}
        {showDevelopmentDiagnostics && report.diagnostics.connectionAuditRows.length ? (
          <div className="record-list compact-list">
            {report.diagnostics.connectionAuditRows.map((connection) => (
              <article key={connection.id}>
                <strong>{connection.displayName || connection.id}</strong>
                <div className="mini-list">
                  <span>Connection ID {connection.id}</span>
                  <span>GHL Location ID {connection.ghlLocationId}</span>
                  <span>Dev Dashboard Location ID {connection.devDashboardLocationId ?? "none"}</span>
                  <span>Dev Dashboard Location {connection.devDashboardLocationName ?? "none"}</span>
                  <span>Connection Type {connection.connectionType}</span>
                  <span>Sync Mode {connection.syncMode}</span>
                  <span>Status {connection.status}</span>
                  <span>Token Present {connection.tokenPresent ? "Yes" : "No"}</span>
                  <span>Profile Location Access {connection.profileCanAccessLocation ? "Yes" : "No"}</span>
                  <span>Classification {connection.classifiedAsReal ? "Real" : "Mock/Excluded"}</span>
                  <span>Reason {connection.classificationReason}</span>
                </div>
              </article>
            ))}
          </div>
        ) : null}
        {report.selectedConnection ? (
          <div className="mini-list">
            <span>Selected Connection {report.selectedConnection.display_name}</span>
            <span>GHL Location ID {report.selectedConnection.ghl_location_id}</span>
          </div>
        ) : null}
        {report.diagnostics.zeroRowsReason ? (
          <p className="muted-copy">{report.diagnostics.zeroRowsReason}</p>
        ) : null}
        <div className="inline-actions">
          {report.connections.map((connection) => (
            <GhlCalendarTypeBackfillControls connectionId={connection.id} key={connection.id} />
          ))}
        </div>
        <div className="record-list">
          {report.calendarRows.map((mapping) => {
            const suggestedTypeName = explicitAppointmentTypeNameForGhlCalendar(mapping.calendarName);
            const mappingStatus = !mapping.mappedAppointmentTypeId
              ? "Needs type mapping"
              : mapping.mismatchCount > 0
                ? "Needs type backfill"
                : "Synced from GoHighLevel";
            return (
              <article key={mapping.id}>
                <strong>{mapping.calendarName}</strong>
                <p>{mapping.ghl_connections?.display_name ?? "Connection"} - {mapping.locations?.name ?? "Location"}</p>
                <div className="mini-list">
                  <span>GHL Calendar ID {mapping.external_id}</span>
                  <span>Mapped Internal Calendar ID {mapping.internal_id ?? "Not mapped"}</span>
                  <span>Mapped Internal Calendar Name {mapping.calendarName}</span>
                  <span>Mapped Appointment Type {mapping.mappedAppointmentTypeName ?? "Not configured"}</span>
                  <span>Imported Appointment Count {mapping.importedAppointmentCount}</span>
                  <span>Visible Through Calendar Type Filter {mapping.visibleThroughCalendarQuery}</span>
                  <span>Mismatch Count {mapping.mismatchCount}</span>
                  <span>External Provider/User Metadata {mapping.externalProviderUserCount}</span>
                  <span>Mapped Internal Provider {mapping.mappedProviderCount}</span>
                  <span>Still Unassigned {mapping.unassignedProviderCount}</span>
                  {suggestedTypeName ? <span>Suggested Type {suggestedTypeName}</span> : null}
                </div>
                <GhlCalendarTypeMappingForm
                  appointmentTypes={report.appointmentTypes}
                  connectionId={String(mapping.connection_id)}
                  currentAppointmentTypeId={mapping.mappedAppointmentTypeId}
                  externalCalendarId={String(mapping.external_id)}
                />
                <span><StatusBadge status={mappingStatus} /></span>
              </article>
            );
          })}
        </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
