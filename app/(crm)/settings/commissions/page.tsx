import { CommissionAdjustmentForm, CommissionRuleForm } from "@/components/crm/FinancialForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { assertFinancialPermission } from "@/lib/financial/permissions";
import { commissionPriority, findCommissionConflicts, previewCommissionRule } from "@/lib/financial/rule-preview";
import { formatMoney } from "@/lib/financial/money";

export default async function CommissionSettingsPage() {
  const profile = await requireCurrentProfile();
  assertFinancialPermission(profile, "commissions.manage");
  const supabase = await createClient();
  const [{ data: rules }, { data: users }, { data: services }, { data: packages }, { data: sales }, { data: payments }] = await Promise.all([
    supabase.from("commission_rules").select("*, user_profiles(full_name), locations(name), services(name), packages(name)").eq("organization_id", profile.organizationId).order("created_at"),
    supabase.from("user_profiles").select("id, full_name").eq("organization_id", profile.organizationId).order("full_name"),
    supabase.from("services").select("id, name").eq("organization_id", profile.organizationId).order("name"),
    supabase.from("packages").select("id, name").eq("organization_id", profile.organizationId).order("name"),
    supabase.from("sales").select("id, total_amount_cents, contacts(first_name, last_name)").eq("organization_id", profile.organizationId).limit(50),
    supabase.from("payments").select("id, amount_cents, sales(id)").eq("organization_id", profile.organizationId).limit(50)
  ]);
  const simpleUsers = (users ?? []).map((user) => ({ id: user.id, name: user.full_name }));
  const simpleServices = (services ?? []).map((service) => ({ id: service.id, name: service.name }));
  const simplePackages = (packages ?? []).map((pack) => ({ id: pack.id, name: pack.name }));
  const simpleSales = (sales ?? []).map((sale) => {
    const contact = Array.isArray(sale.contacts) ? sale.contacts[0] : sale.contacts;
    return { id: sale.id, name: `${contact?.first_name ?? "Sale"} ${contact?.last_name ?? ""} · ${formatMoney(sale.total_amount_cents)}` };
  });
  const simplePayments = (payments ?? []).map((payment) => ({ id: payment.id, name: formatMoney(payment.amount_cents) }));

  return (
    <div className="page-stack">
      <PageHeader description="Manage commission precedence, preview outcomes, and create controlled ledger adjustments." title="Commission Settings" />
      <section className="dashboard-grid">
        <details className="panel"><summary className="summary-action">Create Commission Rule</summary><CommissionRuleForm locations={profile.locations} packages={simplePackages} services={simpleServices} users={simpleUsers} /></details>
        <details className="panel"><summary className="summary-action">Manual Commission Adjustment</summary><CommissionAdjustmentForm locations={profile.locations} payments={simplePayments} sales={simpleSales} users={simpleUsers} /></details>
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Rule Precedence</h2><span>Lower priority number wins</span></div>
        <div className="record-list">{(rules ?? []).map((rule) => {
          const user = Array.isArray(rule.user_profiles) ? rule.user_profiles[0] : rule.user_profiles;
          const location = Array.isArray(rule.locations) ? rule.locations[0] : rule.locations;
          const service = Array.isArray(rule.services) ? rule.services[0] : rule.services;
          const pack = Array.isArray(rule.packages) ? rule.packages[0] : rule.packages;
          const conflicts = findCommissionConflicts({
            id: rule.id,
            userId: rule.user_id,
            locationId: rule.location_id,
            serviceId: rule.service_id,
            packageId: rule.package_id,
            category: rule.category,
            active: rule.active,
            effectiveStartDate: rule.effective_start_date,
            effectiveEndDate: rule.effective_end_date
          }, (rules ?? []).map((item) => ({ id: item.id, userId: item.user_id, locationId: item.location_id, serviceId: item.service_id, packageId: item.package_id, category: item.category, active: item.active, effectiveStartDate: item.effective_start_date, effectiveEndDate: item.effective_end_date })));
          return <article key={rule.id}><strong>{previewCommissionRule({ commissionType: rule.commission_type, rate: Number(rule.rate), basis: rule.basis }, { employee: user?.full_name, location: location?.name, service: service?.name, package: pack?.name, category: rule.category })}</strong><p>Priority {commissionPriority({ userId: rule.user_id, locationId: rule.location_id, serviceId: rule.service_id, packageId: rule.package_id, category: rule.category })} · {rule.basis} · {(Number(rule.rate) * 100).toFixed(2)}%</p><StatusBadge status={rule.active ? "Active" : "Inactive"} />{conflicts.length ? <p className="form-error">Warning: overlaps {conflicts.length} active rule at the same priority.</p> : null}</article>;
        })}</div>
      </section>
    </div>
  );
}
