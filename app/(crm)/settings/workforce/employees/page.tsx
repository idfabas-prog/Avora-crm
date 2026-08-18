import Link from "next/link";
import { EmploymentProfileForm } from "@/components/crm/WorkforceForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { formatDate, fromDbStatus } from "@/lib/crm/constants";
import { formatMoney } from "@/lib/financial/money";
import { createClient } from "@/lib/supabase/server";
import { canViewCompensation, hasWorkforcePermission } from "@/lib/workforce/permissions";

type Relation<T> = T | T[] | null;

function first<T>(value: Relation<T> | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function WorkforceEmployeesPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();

  if (!hasWorkforcePermission(profile, "workforce.compensation.manage")) {
    return <div className="page-stack"><PageHeader description="Your current role does not include employee configuration access." title="Employees" /></div>;
  }

  const [{ data: users }, { data: employees }] = await Promise.all([
    supabase.from("user_profiles").select("id, full_name, email").eq("organization_id", profile.organizationId).order("full_name"),
    supabase.from("employment_profiles").select("id, user_id, employee_number, employment_type, status, hire_date, job_title, hourly_rate_cents, annual_salary_cents, users:user_profiles!employment_profiles_user_id_fkey(full_name, email), primary:locations!employment_profiles_primary_location_id_fkey(name)").eq("organization_id", profile.organizationId).order("created_at", { ascending: false })
  ]);

  return (
    <div className="page-stack">
      <PageHeader description="Employment metadata and payroll-support compensation settings." title="Employees" />
      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Employee Profiles</h2><span>No tax or paycheck calculations</span></div>
          <div className="record-list">
            {(employees ?? []).map((employee) => {
              const user = first(employee.users);
              const location = first(employee.primary);
              return <article key={employee.id}><strong><Link className="strong-link" href={`/staff/${employee.user_id}`}>{user?.full_name ?? "Team member"}</Link> - <StatusBadge status={fromDbStatus(employee.status)} /></strong><p>{employee.job_title ?? "Staff"} - {employee.employment_type} - {location?.name ?? "Unassigned"} - hired {formatDate(employee.hire_date)}</p><span>{canViewCompensation(profile) ? `${employee.hourly_rate_cents ? `${formatMoney(employee.hourly_rate_cents)}/hr` : ""} ${employee.annual_salary_cents ? `${formatMoney(employee.annual_salary_cents)}/yr` : ""}` : "Compensation restricted"}</span></article>;
            })}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Add or Update</h2><span>Upserts by organization and employee</span></div>
          <EmploymentProfileForm locations={profile.locations} users={(users ?? []).map((user) => ({ id: user.id, name: `${user.full_name} (${user.email})` }))} />
        </section>
      </section>
    </div>
  );
}
