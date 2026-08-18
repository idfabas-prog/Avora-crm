import Link from "next/link";
import { WorkforceSettingsForm } from "@/components/crm/WorkforceForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { hasWorkforcePermission } from "@/lib/workforce/permissions";

export default async function WorkforceSettingsPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();

  if (!hasWorkforcePermission(profile, "workforce.settings.manage")) {
    return <div className="page-stack"><PageHeader description="Your current role does not include workforce settings access." title="Workforce Settings" /></div>;
  }

  const [{ data: settings }, { count: employees }, { count: templates }, { count: policies }] = await Promise.all([
    supabase.from("workforce_settings").select("*").eq("organization_id", profile.organizationId).maybeSingle(),
    supabase.from("employment_profiles").select("id", { count: "exact", head: true }).eq("organization_id", profile.organizationId),
    supabase.from("shift_templates").select("id", { count: "exact", head: true }).eq("organization_id", profile.organizationId),
    supabase.from("pto_policies").select("id", { count: "exact", head: true }).eq("organization_id", profile.organizationId)
  ]);

  return (
    <div className="page-stack">
      <PageHeader
        action={<div className="header-actions"><Link className="secondary-button" href="/settings/workforce/employees">Employees</Link><Link className="secondary-button" href="/settings/workforce/shift-templates">Shift Templates</Link><Link className="secondary-button" href="/settings/workforce/pto">PTO</Link><Link className="primary-button" href="/staff">Staff</Link></div>}
        description="Configuration for scheduling, time clock rules, PTO, and payroll-support exports."
        title="Workforce Settings"
      />
      <section className="metric-grid">
        <StatCard detail="Employment profile rows" label="Employees" value={String(employees ?? 0)} />
        <StatCard detail="Reusable shifts" label="Templates" value={String(templates ?? 0)} />
        <StatCard detail="Time-off policy rows" label="PTO Policies" value={String(policies ?? 0)} />
        <StatCard detail="Not a payroll processor" label="Payroll Mode" value="Support Only" />
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Settings</h2><span>Organization defaults</span></div>
        <WorkforceSettingsForm settings={settings as Record<string, string | number | boolean | null> | null} />
      </section>
    </div>
  );
}
