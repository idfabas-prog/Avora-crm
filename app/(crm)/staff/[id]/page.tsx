import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { APP_DISPLAY_NAME } from "@/lib/config/branding";
import { formatDate, fromDbStatus } from "@/lib/crm/constants";
import { formatMoney } from "@/lib/financial/money";
import { createClient } from "@/lib/supabase/server";
import { canViewCompensation, hasWorkforcePermission } from "@/lib/workforce/permissions";

type StaffDetailProps = {
  params: Promise<{ id: string }>;
};

type Relation<T> = T | T[] | null;

function first<T>(value: Relation<T> | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function hours(minutes: number | null | undefined) {
  return `${(Number(minutes ?? 0) / 60).toFixed(1)}h`;
}

export default async function StaffDetailPage({ params }: StaffDetailProps) {
  const { id } = await params;
  const profile = await requireCurrentProfile();
  const supabase = await createClient();

  if (!hasWorkforcePermission(profile, "workforce.read")) {
    return <div className="page-stack"><PageHeader description="Your current role does not include workforce access." title="Staff Profile" /></div>;
  }

  const [{ data: user }, { data: employment }, { data: shifts }, { data: entries }, { data: pto }, { data: labor }] = await Promise.all([
    supabase.from("user_profiles").select("id, full_name, email, title, roles(name)").eq("id", id).eq("organization_id", profile.organizationId).single(),
    supabase.from("employment_profiles").select("id, employee_number, employment_type, status, hire_date, job_title, hourly_rate_cents, annual_salary_cents, primary:locations!employment_profiles_primary_location_id_fkey(name)").eq("user_id", id).eq("organization_id", profile.organizationId).maybeSingle(),
    supabase.from("staff_shifts").select("id, scheduled_start, scheduled_end, status, notes, locations(name)").eq("user_id", id).eq("organization_id", profile.organizationId).order("scheduled_start", { ascending: false }).limit(20),
    supabase.from("time_entries").select("id, clock_in_at, clock_out_at, status, worked_minutes, locations(name)").eq("user_id", id).eq("organization_id", profile.organizationId).order("clock_in_at", { ascending: false }).limit(20),
    supabase.from("pto_requests").select("id, start_date, end_date, requested_minutes, status, pto_policies(name)").eq("user_id", id).eq("organization_id", profile.organizationId).order("created_at", { ascending: false }).limit(20),
    supabase.from("labor_cost_records").select("id, regular_minutes, overtime_minutes, pto_minutes, total_cost_cents, pay_periods(start_date, end_date)").eq("user_id", id).eq("organization_id", profile.organizationId).order("calculated_at", { ascending: false }).limit(20)
  ]);

  if (!user) {
    return <div className="page-stack"><PageHeader description="This staff profile was not found for the current organization." title="Staff Profile" /></div>;
  }

  const role = first(user.roles);
  const primary = first(employment?.primary);
  const totalWorked = (entries ?? []).reduce((sum, entry) => sum + Number(entry.worked_minutes ?? 0), 0);
  const totalLabor = (labor ?? []).reduce((sum, row) => sum + Number(row.total_cost_cents ?? 0), 0);

  return (
    <div className="page-stack">
      <PageHeader
        action={<div className="header-actions"><Link className="secondary-button" href="/staff/schedule">Schedule</Link><Link className="secondary-button" href="/staff/timesheets">Timesheets</Link><Link className="primary-button" href="/settings/workforce/employees">Employee Settings</Link></div>}
        description={`${user.email} - ${role?.name ?? "team member"} - ${employment?.job_title ?? user.title ?? `${APP_DISPLAY_NAME} team`}`}
        title={user.full_name}
      />
      <section className="metric-grid">
        <StatCard detail="Current employment state" label="Status" value={fromDbStatus(employment?.status ?? "active")} />
        <StatCard detail="Primary assigned location" label="Location" value={primary?.name ?? "Unassigned"} />
        <StatCard detail="Loaded time entries" label="Worked" value={hours(totalWorked)} />
        <StatCard detail="Payroll-support only" label="Labor Cost" value={canViewCompensation(profile) ? formatMoney(totalLabor) : "Restricted"} />
      </section>
      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Schedule</h2><span>Recent shifts</span></div>
          <div className="record-list">{(shifts ?? []).map((shift) => {
            const location = first(shift.locations);
            return <article key={shift.id}><strong>{location?.name ?? "Location"} - {fromDbStatus(shift.status)}</strong><p>{formatDate(shift.scheduled_start)} to {formatDate(shift.scheduled_end)} - {shift.notes ?? "Shift"}</p></article>;
          })}</div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Time Entries</h2><span>Recent attendance</span></div>
          <div className="record-list">{(entries ?? []).map((entry) => {
            const location = first(entry.locations);
            return <article key={entry.id}><strong>{location?.name ?? "Location"} - <StatusBadge status={fromDbStatus(entry.status)} /></strong><p>{formatDate(entry.clock_in_at)} - {hours(entry.worked_minutes)}</p></article>;
          })}</div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>PTO</h2><span>Requests</span></div>
          <div className="record-list">{(pto ?? []).map((request) => {
            const policy = first(request.pto_policies);
            return <article key={request.id}><strong>{policy?.name ?? "PTO"} - {fromDbStatus(request.status)}</strong><p>{formatDate(request.start_date)} to {formatDate(request.end_date)} - {hours(request.requested_minutes)}</p></article>;
          })}</div>
        </section>
      </section>
    </div>
  );
}
