import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { getRegionalPerformance } from "@/lib/expansion/reports";
import { createClient } from "@/lib/supabase/server";

export default async function RegionsPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const regions = await getRegionalPerformance(supabase, profile);

  return (
    <div className="page-stack">
      <PageHeader
        action={<Link className="secondary-button" href="/ai/brief/regional">Regional AI Brief</Link>}
        description="Regional management view across assigned regions and authorized locations."
        title="Regions"
      />
      <section className="metric-grid">
        <StatCard detail="Active or seeded" label="Regions" value={String(regions.length)} />
        <StatCard detail="Expansion projects" label="Projects" value={String(regions.reduce((sum, region) => sum + region.projectCount, 0))} />
        <StatCard detail="Average across regions" label="Readiness" value={`${regions.length ? Math.round(regions.reduce((sum, region) => sum + region.averageReadiness, 0) / regions.length) : 0}%`} />
        <StatCard detail="Needs attention" label="At Risk" value={String(regions.reduce((sum, region) => sum + region.atRiskProjects, 0))} />
      </section>
      <section className="panel wide-panel">
        <div className="panel-header"><h2>Regional Scorecards</h2><span>Expansion readiness foundation</span></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Region</th><th>Code</th><th>Projects</th><th>Avg Readiness</th><th>At Risk</th></tr></thead>
            <tbody>
              {regions.map((region) => (
                <tr key={region.id}>
                  <td><Link className="strong-link" href={`/regions/${region.id}`}>{region.name}</Link></td>
                  <td>{region.code ?? "-"}</td>
                  <td>{region.projectCount}</td>
                  <td>{region.averageReadiness}%</td>
                  <td>{region.atRiskProjects}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
