import { ConsentTemplateForm } from "@/components/crm/ClinicalForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { hasClinicalPermission } from "@/lib/clinical/permissions";
import { fromDbStatus } from "@/lib/crm/constants";
import { createClient } from "@/lib/supabase/server";

function relation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ConsentTemplatesPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const canManage = hasClinicalPermission(profile, "clinical.consents.manage");
  const [{ data: services }, { data: templates }] = await Promise.all([
    supabase.from("services").select("id, name").eq("organization_id", profile.organizationId).order("name"),
    supabase.from("consent_templates").select("id, service_id, name, version, consent_type, content_reference, content_text, active, services(name)").eq("organization_id", profile.organizationId).order("name")
  ]);
  const serviceOptions = (services ?? []).map((service) => ({ id: service.id, name: service.name }));

  return (
    <div className="page-stack">
      <PageHeader description="Development consent templates and simulated signature records for treatment operations." title="Consent Templates" />
      {canManage ? (
        <details className="panel">
          <summary className="summary-action">Add Consent Template</summary>
          <ConsentTemplateForm services={serviceOptions} />
        </details>
      ) : null}
      <section className="panel">
        <div className="panel-header"><h2>Templates</h2><span>Versioned and inactive-safe</span></div>
        <div className="record-list">
          {(templates ?? []).map((template) => {
            const service = relation(template.services);
            return (
              <article key={template.id}>
                <strong>{template.name}</strong>
                <p>{service?.name ?? "All services"} · {fromDbStatus(template.consent_type)} · version {template.version}</p>
                <span>{template.content_reference ?? "Inline template text"}</span>
                <StatusBadge status={template.active ? "Active" : "Inactive"} />
                {canManage ? (
                  <details>
                    <summary className="summary-action">Edit</summary>
                    <ConsentTemplateForm template={template} services={serviceOptions} />
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
