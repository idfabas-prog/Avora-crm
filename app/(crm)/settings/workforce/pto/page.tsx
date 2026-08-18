import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { hasWorkforcePermission } from "@/lib/workforce/permissions";

function hours(minutes: number | null | undefined) {
  return `${(Number(minutes ?? 0) / 60).toFixed(1)}h`;
}

export default async function WorkforcePTOSettingsPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();

  if (!hasWorkforcePermission(profile, "workforce.pto.manage")) {
    return <div className="page-stack"><PageHeader description="Your current role does not include PTO management access." title="PTO Settings" /></div>;
  }

  const [{ data: policies }, { data: holidays }] = await Promise.all([
    supabase.from("pto_policies").select("id, name, accrual_type, annual_grant_minutes, carryover_limit_minutes, active").eq("organization_id", profile.organizationId).order("name"),
    supabase.from("organization_holidays").select("id, name, holiday_date, paid, locations(name)").eq("organization_id", profile.organizationId).order("holiday_date")
  ]);

  return (
    <div className="page-stack">
      <PageHeader description="PTO and holiday configuration seeded for development workflows." title="PTO Settings" />
      <section className="metric-grid">
        <StatCard detail="Active rows" label="Policies" value={String(policies?.filter((policy) => policy.active).length ?? 0)} />
        <StatCard detail="Configured dates" label="Holidays" value={String(holidays?.length ?? 0)} />
      </section>
      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>PTO Policies</h2><span>Current configured policies</span></div>
          <div className="record-list">{(policies ?? []).map((policy) => <article key={policy.id}><strong>{policy.name} - <StatusBadge status={policy.active ? "Active" : "Inactive"} /></strong><p>{policy.accrual_type} - annual {hours(policy.annual_grant_minutes)} - carryover {hours(policy.carryover_limit_minutes)}</p></article>)}</div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Holidays</h2><span>Organization calendar</span></div>
          <div className="record-list">{(holidays ?? []).map((holiday) => <article key={holiday.id}><strong>{holiday.name}</strong><p>{holiday.holiday_date} - {holiday.paid ? "Paid" : "Unpaid"}</p></article>)}</div>
        </section>
      </section>
    </div>
  );
}
