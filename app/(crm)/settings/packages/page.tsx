import { PackageForm, PackageItemForm, RemovePackageItemForm } from "@/components/crm/FinancialForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { assertFinancialPermission } from "@/lib/financial/permissions";
import { formatMoney } from "@/lib/financial/money";

export default async function PackagesSettingsPage() {
  const profile = await requireCurrentProfile();
  assertFinancialPermission(profile, "services.manage");
  const supabase = await createClient();
  const [{ data: packages }, { data: services }, { data: items }] = await Promise.all([
    supabase.from("packages").select("*").eq("organization_id", profile.organizationId).order("name"),
    supabase.from("services").select("id, name, active").eq("organization_id", profile.organizationId).order("name"),
    supabase.from("package_items").select("package_id, service_id, quantity, unit_value_cents, packages(name), services(name, active)")
  ]);
  const packageOptions = (packages ?? []).map((pack) => ({ id: pack.id, name: pack.name }));
  const serviceOptions = (services ?? []).map((service) => ({ id: service.id, name: `${service.name}${service.active ? "" : " (inactive)"}` }));

  return (
    <div className="page-stack">
      <PageHeader description="Manage package pricing and included services with positive-quantity validation." title="Packages" />
      <section className="dashboard-grid">
        <details className="panel"><summary className="summary-action">Create Package</summary><PackageForm /></details>
        <details className="panel"><summary className="summary-action">Add / Update Package Item</summary><PackageItemForm packages={packageOptions} services={serviceOptions} /></details>
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Packages</h2><span>{packages?.length ?? 0} configured</span></div>
        <div className="record-list">{(packages ?? []).map((pack) => (
          <article key={pack.id}>
            <strong>{pack.name}</strong>
            <p>{formatMoney(pack.package_price_cents)} · {pack.description}</p>
            <StatusBadge status={pack.active ? "Active" : "Inactive"} />
            <details><summary className="summary-action">Edit</summary><PackageForm pack={pack} /></details>
            <div className="record-list">{(items ?? []).filter((item) => item.package_id === pack.id).map((item) => {
              const service = Array.isArray(item.services) ? item.services[0] : item.services;
              return <article key={`${item.package_id}-${item.service_id}`}><strong>{service?.name}</strong><p>Quantity {item.quantity} · unit value {formatMoney(item.unit_value_cents)}{service?.active ? "" : " · inactive service"}</p><RemovePackageItemForm packageId={item.package_id} serviceId={item.service_id} /></article>;
            })}</div>
          </article>
        ))}</div>
      </section>
    </div>
  );
}
