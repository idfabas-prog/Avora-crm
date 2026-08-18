import { AiOperatingList, AiSafetyPanel, BriefRefreshButton } from "@/components/crm/AiOperatingPanels";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { APP_DISPLAY_NAME } from "@/lib/config/branding";
import { getSelectedLocationId } from "@/lib/crm/location";
import { assertAiPermission } from "@/lib/ai/permissions";
import { getAiOperatingSummary } from "@/lib/ai/operating-system";
import { createClient } from "@/lib/supabase/server";

export default async function ExecutiveBriefPage() {
  const profile = await requireCurrentProfile();
  assertAiPermission(profile, "ai.operating_brief");
  const selectedLocationId = await getSelectedLocationId(profile);
  const supabase = await createClient();
  const summary = await getAiOperatingSummary(supabase, profile, selectedLocationId);

  return (
    <div className="page-stack">
      <PageHeader
        action={<BriefRefreshButton />}
        description={`Daily AI operating brief for authorized ${APP_DISPLAY_NAME} locations. Advisory-only; no operational action is taken.`}
        title="Executive Brief"
      />
      <section className="dashboard-grid">
        <section className="panel wide-panel">
          <div className="panel-header"><h2>Brief History</h2><span>{summary.briefs.length} visible</span></div>
          <AiOperatingList rows={summary.briefs} empty="No executive or role-specific briefs are visible yet." />
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Top Priorities</h2><span>From recommendations</span></div>
          <AiOperatingList rows={summary.recommendations.slice(0, 5)} empty="No open recommendations are visible." actionKind="recommendation" />
        </section>
      </section>
      <AiSafetyPanel />
    </div>
  );
}
