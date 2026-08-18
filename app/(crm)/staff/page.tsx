import Link from "next/link";
import { StaffShiftForm, ShiftStatusForm } from "@/components/crm/WorkforceForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { formatDate, fromDbStatus } from "@/lib/crm/constants";
import { formatMoney } from "@/lib/financial/money";
import { createClient } from "@/lib/supabase/server";
import { hasWorkforcePermission } from "@/lib/workforce/permissions";
import { getWorkforceSummary } from "@/lib/workforce/reports";

type Relation<T> = T | T[] | null;

function first<T>(value: Relation<T> | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function hours(minutes: number) {
  return `${(minutes / 60).toFixed(1)}h`;
}

export default async function StaffPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const selectedLocationId = await getSelectedLocationId(profile);
  const locationIds = allowedLocationIds(profile, selectedLocationId);

  if (!hasWorkforcePermission(profile, "workforce.read")) {
    return <div className="page-stack"><PageHeader description="Your current role does not include workforce access." title="Staff" /></div>;
  }

  const report = await getWorkforceSummary(supabase, { organizationId: profile.organizationId, locationIds });
  const [{ data: users }, { data: templates }] = await Promise.all([
    supabase.from("user_profiles").select("id, full_name, email, title").eq("organization_id", profile.organizationId).order("full_name"),
    supabase.from("shift_templates").select("id, name").eq("organization_id", profile.organizationId).eq("active", true).order("name")
  ]);
  const userOptions = (users ?? []).map((user) => ({ id: user.id, name: `${user.full_name} (${user.email})` }));
  const templateOptions = (templates ?? []).map((template) => ({ id: template.id, name: template.name }));

  return (
    <div className="page-stack">
      <PageHeader
        action={<div className="header-actions"><Link className="secondary-button" href="/time-clock">Time Clock</Link><Link className="secondary-button" href="/staff/schedule">Schedule</Link><Link className="secondary-button" href="/staff/timesheets">Timesheets</Link><Link className="secondary-button" href="/staff/time-off">Time Off</Link><Link className="primary-button" href="/settings/workforce">Workforce Settings</Link></div>}
        description="Workforce scheduling, attendance, PTO, and payroll-support reporting. No payroll processing or tax calculations are performed."
        title="Staff"
      />
      <section className="metric-grid">
        <StatCard detail="Loaded schedule rows" label="Scheduled Shifts" value={String(report.summary.scheduledShifts)} />
        <StatCard detail="Currently open entries" label="Clocked In" value={String(report.summary.openTimeEntries)} />
        <StatCard detail="Pending requests" label="PTO Queue" value={String(report.summary.pendingPto)} />
        <StatCard detail="Open and historical" label="Attendance Exceptions" value={String(report.summary.attendanceExceptions)} />
        <StatCard detail="Completed entries" label="Worked Hours" value={hours(report.summary.workedMinutes)} />
        <StatCard detail="Labor records" label="Labor Cost" value={formatMoney(report.summary.laborCostCents)} />
      </section>
      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Upcoming Shifts</h2><span>Allowed locations only</span></div>
          <div className="record-list">
            {report.shifts.slice(0, 10).map((shift) => {
              const user = first(shift.users);
              const location = first(shift.locations);
              return <article key={shift.id}><strong>{user?.full_name ?? "Team member"} - {location?.name ?? "Location"}</strong><p>{formatDate(shift.scheduled_start)} - {shift.notes ?? "Shift"} - {fromDbStatus(shift.status)}</p>{hasWorkforcePermission(profile, "workforce.schedule.write") ? <ShiftStatusForm shiftId={shift.id} status={shift.status} /> : null}</article>;
            })}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Clock Activity</h2><span>Recent time entries</span></div>
          <div className="record-list">
            {report.timeEntries.slice(0, 10).map((entry) => {
              const user = first(entry.users);
              const location = first(entry.locations);
              return <article key={entry.id}><strong>{user?.full_name ?? "Team member"} - {fromDbStatus(entry.status)}</strong><p>{location?.name ?? "Location"} - {formatDate(entry.clock_in_at)} - {hours(Number(entry.worked_minutes ?? 0))}</p><span>Unpaid break {Number(entry.unpaid_break_minutes ?? 0)} minutes</span></article>;
            })}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Create Shift</h2><span>Schedule write permission required</span></div>
          {hasWorkforcePermission(profile, "workforce.schedule.write") ? <StaffShiftForm locations={profile.locations} templates={templateOptions} users={userOptions} /> : <p className="muted">You can view the schedule but cannot create shifts.</p>}
        </section>
      </section>
    </div>
  );
}
