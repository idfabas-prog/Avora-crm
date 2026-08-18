import { AiOperatingList } from "@/components/crm/AiOperatingPanels";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { getSelectedLocationId } from "@/lib/crm/location";
import { assertAiPermission } from "@/lib/ai/permissions";
import { getAiOperatingSummary } from "@/lib/ai/operating-system";
import { createClient } from "@/lib/supabase/server";

export default async function AiCollectionsPage() {
  const profile = await requireCurrentProfile();
  assertAiPermission(profile, "ai.collections.read");
  const selectedLocationId = await getSelectedLocationId(profile);
  const supabase = await createClient();
  const summary = await getAiOperatingSummary(supabase, profile, selectedLocationId);
  const rows = [
    ...summary.predictions.filter((row) => row.title.includes("collection")),
    ...summary.recommendations.filter((row) => row.title.toLowerCase().includes("balance") || row.title.toLowerCase().includes("collection"))
  ];

  return (
    <div className="page-stack">
      <PageHeader
        description="Collections prioritization is advisory only. AI cannot charge cards, request payment, or alter balances."
        title="AI Collections"
      />
      <section className="panel wide-panel">
        <div className="panel-header"><h2>Review Queue</h2><span>{rows.length} visible</span></div>
        <AiOperatingList rows={rows} empty="No collections priorities are visible." />
      </section>
    </div>
  );
}
