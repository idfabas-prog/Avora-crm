import Link from "next/link";
import { AiOperatingList, AiSafetyPanel, BriefRefreshButton } from "@/components/crm/AiOperatingPanels";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { getSelectedLocationId } from "@/lib/crm/location";
import { assertAiPermission } from "@/lib/ai/permissions";
import { getAiOperatingSummary } from "@/lib/ai/operating-system";
import { createClient } from "@/lib/supabase/server";

export default async function AiOperatingSystemPage() {
  const profile = await requireCurrentProfile();
  assertAiPermission(profile, "ai.operating_brief");
  const selectedLocationId = await getSelectedLocationId(profile);
  const supabase = await createClient();
  const summary = await getAiOperatingSummary(supabase, profile, selectedLocationId);

  return (
    <div className="page-stack">
      <PageHeader
        action={<BriefRefreshButton />}
        description="Daily priorities, proactive insights, predictions, forecasts, and next-best-action recommendations."
        title="AI Operating System"
      />

      <section className="settings-nav" aria-label="AI operating views">
        <Link href="/executive/brief">Executive Brief</Link>
        <Link href="/ai/insights">Insights</Link>
        <Link href="/ai/risk/no-shows">No-Show Risk</Link>
        <Link href="/ai/risk/churn">Churn Risk</Link>
        <Link href="/ai/collections">Collections</Link>
        <Link href="/ai/revenue-opportunities">Revenue Opportunities</Link>
      </section>

      <section className="metric-grid">
        <StatCard detail="Visible in scope" label="Briefs" value={String(summary.briefs.length)} />
        <StatCard detail="Active or acknowledged" label="Insights" value={String(summary.insights.length)} />
        <StatCard detail="Explainable scores" label="Predictions" value={String(summary.predictions.length)} />
        <StatCard detail="Open or pending" label="Recommendations" value={String(summary.recommendations.length)} />
      </section>

      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Today&apos;s Briefs</h2><span>Read-only</span></div>
          <AiOperatingList rows={summary.briefs.slice(0, 4)} empty="No operating briefs are visible yet." />
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Needs Attention</h2><span>Proactive</span></div>
          <AiOperatingList rows={summary.insights.slice(0, 6)} empty="No active insights are visible." actionKind="insight" />
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Next Best Actions</h2><span>Human approval required</span></div>
          <AiOperatingList rows={summary.recommendations.slice(0, 6)} empty="No recommendations are visible." actionKind="recommendation" />
        </section>
      </section>

      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Predictive Scores</h2><span>Deterministic</span></div>
          <AiOperatingList rows={summary.predictions.slice(0, 8)} empty="No predictive scores are visible." />
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Forecasts</h2><span>Confidence labeled</span></div>
          <AiOperatingList rows={summary.forecasts.slice(0, 8)} empty="No forecasts are visible." />
        </section>
        <AiSafetyPanel />
      </section>
    </div>
  );
}
