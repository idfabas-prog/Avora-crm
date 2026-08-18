import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { fromDbStatus, formatDate } from "@/lib/crm/constants";
import { hasExpansionPermission } from "@/lib/expansion/permissions";
import { getExpansionPortfolio } from "@/lib/expansion/reports";
import { formatMoney } from "@/lib/financial/money";
import { createClient } from "@/lib/supabase/server";

export default async function ExpansionPage() {
  const profile = await requireCurrentProfile();
  if (!hasExpansionPermission(profile, "expansion.read")) {
    return <div className="page-stack"><PageHeader title="Expansion" description="Your role does not include expansion access." /></div>;
  }

  const supabase = await createClient();
  const report = await getExpansionPortfolio(supabase, profile);

  return (
    <div className="page-stack">
      <PageHeader
        action={<div className="header-actions"><Link className="secondary-button" href="/api/exports/expansion?type=projects">Export</Link><Link className="secondary-button" href="/regions">Regions</Link><Link className="secondary-button" href="/executive/entities">Entities</Link><Link className="primary-button" href="/expansion/portfolio">Portfolio</Link></div>}
        description="Location launch pipeline, territory awareness, readiness, and multi-entity operating views."
        title="Expansion"
      />

      <section className="metric-grid">
        <StatCard detail="Not open or cancelled" label="In Development" value={String(report.summary.projectsInDevelopment)} />
        <StatCard detail="Checklist-based readiness" label="Avg Readiness" value={`${report.summary.averageReadiness}%`} />
        <StatCard detail="Watch, blocker, or overdue" label="At Risk" value={String(report.summary.atRiskProjects)} />
        <StatCard detail="Human review only" label="Territory Overlaps" value={String(report.summary.territoriesWithOverlap)} />
        <StatCard detail="Planning budget" label="Launch Capital" value={formatMoney(report.summary.plannedLaunchBudgetCents)} />
        <StatCard detail="Draft metadata only" label="Mgmt Fees" value={formatMoney(report.summary.managementFeesDraftCents)} />
      </section>

      <section className="panel wide-panel">
        <div className="panel-header"><h2>Pipeline Board</h2><span>Demo launch projects</span></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Project</th><th>Stage</th><th>Region</th><th>Territory</th><th>Readiness</th><th>Target</th><th>Risk</th><th>Budget</th></tr></thead>
            <tbody>
              {report.projects.map((project) => (
                <tr key={project.id}>
                  <td><Link className="strong-link" href={`/expansion/${project.id}`}>{project.name}</Link><br /><span>{project.market}</span></td>
                  <td><StatusBadge status={fromDbStatus(project.stage)} /></td>
                  <td>{project.region}</td>
                  <td>{project.territory}</td>
                  <td>{project.readiness}%<br /><span>{fromDbStatus(project.readinessStatus)}</span></td>
                  <td>{formatDate(project.targetOpenDate)}</td>
                  <td><StatusBadge status={fromDbStatus(project.risk)} /></td>
                  <td>{report.canSeeFinancials ? formatMoney(project.budgetCents) : "Restricted"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Alerts</h2><span>{report.summary.activeAlerts} active</span></div>
          <div className="record-list">
            {report.alerts.slice(0, 6).map((alert) => <article key={alert.id}><strong>{alert.title}</strong><p>{alert.summary}</p><span>{fromDbStatus(alert.severity)}</span></article>)}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Brand Compliance</h2><span>Latest audits</span></div>
          <div className="record-list">
            {report.brandAudits.slice(0, 4).map((audit) => {
              const location = Array.isArray(audit.locations) ? audit.locations[0] : audit.locations;
              return <article key={audit.id}><strong>{location?.name ?? "Location"} - {audit.score}/100</strong><p>{fromDbStatus(audit.status)} on {formatDate(audit.audit_date)}</p></article>;
            })}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Operating Scope</h2><span>Management foundation</span></div>
          <dl className="settings-list">
            <div><dt>Regions</dt><dd>{report.summary.activeRegions}</dd></div>
            <div><dt>Territories</dt><dd>{report.territories.length}</dd></div>
            <div><dt>Entities</dt><dd>{report.summary.activeEntities}</dd></div>
            <div><dt>Average Brand Score</dt><dd>{report.summary.averageBrandScore ?? "N/A"}</dd></div>
          </dl>
        </section>
      </section>
    </div>
  );
}
