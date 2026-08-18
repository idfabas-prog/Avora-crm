import { AiOperatingList, BriefRefreshButton } from "@/components/crm/AiOperatingPanels";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { APP_DISPLAY_NAME } from "@/lib/config/branding";
import { getSelectedLocationId } from "@/lib/crm/location";
import { assertAiPermission } from "@/lib/ai/permissions";
import { getAiOperatingSummary } from "@/lib/ai/operating-system";
import { createClient } from "@/lib/supabase/server";

export default async function ManagerBriefPage() {
  const profile = await requireCurrentProfile();
  assertAiPermission(profile, "ai.operating_brief");
  const selectedLocationId = await getSelectedLocationId(profile);
  const supabase = await createClient();
  const summary = await getAiOperatingSummary(supabase, profile, selectedLocationId);
  const rows = summary.briefs.filter((row) => row.title.toLowerCase().includes("manager") || profile.role === "manager");

  return (
    <div className="page-stack">
      <PageHeader
        action={<BriefRefreshButton />}
        description={`Manager-focused daily brief for allowed ${APP_DISPLAY_NAME} locations.`}
        title="Manager AI Brief"
      />
      <section className="panel wide-panel">
        <div className="panel-header"><h2>Manager Briefs</h2><span>{rows.length} visible</span></div>
        <AiOperatingList rows={rows} empty="No manager brief is visible." />
      </section>
    </div>
  );
}
