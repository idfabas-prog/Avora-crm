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

export default async function WorkersPage() {
  const profile = await requireCurrentProfile();
  assertSystemAccess(profile);
  const supabase = await createClient();
  const report = await getSystemHealthReport(profile, supabase);

  return (
    <div className="page-stack">
      <PageHeader description="Worker heartbeat, leases, stale-lock recovery, and scheduler lock status." title="Workers" />
      <section className="settings-nav">
        <Link href="/settings/system/health">System Health</Link>
        <Link href="/settings/system/deployment">Deployment</Link>
        <Link href="/settings/system/incidents">Incidents</Link>
        <Link href="/settings/system/sync-health">Sync Health</Link>
      </section>
      <section className="stats-grid">
        <div className="stat-card"><span>Heartbeats</span><strong>{report.workers.heartbeats.length}</strong></div>
        <div className="stat-card"><span>Scheduler Locks</span><strong>{report.workers.locks.length}</strong></div>
        <div className="stat-card"><span>Stale Jobs</span><strong>{report.sync.staleJobs}</strong></div>
      </section>
      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-header"><h2>Worker Heartbeats</h2><span>Lease-backed</span></div>
          <div className="record-list">
            {report.workers.heartbeats.map((heartbeat) => (
              <article key={String(heartbeat.id)}>
                <strong>{text(heartbeat.worker_id)}</strong>
                <p>{text(heartbeat.worker_type)} · {text(heartbeat.current_object_type)}</p>
                <span>Lease expires {text(heartbeat.lease_expires_at)}</span>
                <StatusBadge status={text(heartbeat.status)} />
              </article>
            ))}
          </div>
        </article>
        <article className="panel">
          <div className="panel-header"><h2>Scheduler Locks</h2><span>Duplicate invocation protection</span></div>
          <div className="record-list">
            {report.workers.locks.map((lock) => (
              <article key={String(lock.id)}>
                <strong>{text(lock.lock_key)}</strong>
                <p>{text(lock.worker_id)} · lease expires {text(lock.lease_expires_at)}</p>
                <span>Heartbeat {text(lock.heartbeat_at)}</span>
              </article>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
