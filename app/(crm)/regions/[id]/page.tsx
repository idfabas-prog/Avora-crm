import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { fromDbStatus, formatDate } from "@/lib/crm/constants";
import { getExpansionPortfolio, getRegionalPerformance } from "@/lib/expansion/reports";
import { createClient } from "@/lib/supabase/server";

export default async function RegionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const [regions, portfolio] = await Promise.all([
    getRegionalPerformance(supabase, profile, id),
    getExpansionPortfolio(supabase, profile)
  ]);
  const region = regions[0];
  const projects = portfolio.projects.filter((project) => project.region === region?.name);

  return (
    <div className="page-stack">
      <PageHeader
        action={<Link className="secondary-button" href="/regions">All Regions</Link>}
        description="Regional expansion, territory, readiness, and brand-compliance view."
        title={region?.name ?? "Region"}
      />
      <section className="metric-grid">
        <StatCard detail="Expansion projects" label="Projects" value={String(region?.projectCount ?? 0)} />
        <StatCard detail="Average project readiness" label="Readiness" value={`${region?.averageReadiness ?? 0}%`} />
        <StatCard detail="Watch or important" label="At Risk" value={String(region?.atRiskProjects ?? 0)} />
        <StatCard detail="Mapped territory rows" label="Territories" value={String(portfolio.territories.filter((territory) => territory.region_id === id).length)} />
      </section>
      <section className="panel wide-panel">
        <div className="panel-header"><h2>Projects</h2><span>Assigned to this region</span></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Project</th><th>Stage</th><th>Territory</th><th>Readiness</th><th>Target</th><th>Risk</th></tr></thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id}>
                  <td><Link className="strong-link" href={`/expansion/${project.id}`}>{project.name}</Link></td>
                  <td>{fromDbStatus(project.stage)}</td>
                  <td>{project.territory}</td>
                  <td>{project.readiness}%</td>
                  <td>{formatDate(project.targetOpenDate)}</td>
                  <td><StatusBadge status={fromDbStatus(project.risk)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
