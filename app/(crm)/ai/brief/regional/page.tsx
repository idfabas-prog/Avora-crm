import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { AI_ASSISTANT_DISPLAY_NAME } from "@/lib/config/branding";
import { getExpansionPortfolio, getRegionalPerformance } from "@/lib/expansion/reports";
import { createClient } from "@/lib/supabase/server";

export default async function RegionalAiBriefPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const [regions, portfolio] = await Promise.all([
    getRegionalPerformance(supabase, profile),
    getExpansionPortfolio(supabase, profile)
  ]);
  const strongest = [...regions].sort((a, b) => b.averageReadiness - a.averageReadiness)[0];
  const weakest = [...regions].sort((a, b) => a.averageReadiness - b.averageReadiness)[0];
  const topAlerts = portfolio.alerts.filter((alert) => alert.status !== "resolved").slice(0, 5);

  return (
    <div className="page-stack">
      <PageHeader
        action={<Link className="primary-button" href="/ai">{AI_ASSISTANT_DISPLAY_NAME}</Link>}
        description="Read-only regional operating brief based on expansion, territory, brand, and readiness records."
        title="Regional AI Brief"
      />
      <section className="metric-grid">
        <StatCard detail="Highest readiness" label="Strongest Region" value={strongest?.name ?? "N/A"} />
        <StatCard detail="Needs attention" label="Weakest Region" value={weakest?.name ?? "N/A"} />
        <StatCard detail="Active expansion alerts" label="Alerts" value={String(topAlerts.length)} />
        <StatCard detail="Portfolio readiness" label="Average" value={`${portfolio.summary.averageReadiness}%`} />
      </section>
      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Regional Trends</h2><span>Deterministic</span></div>
          <div className="record-list">
            {regions.map((region) => <article key={region.id}><strong>{region.name}</strong><p>{region.projectCount} projects, {region.averageReadiness}% readiness, {region.atRiskProjects} at risk.</p></article>)}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Top Priorities</h2><span>Advisory only</span></div>
          <div className="record-list">
            {topAlerts.map((alert) => <article key={alert.id}><strong>{alert.title}</strong><p>{alert.summary}</p></article>)}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Prompt Ideas</h2><span>{AI_ASSISTANT_DISPLAY_NAME}</span></div>
          <div className="record-list">
            <article><strong>Which expansion is most at risk?</strong><p>Uses readiness, alerts, blockers, and launch timing.</p></article>
            <article><strong>Which proposed site looks stronger?</strong><p>Uses rent, visibility, parking, territory fit, and overlap signals.</p></article>
            <article><strong>Which region is performing best?</strong><p>Uses regional expansion readiness and alerts.</p></article>
          </div>
        </section>
      </section>
    </div>
  );
}
