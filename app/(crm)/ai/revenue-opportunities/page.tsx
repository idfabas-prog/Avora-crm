import { AiOperatingList } from "@/components/crm/AiOperatingPanels";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { getSelectedLocationId } from "@/lib/crm/location";
import { assertAiPermission } from "@/lib/ai/permissions";
import { getAiOperatingSummary } from "@/lib/ai/operating-system";
import { createClient } from "@/lib/supabase/server";

export default async function RevenueOpportunitiesPage() {
  const profile = await requireCurrentProfile();
  assertAiPermission(profile, "ai.predictions.read");
  const selectedLocationId = await getSelectedLocationId(profile);
  const supabase = await createClient();
  const summary = await getAiOperatingSummary(supabase, profile, selectedLocationId);
  const rows = [
    ...summary.predictions.filter((row) => row.title.includes("lead conversion") || row.title.includes("revenue opportunity")),
    ...summary.recommendations.filter((row) => row.title.toLowerCase().includes("revenue") || row.title.toLowerCase().includes("follow-up") || row.title.toLowerCase().includes("follow up"))
  ];

  return (
    <div className="page-stack">
      <PageHeader
        description="Revenue opportunity scoring and next-best-action suggestions for authorized users."
        title="Revenue Opportunities"
      />
      <section className="panel wide-panel">
        <div className="panel-header"><h2>Opportunities</h2><span>{rows.length} visible</span></div>
        <AiOperatingList rows={rows} empty="No revenue opportunities are visible." />
      </section>
    </div>
  );
}
