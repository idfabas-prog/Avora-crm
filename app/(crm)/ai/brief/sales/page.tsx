import { AiOperatingList, BriefRefreshButton } from "@/components/crm/AiOperatingPanels";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { getSelectedLocationId } from "@/lib/crm/location";
import { assertAiPermission } from "@/lib/ai/permissions";
import { getAiOperatingSummary } from "@/lib/ai/operating-system";
import { createClient } from "@/lib/supabase/server";

export default async function SalesBriefPage() {
  const profile = await requireCurrentProfile();
  assertAiPermission(profile, "ai.operating_brief");
  const selectedLocationId = await getSelectedLocationId(profile);
  const supabase = await createClient();
  const summary = await getAiOperatingSummary(supabase, profile, selectedLocationId);
  const rows = summary.briefs.filter((row) => row.title.toLowerCase().includes("sales") || profile.role === "salesperson");

  return (
    <div className="page-stack">
      <PageHeader
        action={<BriefRefreshButton />}
        description="Sales-focused daily brief with follow-up priorities visible to the current user."
        title="Sales AI Brief"
      />
      <section className="panel wide-panel">
        <div className="panel-header"><h2>Sales Briefs</h2><span>{rows.length} visible</span></div>
        <AiOperatingList rows={rows} empty="No sales brief is visible." />
      </section>
    </div>
  );
}
