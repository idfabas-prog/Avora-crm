import { AiOperatingList } from "@/components/crm/AiOperatingPanels";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { getSelectedLocationId } from "@/lib/crm/location";
import { assertAiPermission } from "@/lib/ai/permissions";
import { getAiOperatingSummary } from "@/lib/ai/operating-system";
import { createClient } from "@/lib/supabase/server";

export default async function ChurnRiskPage() {
  const profile = await requireCurrentProfile();
  assertAiPermission(profile, "ai.risk.read");
  const selectedLocationId = await getSelectedLocationId(profile);
  const supabase = await createClient();
  const summary = await getAiOperatingSummary(supabase, profile, selectedLocationId);
  const rows = summary.predictions.filter((row) => row.title.includes("churn") || row.title.includes("reactivation"));

  return (
    <div className="page-stack">
      <PageHeader
        description="Fictional/demo churn and reactivation risk scores. Outreach remains manual and suppression-aware."
        title="Churn Risk"
      />
      <section className="panel wide-panel">
        <div className="panel-header"><h2>Retention Scores</h2><span>{rows.length} visible</span></div>
        <AiOperatingList rows={rows} empty="No churn or reactivation scores are visible." />
      </section>
    </div>
  );
}
