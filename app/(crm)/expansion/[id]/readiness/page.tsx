import Link from "next/link";
import { ChecklistStatusForm } from "@/components/crm/ExpansionForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { fromDbStatus, formatDate } from "@/lib/crm/constants";
import { getOpeningReadiness } from "@/lib/expansion/reports";
import { createClient } from "@/lib/supabase/server";

function daysUntil(value: string | null) {
  if (!value) return "TBD";
  return String(Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000));
}

export default async function ExpansionReadinessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const report = await getOpeningReadiness(supabase, profile, id);
  const overdue = report.checklist.filter((item) => item.due_date && item.due_date < new Date().toISOString().slice(0, 10) && !["complete", "not_applicable"].includes(item.status));

  return (
    <div className="page-stack">
      <PageHeader
        action={<div className="header-actions"><Link className="secondary-button" href={`/expansion/${id}`}>Project Detail</Link><Link className="secondary-button" href="/expansion">Expansion</Link></div>}
        description="Opening readiness is deterministic and advisory; required blockers prevent a simple ready signal."
        title={`${report.project.name} Readiness`}
      />

      <section className="metric-grid">
        <StatCard detail={fromDbStatus(report.readiness.status)} label="Overall" value={`${report.readiness.overall}%`} />
        <StatCard detail="Calendar days" label="Days to Target" value={daysUntil(report.project.targetOpenDate)} />
        <StatCard detail="Required blockers" label="Blockers" value={String(report.readiness.blockers.length)} />
        <StatCard detail="Incomplete past due" label="Overdue" value={String(overdue.length)} />
        <StatCard detail="Hired / planned" label="Staffing" value={`${report.staffingReadiness}%`} />
        <StatCard detail="Complete training" label="Training" value={`${report.trainingReadiness}%`} />
        <StatCard detail="Received / planned" label="Inventory" value={`${report.inventoryReadiness}%`} />
        <StatCard detail={fromDbStatus(String(report.marketingPlan?.status ?? "draft"))} label="Marketing" value={String(report.marketingPlan?.lead_goal ?? 0)} />
      </section>

      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Critical Blockers</h2><span>{report.readiness.blockers.length} active</span></div>
          <div className="record-list">
            {report.readiness.blockers.length ? report.readiness.blockers.map((item) => <article key={item.title}><strong>{item.title}</strong><p>{item.category} blocks readiness until completed or marked not applicable.</p></article>) : <article><strong>No hard blocker is active</strong><p>Readiness still requires human review before any opening decision.</p></article>}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Category Scores</h2><span>Checklist completion</span></div>
          <dl className="settings-list">
            {Object.entries(report.readiness.categoryScores).map(([category, score]) => <div key={category}><dt>{category}</dt><dd>{score}%</dd></div>)}
          </dl>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Overdue Items</h2><span>{overdue.length} incomplete</span></div>
          <div className="record-list">
            {overdue.map((item) => <article key={item.id}><strong>{item.title}</strong><p>{formatDate(item.due_date)} - {fromDbStatus(item.status)}</p><StatusBadge status={fromDbStatus(item.category)} /></article>)}
          </div>
        </section>
      </section>

      <section className="panel wide-panel">
        <div className="panel-header"><h2>Checklist Control</h2><span>Updates create audit and workflow events</span></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Category</th><th>Item</th><th>Due</th><th>Required</th><th>Blocker</th><th>Status</th><th>Update</th></tr></thead>
            <tbody>
              {report.checklist.map((item) => (
                <tr key={item.id}>
                  <td>{item.category}</td>
                  <td>{item.title}</td>
                  <td>{formatDate(item.due_date)}</td>
                  <td>{item.required ? "Yes" : "No"}</td>
                  <td>{item.blocker ? "Yes" : "No"}</td>
                  <td><StatusBadge status={fromDbStatus(item.status)} /></td>
                  <td><ChecklistStatusForm currentStatus={item.status} itemId={item.id} projectId={id} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
