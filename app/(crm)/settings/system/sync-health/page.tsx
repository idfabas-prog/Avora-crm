import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { assertSystemAccess } from "@/lib/system/audits";
import { getSystemHealthReport } from "@/lib/system/health-report";

function text(value: unknown) {
  return value === null || value === undefined || value === "" ? "Not available" : String(value);
}

export default async function SyncHealthPage() {
  const profile = await requireCurrentProfile();
  assertSystemAccess(profile);
  const supabase = await createClient();
  const report = await getSystemHealthReport(profile, supabase);

  return (
    <div className="page-stack">
      <PageHeader description="Read-only GoHighLevel polling cadence, checkpoints, queue depth, and exceptions." title="Sync Health" />
      <section className="settings-nav">
        <Link href="/settings/system/health">System Health</Link>
        <Link href="/settings/system/deployment">Deployment</Link>
        <Link href="/settings/system/workers">Workers</Link>
        <Link href="/settings/system/incidents">Incidents</Link>
      </section>
      <section className="stats-grid">
        <div className="stat-card"><span>Queue Depth</span><strong>{report.sync.queueDepth}</strong></div>
        <div className="stat-card"><span>Running</span><strong>{report.sync.runningJobs}</strong></div>
        <div className="stat-card"><span>Dead Letter</span><strong>{report.sync.deadLetterJobs}</strong></div>
        <div className="stat-card"><span>Exceptions</span><strong>{report.sync.unresolvedExceptions}</strong></div>
      </section>
      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-header"><h2>Cadence</h2><span>Environment-configurable</span></div>
          <div className="record-list">
            {report.sync.cadences.map((cadence) => (
              <article key={cadence.objectType}>
                <strong>{cadence.label}</strong>
                <p>Every {cadence.everyMinutes} minutes</p>
                <span>{cadence.envVar}</span>
              </article>
            ))}
          </div>
        </article>
        <article className="panel">
          <div className="panel-header"><h2>Recent Cursors</h2><span>{report.sync.cursors.length} rows</span></div>
          <div className="record-list">
            {report.sync.cursors.map((cursor) => (
              <article key={String(cursor.id)}>
                <strong>{text(cursor.object_type)}</strong>
                <p>Last success {text(cursor.last_successful_sync_at)}</p>
                <StatusBadge status={text(cursor.status)} />
              </article>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
