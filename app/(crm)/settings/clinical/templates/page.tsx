import { ClinicalTemplateForm } from "@/components/crm/ClinicalForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { hasClinicalPermission } from "@/lib/clinical/permissions";
import { fromDbStatus } from "@/lib/crm/constants";
import { createClient } from "@/lib/supabase/server";

function relation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ClinicalTemplatesPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const canManage = hasClinicalPermission(profile, "clinical.templates.manage");
  const [{ data: services }, { data: templates }] = await Promise.all([
    supabase.from("services").select("id, name").eq("organization_id", profile.organizationId).order("name"),
    supabase.from("clinical_templates").select("id, service_id, name, template_type, schema_json, active, services(name)").eq("organization_id", profile.organizationId).order("name")
  ]);
  const serviceOptions = (services ?? []).map((service) => ({ id: service.id, name: service.name }));

  return (
    <div className="page-stack">
      <PageHeader description="Reusable provider documentation templates. These are structured development templates, not AI-generated clinical advice." title="Clinical Templates" />
      {canManage ? (
        <details className="panel">
          <summary className="summary-action">Add Template</summary>
          <ClinicalTemplateForm services={serviceOptions} />
        </details>
      ) : null}
      <section className="panel">
        <div className="panel-header"><h2>Documentation Templates</h2><span>By service and template type</span></div>
        <div className="record-list">
          {(templates ?? []).map((template) => {
            const service = relation(template.services);
            return (
              <article key={template.id}>
                <strong>{template.name}</strong>
                <p>{service?.name ?? "All services"} · {fromDbStatus(template.template_type)}</p>
                <StatusBadge status={template.active ? "Active" : "Inactive"} />
                {canManage ? (
                  <details>
                    <summary className="summary-action">Edit</summary>
                    <ClinicalTemplateForm template={template} services={serviceOptions} />
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
