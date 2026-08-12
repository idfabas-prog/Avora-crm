import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ServiceForm, ServiceOverrideForm } from "@/components/crm/FinancialForms";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { assertFinancialPermission } from "@/lib/financial/permissions";
import { formatMoney } from "@/lib/financial/money";

export default async function ServicesSettingsPage() {
  const profile = await requireCurrentProfile();
  assertFinancialPermission(profile, "services.manage");
  const supabase = await createClient();
  const [{ data: services }, { data: overrides }] = await Promise.all([
    supabase.from("services").select("*").eq("organization_id", profile.organizationId).order("category").order("name"),
    supabase.from("location_service_settings").select("id, location_id, service_id, price_cents, active, commission_eligible, royalty_eligible, locations(name), services(name)").eq("organization_id", profile.organizationId)
  ]);

  const serviceOptions = (services ?? []).map((service) => ({ id: service.id, name: service.name }));

  return (
    <div className="page-stack">
      <PageHeader description="Manage base service catalog and location-specific overrides without touching SQL." title="Services" />
      <details className="panel"><summary className="summary-action">Create Service</summary><ServiceForm /></details>
      <details className="panel"><summary className="summary-action">Add Location Override</summary><ServiceOverrideForm locations={profile.locations} services={serviceOptions} /></details>
      <section className="panel">
        <div className="panel-header"><h2>Service Catalog</h2><span>{services?.length ?? 0} services</span></div>
        <table className="data-table">
          <thead><tr><th>Name</th><th>Category</th><th>Default Price</th><th>Commission</th><th>Royalty</th><th>Status</th><th>Edit</th></tr></thead>
          <tbody>{(services ?? []).map((service) => (
            <tr key={service.id}>
              <td><strong>{service.name}</strong><span>{service.description}</span></td>
              <td>{service.category}</td>
              <td>{formatMoney(service.default_price_cents)}</td>
              <td>{service.commission_eligible ? `${Number(service.default_commission_rate ?? 0) * 100}%` : "No"}</td>
              <td>{service.royalty_eligible ? `${Number(service.default_royalty_rate ?? 0) * 100}%` : "No"}</td>
              <td><StatusBadge status={service.active ? "Active" : "Inactive"} /></td>
              <td><details><summary className="summary-action">Edit</summary><ServiceForm service={service} /></details></td>
            </tr>
          ))}</tbody>
        </table>
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Location Overrides</h2><span>Base services stay shared</span></div>
        <div className="record-list">{(overrides ?? []).map((override) => {
          const location = Array.isArray(override.locations) ? override.locations[0] : override.locations;
          const service = Array.isArray(override.services) ? override.services[0] : override.services;
          return <article key={override.id}><strong>{service?.name} · {location?.name}</strong><p>{override.price_cents == null ? "Base price" : formatMoney(override.price_cents)} · {override.active ? "available" : "inactive"}</p><span>Commission {override.commission_eligible ? "yes" : "no"} · Royalty {override.royalty_eligible ? "yes" : "no"}</span></article>;
        })}</div>
      </section>
    </div>
  );
}
