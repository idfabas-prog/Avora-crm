import Link from "next/link";
import { GhlConnectionActions } from "@/components/crm/GoHighLevelForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { getGhlReconciliationReport } from "@/lib/integrations/gohighlevel/reports";
import { createClient } from "@/lib/supabase/server";

export default async function GoHighLevelReconciliationPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const report = await getGhlReconciliationReport(supabase, profile);

  return (
    <div className="page-stack">
      <PageHeader action={<Link className="secondary-button" href="/integrations/gohighlevel/exceptions">Exceptions</Link>} description="Compares GHL-retrieved counts, mapped Dev Dashboard records, stale mappings, and exceptions." title="GHL Reconciliation" />
      <section className="metric-grid">
        <StatCard detail="Contacts, calendars, appointments, messages, opportunities, payments" label="Mapped" value={String(Object.values(report.mappedCounts).reduce((sum, value) => sum + Number(value), 0))} />
        <StatCard detail="Needs review" label="Open Exceptions" value={String(report.exceptionCounts.open ?? 0)} />
        <StatCard detail="Read-only mirror" label="Write Gate" value={report.writesAllowed ? "Enabled" : "Disabled"} />
      </section>
      <section className="settings-grid">{report.connections.map((connection) => <article className="settings-card" key={connection.id}><div><h2>{connection.display_name}</h2><StatusBadge status={connection.status} /></div><p>Run reconciliation after dry-run/import to detect missing, duplicate, stale, or unsupported GHL records.</p><GhlConnectionActions connectionId={connection.id} /></article>)}</section>
      <section className="panel"><div className="panel-header"><h2>Recent Exceptions</h2><span>{report.exceptions.length} shown</span></div><div className="record-list">{report.exceptions.map((exception) => <article key={exception.id}><strong>{exception.exception_type}</strong><p>{exception.summary}</p><span>{exception.status} · {exception.severity}</span></article>)}</div></section>
    </div>
  );
}
