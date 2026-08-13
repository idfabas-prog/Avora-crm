import { ClinicalServiceSettingForm } from "@/components/crm/ClinicalForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { hasClinicalPermission } from "@/lib/clinical/permissions";
import { createClient } from "@/lib/supabase/server";

function relation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ClinicalServicesSettingsPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const canManage = hasClinicalPermission(profile, "clinical.templates.manage");
  const [{ data: services }, { data: settings }] = await Promise.all([
    supabase.from("services").select("id, name, category, active").eq("organization_id", profile.organizationId).order("name"),
    supabase.from("clinical_service_settings").select("id, service_id, requires_clinical_session, requires_consent, requires_photo_tracking, requires_provider, allow_package_entitlement, default_followup_days, entitlement_policy, warning_only_missing_consent, active, services(name, category)").eq("organization_id", profile.organizationId).order("created_at")
  ]);
  const serviceOptions = (services ?? []).map((service) => ({ id: service.id, name: service.name }));

  return (
    <div className="page-stack">
      <PageHeader description="Controls which services require clinical sessions, consent, photos, provider assignment, and entitlement handling." title="Clinical Services" />
      {canManage ? (
        <details className="panel">
          <summary className="summary-action">Add Service Setting</summary>
          <ClinicalServiceSettingForm services={serviceOptions} />
        </details>
      ) : null}
      <section className="panel">
        <div className="panel-header"><h2>Service Settings</h2><span>Clinical operations rules</span></div>
        <div className="settings-grid">
          {(settings ?? []).map((setting) => {
            const service = relation(setting.services);
            return (
              <article className="settings-card" key={setting.id}>
                <div><h2>{service?.name ?? "Service"}</h2><StatusBadge status={setting.active ? "Active" : "Inactive"} /></div>
                <dl>
                  <div><dt>Requires Session</dt><dd>{setting.requires_clinical_session ? "Yes" : "No"}</dd></div>
                  <div><dt>Consent</dt><dd>{setting.requires_consent ? "Required" : "Not required"}</dd></div>
                  <div><dt>Photos</dt><dd>{setting.requires_photo_tracking ? "Tracked" : "Optional"}</dd></div>
                  <div><dt>Entitlements</dt><dd>{setting.allow_package_entitlement ? setting.entitlement_policy : "Disabled"}</dd></div>
                  <div><dt>Follow-Up</dt><dd>{setting.default_followup_days ?? 0} days</dd></div>
                </dl>
                {canManage ? (
                  <details>
                    <summary className="summary-action">Edit</summary>
                    <ClinicalServiceSettingForm setting={setting} services={serviceOptions} />
                  </details>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
