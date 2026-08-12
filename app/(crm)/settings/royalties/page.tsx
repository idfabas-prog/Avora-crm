import { RoyaltyRuleForm } from "@/components/crm/FinancialForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { assertFinancialPermission } from "@/lib/financial/permissions";
import { previewRoyaltyRule, royaltyPriority } from "@/lib/financial/rule-preview";

export default async function RoyaltySettingsPage() {
  const profile = await requireCurrentProfile();
  assertFinancialPermission(profile, "royalties.manage");
  const supabase = await createClient();
  const [{ data: rules }, { data: services }, { data: packages }] = await Promise.all([
    supabase.from("royalty_rules").select("*, locations(name), services(name), packages(name)").eq("organization_id", profile.organizationId).order("created_at"),
    supabase.from("services").select("id, name").eq("organization_id", profile.organizationId).order("name"),
    supabase.from("packages").select("id, name").eq("organization_id", profile.organizationId).order("name")
  ]);

  return (
    <div className="page-stack">
      <PageHeader description="Configure royalty defaults, exemptions, location overrides, and preview rule outcomes." title="Royalty Settings" />
      <details className="panel"><summary className="summary-action">Create Royalty Rule</summary><RoyaltyRuleForm locations={profile.locations} packages={(packages ?? []).map((pack) => ({ id: pack.id, name: pack.name }))} services={(services ?? []).map((service) => ({ id: service.id, name: service.name }))} /></details>
      <section className="panel">
        <div className="panel-header"><h2>Active Royalty Rule Set</h2><span>Configurable exemptions, not hardcoded</span></div>
        <div className="record-list">{(rules ?? []).map((rule) => {
          const location = Array.isArray(rule.locations) ? rule.locations[0] : rule.locations;
          const service = Array.isArray(rule.services) ? rule.services[0] : rule.services;
          const pack = Array.isArray(rule.packages) ? rule.packages[0] : rule.packages;
          return <article key={rule.id}><strong>{previewRoyaltyRule({ rate: Number(rule.rate), basis: rule.basis }, { location: location?.name, service: service?.name, package: pack?.name, category: rule.category })}</strong><p>Priority {royaltyPriority({ locationId: rule.location_id, serviceId: rule.service_id, packageId: rule.package_id, category: rule.category })} · {rule.basis}</p><StatusBadge status={rule.active ? "Active" : "Inactive"} /></article>;
        })}</div>
      </section>
    </div>
  );
}
