import Link from "next/link";
import { ChecklistStatusForm, ExpansionStageForm, SiteStatusForm } from "@/components/crm/ExpansionForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { fromDbStatus, formatDate } from "@/lib/crm/constants";
import { getExpansionProjectSummary, getSiteComparison } from "@/lib/expansion/reports";
import { formatMoney } from "@/lib/financial/money";
import { createClient } from "@/lib/supabase/server";

function asText(value: unknown) {
  return String(value ?? "");
}

function asNumber(value: unknown) {
  return Number(value ?? 0);
}

export default async function ExpansionProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const [summary, siteComparison] = await Promise.all([
    getExpansionProjectSummary(supabase, profile, id),
    getSiteComparison(supabase, profile, id)
  ]);
  const model = summary.financialModel;

  return (
    <div className="page-stack">
      <PageHeader
        action={<div className="header-actions"><Link className="secondary-button" href={`/expansion/${id}/readiness`}>Readiness</Link><Link className="secondary-button" href="/expansion">Expansion</Link></div>}
        description={`${summary.project.market} launch plan. Planning metadata only; no leases, franchise rights, or money movement are automated.`}
        title={summary.project.name}
      />

      <section className="metric-grid">
        <StatCard detail={fromDbStatus(summary.project.readinessStatus)} label="Opening Readiness" value={`${summary.project.readiness}%`} />
        <StatCard detail={fromDbStatus(summary.project.risk)} label="Risk" value={String(summary.project.blockers.length + summary.project.overdueCount)} />
        <StatCard detail="Candidate sites" label="Sites" value={String(summary.sites.length)} />
        <StatCard detail="Target open date" label="Target" value={formatDate(summary.project.targetOpenDate)} />
        <StatCard detail="Planning only" label="Startup Plan" value={model ? formatMoney(model.startup_cost_cents) : "N/A"} />
        <StatCard detail="Estimated" label="Break-Even" value={model?.break_even_months ? `${model.break_even_months} mo` : "TBD"} />
      </section>

      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Overview</h2><span>{summary.project.region}</span></div>
          <dl className="settings-list">
            <div><dt>Stage</dt><dd><ExpansionStageForm currentStage={summary.project.stage} projectId={id} /></dd></div>
            <div><dt>Territory</dt><dd>{summary.project.territory}</dd></div>
            <div><dt>Owner</dt><dd>{summary.project.owner}</dd></div>
            <div><dt>Budget Variance</dt><dd>{summary.project.budgetVarianceCents >= 0 ? formatMoney(summary.project.budgetVarianceCents) : `Over ${formatMoney(Math.abs(summary.project.budgetVarianceCents))}`}</dd></div>
          </dl>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Financial Assumptions</h2><span>Not accounting records</span></div>
          <dl className="settings-list">
            <div><dt>Buildout</dt><dd>{model ? formatMoney(model.buildout_cost_cents) : "N/A"}</dd></div>
            <div><dt>Equipment</dt><dd>{model ? formatMoney(model.equipment_cost_cents) : "N/A"}</dd></div>
            <div><dt>Launch Marketing</dt><dd>{model ? formatMoney(model.launch_marketing_cents) : "N/A"}</dd></div>
            <div><dt>Target Revenue</dt><dd>{model ? formatMoney(model.target_monthly_revenue_cents) : "N/A"}</dd></div>
          </dl>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Launch Marketing</h2><span>Phase 14 foundation</span></div>
          <dl className="settings-list">
            <div><dt>Prelaunch Budget</dt><dd>{formatMoney(asNumber(summary.marketingPlan?.prelaunch_budget_cents))}</dd></div>
            <div><dt>Launch Budget</dt><dd>{formatMoney(asNumber(summary.marketingPlan?.launch_budget_cents))}</dd></div>
            <div><dt>Lead Goal</dt><dd>{asText(summary.marketingPlan?.lead_goal)}</dd></div>
            <div><dt>Status</dt><dd>{fromDbStatus(asText(summary.marketingPlan?.status))}</dd></div>
          </dl>
        </section>
      </section>

      <section className="panel wide-panel">
        <div className="panel-header"><h2>Site Comparison</h2><span>Human due diligence required</span></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Site</th><th>Market</th><th>Rent</th><th>Size</th><th>Score</th><th>Overlap</th><th>Status</th><th>Update</th></tr></thead>
            <tbody>
              {siteComparison.map((site) => (
                <tr key={site.id}>
                  <td>{site.name}<br /><span>{site.city}, {site.state} {site.postal_code}</span></td>
                  <td>{site.scorecard.factors.slice(1, 4).join(" / ")}</td>
                  <td>{formatMoney(site.asking_rent_cents)}</td>
                  <td>{site.square_feet ?? "N/A"} sf</td>
                  <td>{site.scorecard.score}/100</td>
                  <td><StatusBadge status={fromDbStatus(site.overlap.risk)} /></td>
                  <td><StatusBadge status={fromDbStatus(site.status)} /></td>
                  <td><SiteStatusForm currentStatus={site.status} projectId={id} siteId={site.id} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Checklist</h2><span>{summary.checklist.length} items</span></div>
          <div className="record-list">
            {summary.checklist.slice(0, 12).map((item) => (
              <article key={item.id}>
                <strong>{item.title}</strong>
                <p>{item.category} - due {formatDate(item.due_date)}</p>
                <ChecklistStatusForm currentStatus={item.status} itemId={item.id} projectId={id} />
              </article>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Staffing & Training</h2><span>Compensation guarded</span></div>
          <div className="record-list">
            {summary.staffing.map((row) => (
              <article key={asText(row.id)}>
                <strong>{asText(row.role_name)}</strong>
                <p>{asText(row.hired_count)} hired of {asText(row.planned_headcount)} planned</p>
                <span>{summary.visibleCompensation ? `${formatMoney(asNumber(row.planned_salary_cents))} salary plan / ${formatMoney(asNumber(row.planned_hourly_rate_cents))} hourly` : "Compensation restricted"}</span>
              </article>
            ))}
            {summary.training.map((row) => <article key={asText(row.id)}><strong>{asText(row.training_name)}</strong><p>{fromDbStatus(asText(row.status))} - due {formatDate(asText(row.due_date))}</p></article>)}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Inventory & Equipment</h2><span>Launch plan</span></div>
          <div className="record-list">
            {summary.inventory.map((row) => {
              const item = Array.isArray(row.inventory_items) ? row.inventory_items[0] : row.inventory_items as { name?: string; unit_of_measure?: string } | undefined;
              return <article key={asText(row.id)}><strong>{item?.name ?? "Inventory item"}</strong><p>{asText(row.received_quantity)} of {asText(row.planned_quantity)} {item?.unit_of_measure ?? "units"}</p><span>{fromDbStatus(asText(row.status))}</span></article>;
            })}
            {summary.equipment.map((row) => <article key={asText(row.id)}><strong>{asText(row.name)}</strong><p>{asText(row.quantity)} planned - {asText(row.category)}</p><span>{asNumber(row.installed) ? "Installed" : "Pending"}</span></article>)}
          </div>
        </section>
      </section>

      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Milestones</h2><span>Roadmap</span></div>
          <div className="record-list">{summary.milestones.map((row) => <article key={asText(row.id)}><strong>{asText(row.name)}</strong><p>{formatDate(asText(row.milestone_date))} - {fromDbStatus(asText(row.status))}</p></article>)}</div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Budget Items</h2><span>Planning variance</span></div>
          <div className="record-list">{summary.budgets.map((row) => <article key={`${row.expansion_project_id}-${row.category}-${row.description}`}><strong>{fromDbStatus(row.category)}</strong><p>{row.description}</p><span>{formatMoney(row.actual_cents)} actual / {formatMoney(row.budget_cents)} budget</span></article>)}</div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Documents</h2><span>Metadata only</span></div>
          <div className="record-list">{summary.documents.map((row) => <article key={asText(row.id)}><strong>{asText(row.title)}</strong><p>{fromDbStatus(asText(row.document_type))}</p><span>No storage required for demo metadata</span></article>)}</div>
        </section>
      </section>
    </div>
  );
}
