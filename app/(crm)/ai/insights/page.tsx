import { AiOperatingList } from "@/components/crm/AiOperatingPanels";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { APP_DISPLAY_NAME } from "@/lib/config/branding";
import { getSelectedLocationId } from "@/lib/crm/location";
import { assertAiPermission } from "@/lib/ai/permissions";
import { getAiOperatingSummary } from "@/lib/ai/operating-system";
import { createClient } from "@/lib/supabase/server";

export default async function AiInsightsPage() {
  const profile = await requireCurrentProfile();
  assertAiPermission(profile, "ai.proactive_insights");
  const selectedLocationId = await getSelectedLocationId(profile);
  const supabase = await createClient();
  const summary = await getAiOperatingSummary(supabase, profile, selectedLocationId);

  return (
    <div className="page-stack">
      <PageHeader
        description={`Proactive ${APP_DISPLAY_NAME} CRM insight history with confidence, severity, and explainable evidence.`}
        title="AI Insights"
      />
      <section className="panel wide-panel">
        <div className="panel-header"><h2>Active Insight History</h2><span>{summary.insights.length} visible</span></div>
        <AiOperatingList rows={summary.insights} empty="No active Phase 16 insights are visible." actionKind="insight" />
      </section>
    </div>
  );
}
