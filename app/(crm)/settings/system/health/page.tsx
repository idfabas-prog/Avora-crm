import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { assertSystemAccess } from "@/lib/system/audits";
import { getSystemHealthReport } from "@/lib/system/health-report";

function valueText(value: unknown, fallback = "Not available") {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function timestampText(value: unknown) {
  if (typeof value !== "string" || !value) return "Not available";
  return new Date(value).toLocaleString();
}

export default async function SystemHealthPage() {
  const profile = await requireCurrentProfile();
  assertSystemAccess(profile);
  const supabase = await createClient();
  const report = await getSystemHealthReport(profile, supabase);
  const connection = report.ghl.connection;

  return (
    <div className="page-stack">
      <PageHeader description="Production readiness, worker heartbeat, queue depth, and read-only GHL synchronization health." title="System Health" />
      <section className="settings-nav">
        <Link href="/settings/system">System</Link>
        <Link href="/settings/system/deployment">Deployment</Link>
        <Link href="/settings/system/workers">Workers</Link>
        <Link href="/settings/system/incidents">Incidents</Link>
        <Link href="/settings/system/sync-health">Sync Health</Link>
      </section>
      <section className="stats-grid">
        <div className="stat-card"><span>Overall</span><strong>{report.overallStatus}</strong></div>
        <div className="stat-card"><span>Queue Depth</span><strong>{report.sync.queueDepth}</strong></div>
        <div className="stat-card"><span>Running Jobs</span><strong>{report.sync.runningJobs}</strong></div>
        <div className="stat-card"><span>Unresolved Exceptions</span><strong>{report.sync.unresolvedExceptions}</strong></div>
      </section>
      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-header"><h2>Application</h2><StatusBadge status={report.environment.ok ? "healthy" : "degraded"} /></div>
          <dl className="settings-list">
            <div><dt>Environment</dt><dd>{report.app.environment}</dd></div>
            <div><dt>Version</dt><dd>{report.app.version}</dd></div>
            <div><dt>Deployment Timestamp</dt><dd>{valueText(report.app.deploymentTimestamp)}</dd></div>
            <div><dt>Uptime</dt><dd>{report.app.uptimeSeconds === null ? "Not available" : `${report.app.uptimeSeconds}s`}</dd></div>
          </dl>
        </article>
        <article className="panel">
          <div className="panel-header"><h2>Supabase</h2><StatusBadge status={report.database.reachable ? "healthy" : "degraded"} /></div>
          <dl className="settings-list">
            <div><dt>Database Reachable</dt><dd>{valueText(report.database.reachable)}</dd></div>
            <div><dt>Service Role Configured</dt><dd>{valueText(report.database.serviceRolePresent)}</dd></div>
            <div><dt>Migration Status</dt><dd>{report.database.migrationStatus}</dd></div>
            <div><dt>Storage Health</dt><dd>{report.storage.summary}</dd></div>
          </dl>
        </article>
        <article className="panel">
          <div className="panel-header"><h2>GHL Miami</h2><StatusBadge status={connection ? "healthy" : "warning"} /></div>
          <dl className="settings-list">
            <div><dt>Connection</dt><dd>{valueText(connection?.display_name ?? connection?.name, "Not configured")}</dd></div>
            <div><dt>GHL Location ID</dt><dd>{valueText(report.ghl.miamiLocationId, "Not configured")}</dd></div>
            <div><dt>Token Present</dt><dd>{valueText(report.ghl.tokenPresent)}</dd></div>
            <div><dt>Write Gate</dt><dd>{report.ghl.writeGate}</dd></div>
            <div><dt>Last API Success</dt><dd>{timestampText(report.ghl.lastApiSuccess)}</dd></div>
            <div><dt>Last API Failure</dt><dd>{timestampText(report.ghl.lastApiFailure)}</dd></div>
          </dl>
        </article>
      </section>
      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-header"><h2>Continuous Worker</h2><span>{report.workers.heartbeats.length} heartbeat rows</span></div>
          <div className="record-list">
            {report.workers.heartbeats.length === 0 ? <article><strong>No worker heartbeat recorded</strong><p>Start the production worker process after deployment.</p><StatusBadge status="warning" /></article> : null}
            {report.workers.heartbeats.map((heartbeat) => (
              <article key={String(heartbeat.id)}>
                <strong>{valueText(heartbeat.worker_id)} · {valueText(heartbeat.worker_type)}</strong>
                <p>{valueText(heartbeat.current_object_type, "Idle")} · last heartbeat {timestampText(heartbeat.last_heartbeat_at)}</p>
                <StatusBadge status={valueText(heartbeat.status, "unknown")} />
              </article>
            ))}
          </div>
        </article>
        <article className="panel">
          <div className="panel-header"><h2>Sync Schedule</h2><span>Configurable</span></div>
          <div className="record-list">
            {report.sync.cadences.map((cadence) => (
              <article key={cadence.objectType}>
                <strong>{cadence.label}</strong>
                <p>Every {cadence.everyMinutes} minutes · {cadence.envVar}</p>
              </article>
            ))}
          </div>
        </article>
        <article className="panel">
          <div className="panel-header"><h2>Open Incidents</h2><span>{report.incidents.length} rows</span></div>
          <div className="record-list">
            {report.incidents.length === 0 ? <article><strong>No open incidents</strong><p>Incident feed is clear.</p><StatusBadge status="healthy" /></article> : null}
            {report.incidents.map((incident) => (
              <article key={String(incident.id)}>
                <strong>{valueText(incident.severity)} · {valueText(incident.incident_type)}</strong>
                <p>{valueText(incident.message ?? incident.summary)}</p>
                <StatusBadge status={valueText(incident.status)} />
              </article>
            ))}
          </div>
        </article>
      </section>
      {report.database.errors.length > 0 ? (
        <section className="panel">
          <div className="panel-header"><h2>Safe Diagnostics</h2><StatusBadge status="warning" /></div>
          <div className="record-list">
            {report.database.errors.map((error) => <article key={error}><strong>Database diagnostic</strong><p>{error}</p></article>)}
          </div>
        </section>
      ) : null}
    </div>
  );
}
