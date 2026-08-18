import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { fromDbStatus, formatDate } from "@/lib/crm/constants";
import { getExpansionPortfolio } from "@/lib/expansion/reports";
import { formatMoney } from "@/lib/financial/money";
import { createClient } from "@/lib/supabase/server";

export default async function ExpansionPortfolioPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const report = await getExpansionPortfolio(supabase, profile);

  return (
    <div className="page-stack">
      <PageHeader
        action={<Link className="secondary-button" href="/expansion">Back to Expansion</Link>}
        description="Portfolio timeline, target open dates, readiness, stage, budget, and risk for every active demo project."
        title="Expansion Portfolio"
      />
      <section className="panel wide-panel">
        <div className="panel-header"><h2>Roadmap</h2><span>Chronological launch view</span></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Target</th><th>Project</th><th>Stage</th><th>Owner</th><th>Preferred Site</th><th>Readiness</th><th>Open Issues</th><th>Budget</th></tr></thead>
            <tbody>
              {report.projects.map((project) => (
                <tr key={project.id}>
                  <td>{formatDate(project.targetOpenDate)}</td>
                  <td><Link className="strong-link" href={`/expansion/${project.id}`}>{project.name}</Link><br /><span>{project.type.replaceAll("_", " ")}</span></td>
                  <td><StatusBadge status={fromDbStatus(project.stage)} /></td>
                  <td>{project.owner}</td>
                  <td>{project.preferredSite ?? "No preferred site"}</td>
                  <td>{project.readiness}%</td>
                  <td>{project.blockers.length + project.overdueCount}</td>
                  <td>{report.canSeeFinancials ? formatMoney(project.budgetCents) : "Restricted"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
