import Link from "next/link";
import { GhlConnectionActions } from "@/components/crm/GoHighLevelForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { formatDateTime } from "@/lib/crm/constants";
import { getGhlDashboardReport } from "@/lib/integrations/gohighlevel/reports";
import { createClient } from "@/lib/supabase/server";

export default async function GoHighLevelDashboardPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const report = await getGhlDashboardReport(supabase, profile);
  const mapped = Object.values(report.mappedCounts).reduce((sum, count) => sum + Number(count), 0);

  return (
    <div className="page-stack">
      <PageHeader
        action={<div className="header-actions"><Link className="secondary-button" href="/settings/integrations/gohighlevel">Settings</Link><Link className="secondary-button" href="/settings/integrations/gohighlevel/calendars">Calendars</Link><Link className="primary-button" href="/integrations/gohighlevel/reconciliation">Reconciliation</Link></div>}
        description="Read-only GoHighLevel mirror status. Dev Dashboard never writes back to GHL in Phase 21."
        title="GoHighLevel Integration"
      />
      <section className="metric-grid">
        <StatCard detail={`Mode ${report.mode}`} label="Connections" value={String(report.connections.length)} />
        <StatCard detail="External IDs mapped locally" label="Mapped Records" value={String(mapped)} />
        <StatCard detail="Open/review/ignored/resolved" label="Exceptions" value={String(Object.values(report.exceptionCounts).reduce((sum, count) => sum + Number(count), 0))} />
        <StatCard detail={report.writesAllowed ? "Unexpectedly enabled" : "Writes blocked"} label="Write Gate" value={report.writesAllowed ? "Enabled" : "Disabled"} />
      </section>
      <section className="settings-grid">
        {report.connections.map((connection) => (
          <article className="settings-card" key={connection.id}>
            <div><h2>{connection.display_name}</h2><StatusBadge status={connection.status} /></div>
            <dl>
              <div><dt>GHL Location</dt><dd>{connection.ghl_location_id}</dd></div>
              <div><dt>Sync Mode</dt><dd>{connection.sync_mode}</dd></div>
              <div><dt>Token Present?</dt><dd>{connection.tokenPresentRuntime ? "Yes" : "No"}</dd></div>
              <div><dt>Last Sync</dt><dd>{connection.last_successful_sync_at ? formatDateTime(connection.last_successful_sync_at) : "Never"}</dd></div>
              <div><dt>Mirror Mode</dt><dd>GHL to Dev Dashboard only</dd></div>
            </dl>
            <GhlConnectionActions connectionId={connection.id} />
          </article>
        ))}
      </section>
      <section className="dashboard-grid">
        <article className="panel"><div className="panel-header"><h2>Mapped Objects</h2><span>Local mirror</span></div><div className="record-list">{Object.entries(report.mappedCounts).map(([type, count]) => <article key={type}><strong>{type}</strong><p>{count} mapped records</p></article>)}</div></article>
        <article className="panel"><div className="panel-header"><h2>Recent Runs</h2><Link href="/integrations/gohighlevel/runs">All runs</Link></div><div className="record-list">{report.runs.map((run) => <article key={run.id}><strong>{run.sync_type}</strong><p>{run.status} · fetched {run.records_fetched}</p><span>{formatDateTime(run.started_at)}</span></article>)}</div></article>
      </section>
    </div>
  );
}
