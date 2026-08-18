import { AiOperatingList } from "@/components/crm/AiOperatingPanels";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { getSelectedLocationId } from "@/lib/crm/location";
import { assertAiPermission } from "@/lib/ai/permissions";
import { getAiOperatingSummary } from "@/lib/ai/operating-system";
import { createClient } from "@/lib/supabase/server";

export default async function NoShowRiskPage() {
  const profile = await requireCurrentProfile();
  assertAiPermission(profile, "ai.risk.read");
  const selectedLocationId = await getSelectedLocationId(profile);
  const supabase = await createClient();
  const summary = await getAiOperatingSummary(supabase, profile, selectedLocationId);
  const rows = summary.predictions.filter((row) => row.title.includes("no show") || row.title.includes("no-show"));

  return (
    <div className="page-stack">
      <PageHeader
        description="Explainable no-show risk worklist for authorized locations. Staff must approve any reminder or outreach."
        title="No-Show Risk"
      />
      <section className="panel wide-panel">
        <div className="panel-header"><h2>Risk Scores</h2><span>{rows.length} visible</span></div>
        <AiOperatingList rows={rows} empty="No no-show risk scores are visible." />
      </section>
    </div>
  );
}
