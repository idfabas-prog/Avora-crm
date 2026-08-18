import { PortalSettingsForm } from "@/components/crm/PortalForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { hasPortalPermission } from "@/lib/portal/permissions";
import { createClient } from "@/lib/supabase/server";

export default async function PortalSettingsPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const { data: settings } = await supabase.from("portal_settings").select("*").eq("organization_id", profile.organizationId).maybeSingle();
  const { data: accounts } = await supabase.from("patient_accounts").select("id, status, last_login_at").eq("organization_id", profile.organizationId);

  if (!hasPortalPermission(profile, "portal.read")) {
    return <div className="page-stack"><PageHeader title="Portal Settings" description="Portal settings are restricted." /></div>;
  }

  return (
    <div className="page-stack">
      <PageHeader description="Patient-facing portal controls. Secrets and live billing controls are not shown here." title="Portal Settings" />
      <section className="metric-grid">
        <article className="stat-card"><span>Invited</span><strong>{accounts?.filter((account) => account.status === "invited").length ?? 0}</strong><p>Pending activation</p></article>
        <article className="stat-card"><span>Active</span><strong>{accounts?.filter((account) => account.status === "active").length ?? 0}</strong><p>Activated accounts</p></article>
        <article className="stat-card"><span>Disabled</span><strong>{accounts?.filter((account) => account.status === "disabled").length ?? 0}</strong><p>Access disabled</p></article>
        <article className="stat-card"><span>Mode</span><strong>{settings?.development_mode === false ? "Live Ready" : "Development"}</strong><p>Billing safety mode</p></article>
      </section>
      {hasPortalPermission(profile, "portal.settings.manage") ? (
        <section className="panel"><div className="panel-header"><h2>Configuration</h2><span>Development-safe by default</span></div><PortalSettingsForm settings={settings ?? undefined} /></section>
      ) : null}
    </div>
  );
}
