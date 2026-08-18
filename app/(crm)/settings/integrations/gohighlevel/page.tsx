import Link from "next/link";
import { GhlAppointmentStatusBackfillApplyForm, GhlAppointmentStatusBackfillDryRunForm, GhlConnectionForm, GhlDryRunPreviewForm, GhlFullImportForm, GhlImportControlForms, GhlIncrementalSyncNowForm, GhlTestConnectionForm } from "@/components/crm/GoHighLevelForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { isMockGhlConnection } from "@/lib/integrations/gohighlevel/auth";
import type { GhlDryRunPreview } from "@/lib/integrations/gohighlevel/dry-run";
import { GHL_MIAMI_EXPECTED_LOCATION_ID, GHL_OAUTH_SCOPES } from "@/lib/integrations/gohighlevel/oauth";
import { getGhlDashboardReport } from "@/lib/integrations/gohighlevel/reports";
import { GHL_SUPPORTED_WEBHOOK_EVENTS } from "@/lib/integrations/gohighlevel/webhooks";
import { hasGhlPermission } from "@/lib/integrations/gohighlevel/permissions";
import { createClient } from "@/lib/supabase/server";

function label(value: string) {
  return value.toLowerCase().replace(/_/g, " ");
}

function webhookCallbackUrl() {
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  return appUrl ? `${appUrl}/api/integrations/gohighlevel/webhook` : "Set APP_URL before configuring the webhook callback";
}

function webhookVerificationStatus() {
  if (process.env.GHL_WEBHOOK_PUBLIC_KEY) return "X-GHL-Signature public key configured";
  if (process.env.GHL_WEBHOOK_LEGACY_PUBLIC_KEY) return "Legacy X-WH-Signature public key configured";
  if (process.env.GHL_WEBHOOK_SECRET) return "Shared-secret fallback configured";
  return "Not configured";
}

function GhlWebhookSetup({
  connectionId,
  cursors,
  incrementalSchedule,
  readSyncEnabled,
  webhookEvents,
  jobs
}: {
  connectionId: string;
  cursors: Record<string, { last_sync_completed_at?: string | null; cursor_value?: string | null; last_page_token?: string | null }>;
  incrementalSchedule: Array<{ objectType: string; everyMinutes: number }>;
  readSyncEnabled: boolean;
  webhookEvents: Array<{ connection_id?: string | null; status?: string | null; event_type?: string | null; received_at?: string | null; error_summary?: string | null }>;
  jobs: Array<{ connection_id?: string | null; status?: string | null; object_type?: string | null; last_error?: string | null }>;
}) {
  const recentEvents = webhookEvents.filter((event) => event.connection_id === connectionId);
  const latestEvent = recentEvents[0];
  const latestFailure = recentEvents.find((event) => ["failed", "ignored"].includes(String(event.status ?? "")));
  const connectionJobs = jobs.filter((job) => job.connection_id === connectionId);
  const queueDepth = connectionJobs.filter((job) => ["queued", "locked", "running"].includes(String(job.status ?? ""))).length;
  const lastError = connectionJobs.find((job) => job.last_error)?.last_error ?? latestFailure?.error_summary ?? null;
  const dueTimes = incrementalSchedule.map((item) => {
    const completed = cursors[item.objectType]?.last_sync_completed_at;
    if (!completed) return `${label(item.objectType)}: due now`;
    const next = new Date(new Date(completed).getTime() + item.everyMinutes * 60 * 1000);
    return `${label(item.objectType)}: ${next.toLocaleString()}`;
  });
  const staleCursorCount = incrementalSchedule.filter((item) => {
    const completed = cursors[item.objectType]?.last_sync_completed_at;
    return !completed;
  }).length;
  const status = !readSyncEnabled ? "disabled" : lastError ? "degraded" : staleCursorCount > 0 ? "warning" : "healthy";

  return (
    <section className="mini-panel">
      <div className="panel-header">
        <h3>Continuous Read-Only Sync</h3>
        <StatusBadge status={status} />
      </div>
      <dl>
        <div><dt>Enabled</dt><dd>{readSyncEnabled ? "Enabled" : "Disabled"}</dd></div>
        <div><dt>Webhook Callback URL</dt><dd>{webhookCallbackUrl()}</dd></div>
        <div><dt>Signature Verification</dt><dd>{webhookVerificationStatus()}</dd></div>
        <div><dt>Last Webhook</dt><dd>{latestEvent?.received_at ? new Date(latestEvent.received_at).toLocaleString() : "No webhook received"}</dd></div>
        <div><dt>Last Error</dt><dd>{lastError ? label(String(lastError)) : "None in recent events"}</dd></div>
        <div><dt>Queue Depth</dt><dd>{queueDepth}</dd></div>
        <div><dt>Last Appointment Sync</dt><dd>{cursors.appointment?.last_sync_completed_at ? new Date(cursors.appointment.last_sync_completed_at).toLocaleString() : "Not yet completed"}</dd></div>
        <div><dt>Last Contact Sync</dt><dd>{cursors.contact?.last_sync_completed_at ? new Date(cursors.contact.last_sync_completed_at).toLocaleString() : "Not yet completed"}</dd></div>
        <div><dt>Last Opportunity Sync</dt><dd>{cursors.opportunity?.last_sync_completed_at ? new Date(cursors.opportunity.last_sync_completed_at).toLocaleString() : "Not yet completed"}</dd></div>
        <div><dt>Last Conversation Sync</dt><dd>{cursors.conversation?.last_sync_completed_at ? new Date(cursors.conversation.last_sync_completed_at).toLocaleString() : "Not yet completed"}</dd></div>
        <div><dt>Last Transaction Sync</dt><dd>{cursors.transaction?.last_sync_completed_at ? new Date(cursors.transaction.last_sync_completed_at).toLocaleString() : "Not yet completed"}</dd></div>
      </dl>
      <GhlIncrementalSyncNowForm connectionId={connectionId} />
      <div className="mini-list">
        <strong>Manual HighLevel Event Checklist</strong>
        <span>{GHL_SUPPORTED_WEBHOOK_EVENTS.join(", ")}</span>
      </div>
      <div className="mini-list">
        <strong>Incremental Polling</strong>
        <span>{incrementalSchedule.map((item) => `${label(item.objectType)} every ${item.everyMinutes} min`).join("; ")}</span>
      </div>
      <div className="mini-list">
        <strong>Next Scheduled Sync</strong>
        <span>{dueTimes.join("; ")}</span>
      </div>
    </section>
  );
}

function GhlOAuthSetup({
  connectionId,
  installation
}: {
  connectionId: string;
  installation?: {
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
}) {
  const installed = Boolean(installation && ["healthy", "pending", "refresh_failed"].includes(String(installation.status ?? "")));
  return (
    <section className="mini-panel">
      <div className="panel-header">
        <h3>HighLevel Marketplace App</h3>
        <StatusBadge status={installation?.status ? label(String(installation.status)) : "not installed"} />
      </div>
      <dl>
        <div><dt>OAuth Status</dt><dd>{installed ? "Installed" : "Not Installed"}</dd></div>
        <div><dt>Installed GHL Location</dt><dd>{installation?.ghl_location_id ?? "None"}</dd></div>
        <div><dt>Expected Miami Location</dt><dd>{installation?.expected_ghl_location_id ?? GHL_MIAMI_EXPECTED_LOCATION_ID}</dd></div>
        <div><dt>Scopes</dt><dd>{installation?.scopes?.join(", ") || GHL_OAUTH_SCOPES.join(", ")}</dd></div>
        <div><dt>Access Token Expiration</dt><dd>{installation?.access_token_expires_at ? new Date(installation.access_token_expires_at).toLocaleString() : "Not available"}</dd></div>
        <div><dt>Last Token Refresh</dt><dd>{installation?.last_refreshed_at ? new Date(installation.last_refreshed_at).toLocaleString() : "Never"}</dd></div>
        <div><dt>Webhook Readiness</dt><dd>{installation?.webhook_ready ? "Ready" : "Not ready"}</dd></div>
      </dl>
      {installation?.status_reason ? <p className="form-error">{installation.status_reason}</p> : null}
      <a className="primary-button" href={`/api/integrations/gohighlevel/oauth/install?connection_id=${connectionId}`}>
        {installed ? "Reconnect HighLevel App" : "Install HighLevel Webhooks"}
      </a>
    </section>
  );
}

function DryRunPreviewResult({ preview }: { preview: GhlDryRunPreview }) {
  return (
    <section className="dry-run-preview">
      <div className="panel-header">
        <h3>Latest Preview Import</h3>
        <StatusBadge status={label(preview.readiness)} />
      </div>
      <dl>
        <div><dt>GHL Location</dt><dd>{preview.location.name ?? "Unknown"} ({preview.location.returnedLocationId ?? "not returned"})</dd></div>
        <div><dt>Location ID Match</dt><dd>{preview.location.locationIdMatches ? "Yes" : "No"}</dd></div>
        <div><dt>Generated</dt><dd>{new Date(preview.generatedAt).toLocaleString()}</dd></div>
      </dl>
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Object</th><th>Status / Error</th><th>HTTP</th><th>Fetched</th><th>Pages</th><th>Matches</th><th>Create</th><th>Update</th><th>Review</th><th>Scope/API</th></tr></thead>
          <tbody>
            {preview.objects.map((object) => (
              <tr key={object.objectType}>
                <td>{object.objectType}</td>
                <td>{label(object.status ?? "unknown")}{object.safeErrorMessage ? ` - ${object.safeErrorMessage}` : ""}</td>
                <td>{object.httpStatus ?? "n/a"}</td>
                <td>{object.recordsFetched}</td>
                <td>{object.pagesFetched}</td>
                <td>{object.existingMatches}</td>
                <td>{object.wouldCreate}</td>
                <td>{object.wouldUpdate}</td>
                <td>{object.duplicates + object.ambiguousMatches}</td>
                <td>{[...(object.missingScopes ?? []), ...(object.parserWarnings ?? []), ...(object.unsupportedLimitations ?? [])].join("; ") || `${object.requestMethod ?? "GET"} ${object.endpoint ?? "endpoint recorded on next run"} (${object.apiVersion ?? "version recorded on next run"}; params: ${object.queryParameterNames?.join(", ") || "none"})`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="preview-grid">
        <article>
          <strong>Contacts</strong>
          <p>Total {preview.contacts.totalContacts}; external ID {preview.contacts.matchedByExternalId}; phone {preview.contacts.matchedByExactPhone}; email {preview.contacts.matchedByExactEmail}; new {preview.contacts.newContacts}; review {preview.contacts.potentialDuplicatesRequiringReview}</p>
        </article>
        <article>
          <strong>Appointments</strong>
          <p>Total {preview.appointments.totalRetrievable}; future {preview.appointments.futureRetrievable}; earliest {preview.appointments.earliestRetrievableAppointmentDate ?? "none"}; latest {preview.appointments.latestAppointmentDate ?? "none"}</p>
          <span>{[
            preview.appointments.unknownStatuses.length ? `Unknown statuses: ${preview.appointments.unknownStatuses.join(", ")}` : "",
            preview.appointments.unmappedCalendars.length ? `Unmapped calendars: ${preview.appointments.unmappedCalendars.length}` : "",
            preview.appointments.unmappedProviders.length ? `Unmapped providers: ${preview.appointments.unmappedProviders.length}` : ""
          ].filter(Boolean).join(" | ") || "No appointment blockers found in preview"}</span>
        </article>
      </div>
      {preview.calendars.length ? (
        <div className="record-list">
          {preview.calendars.map((calendar) => (
            <article key={calendar.ghlCalendarId}>
              <strong>{calendar.calendarName}</strong>
              <p>ID {calendar.ghlCalendarId} - timezone {calendar.timezone ?? "unknown"} - owner/team {calendar.ownerOrTeam ?? "unknown"} - future appointments {calendar.futureAppointmentCount}</p>
              <span>Proposed mapping: {calendar.proposedMapping}</span>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export default async function GoHighLevelSettingsPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const report = await getGhlDashboardReport(supabase, profile);

  return (
    <div className="page-stack">
      <PageHeader
        action={<div className="header-actions"><Link className="secondary-button" href="/integrations/gohighlevel">Dashboard</Link><Link className="secondary-button" href="/settings/integrations/gohighlevel/calendars">Calendars</Link></div>}
        description="Connection metadata and server-only credential references. Private integration tokens are never displayed."
        title="GoHighLevel Settings"
      />
      {hasGhlPermission(profile, "integrations.ghl.manage") ? <section className="panel"><div className="panel-header"><h2>Add or Update Connection</h2><span>Read-only</span></div><GhlConnectionForm locations={profile.locations} /></section> : null}
      <section className="settings-grid">
        {report.connections.map((connection) => {
          const isMock = isMockGhlConnection(connection);
          const preview = report.latestDryRunPreviews[connection.id];
          return (
          <article className="settings-card" key={connection.id}>
            <div><h2>{connection.display_name}</h2><StatusBadge status={connection.status} /></div>
            <dl>
              <div><dt>Dev Dashboard Location</dt><dd>{connection.locations?.name ?? "Organization-wide"}</dd></div>
              <div><dt>GHL Location ID</dt><dd>{connection.ghl_location_id}</dd></div>
              <div><dt>Credential Key</dt><dd>{connection.credential_env_key ?? "Not configured"}</dd></div>
              <div><dt>Token Present?</dt><dd>{connection.tokenPresentRuntime ? "Yes" : "No"}</dd></div>
              <div><dt>Server Credential Check</dt><dd>{connection.credentialDiagnostic.blockedReason ?? (connection.credentialDiagnostic.tokenPresent ? "Token present" : "Token missing")}</dd></div>
              <div><dt>Objects Enabled</dt><dd>{Object.entries(connection.objects_enabled ?? {}).filter(([, enabled]) => enabled).map(([key]) => key).join(", ")}</dd></div>
            </dl>
            {hasGhlPermission(profile, "integrations.ghl.sync") && !isMock ? (
              <div className="form-stack">
                <GhlTestConnectionForm connectionId={connection.id} />
                <GhlDryRunPreviewForm connectionId={connection.id} />
                <GhlAppointmentStatusBackfillDryRunForm connectionId={connection.id} />
                <GhlAppointmentStatusBackfillApplyForm connectionId={connection.id} />
                <GhlFullImportForm connectionId={connection.id} />
                <GhlImportControlForms connectionId={connection.id} />
                <GhlOAuthSetup connectionId={connection.id} installation={report.oauthInstallationsByConnection[connection.id]} />
                <GhlWebhookSetup
                  connectionId={connection.id}
                  cursors={report.cursorsByConnection[connection.id] ?? {}}
                  incrementalSchedule={report.incrementalSchedule}
                  readSyncEnabled={report.readSyncEnabled}
                  webhookEvents={report.webhookEvents}
                  jobs={report.jobs}
                />
              </div>
            ) : null}
            {preview ? <DryRunPreviewResult preview={preview} /> : null}
          </article>
          );
        })}
      </section>
    </div>
  );
}
