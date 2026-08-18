import { MembershipPlanForm } from "@/components/crm/PortalForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatMoney } from "@/lib/financial/money";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { hasPortalPermission } from "@/lib/portal/permissions";
import { createClient } from "@/lib/supabase/server";
import { fromDbStatus } from "@/lib/crm/constants";

export default async function MembershipSettingsPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const [{ data: plans }, { data: memberships }, { data: paymentPlans }] = await Promise.all([
    supabase.from("membership_plans").select("*").eq("organization_id", profile.organizationId).order("name"),
    supabase.from("patient_memberships").select("id, status, billing_status, membership_plans(name)").eq("organization_id", profile.organizationId),
    supabase.from("payment_plans").select("id, status, total_amount_cents").eq("organization_id", profile.organizationId)
  ]);

  if (!hasPortalPermission(profile, "memberships.read")) {
    return <div className="page-stack"><PageHeader title="Memberships" description="Membership settings are restricted." /></div>;
  }

  return (
    <div className="page-stack">
      <PageHeader description="Recurring-revenue foundation for memberships and payment plans." title="Memberships" />
      <section className="metric-grid">
        <article className="stat-card"><span>Plans</span><strong>{plans?.length ?? 0}</strong><p>Configured plans</p></article>
        <article className="stat-card"><span>Active Memberships</span><strong>{memberships?.filter((item) => item.status === "active").length ?? 0}</strong><p>Simulated or test-mode</p></article>
        <article className="stat-card"><span>Payment Plans</span><strong>{paymentPlans?.length ?? 0}</strong><p>Installment schedules</p></article>
        <article className="stat-card"><span>Plan Balance</span><strong>{formatMoney(paymentPlans?.reduce((sum, plan) => sum + plan.total_amount_cents, 0) ?? 0)}</strong><p>Original plan totals</p></article>
      </section>
      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Membership Plans</h2><span>{plans?.length ?? 0} plans</span></div>
          <div className="record-list">
            {(plans ?? []).map((plan) => <article key={plan.id}><strong>{plan.name}</strong><p>{formatMoney(plan.price_cents)} · {fromDbStatus(plan.billing_interval)} · {plan.active ? "Active" : "Inactive"}</p><span>{plan.stripe_price_id ?? "No Stripe price mapped"}</span></article>)}
          </div>
        </section>
        {hasPortalPermission(profile, "memberships.manage") ? (
          <section className="panel"><div className="panel-header"><h2>Create Plan</h2><span>Structured benefits JSON</span></div><MembershipPlanForm /></section>
        ) : null}
      </section>
    </div>
  );
}
