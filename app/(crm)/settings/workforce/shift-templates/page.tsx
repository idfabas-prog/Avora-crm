import { ShiftTemplateForm } from "@/components/crm/WorkforceForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { hasWorkforcePermission } from "@/lib/workforce/permissions";

type Relation<T> = T | T[] | null;

function first<T>(value: Relation<T> | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function WorkforceShiftTemplatesPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();

  if (!hasWorkforcePermission(profile, "workforce.settings.manage")) {
    return <div className="page-stack"><PageHeader description="Your current role does not include shift template settings access." title="Shift Templates" /></div>;
  }

  const { data: templates } = await supabase.from("shift_templates").select("id, name, start_time, end_time, unpaid_break_minutes, active, locations(name)").eq("organization_id", profile.organizationId).order("name");

  return (
    <div className="page-stack">
      <PageHeader description="Reusable scheduling templates by location." title="Shift Templates" />
      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Templates</h2><span>{templates?.length ?? 0} configured</span></div>
          <div className="record-list">
            {(templates ?? []).map((template) => {
              const location = first(template.locations);
              return <article key={template.id}><strong>{template.name} - <StatusBadge status={template.active ? "Active" : "Inactive"} /></strong><p>{location?.name ?? "Location"} - {template.start_time} to {template.end_time} - break {template.unpaid_break_minutes}m</p></article>;
            })}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Create Template</h2><span>Location scoped</span></div>
          <ShiftTemplateForm locations={profile.locations} />
        </section>
      </section>
    </div>
  );
}
