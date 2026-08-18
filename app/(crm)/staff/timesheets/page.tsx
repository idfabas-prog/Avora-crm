import { TimeEntryEditForm, TimesheetApprovalForm } from "@/components/crm/WorkforceForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { formatDate, fromDbStatus } from "@/lib/crm/constants";
import { createClient } from "@/lib/supabase/server";
import { hasWorkforcePermission } from "@/lib/workforce/permissions";

type Relation<T> = T | T[] | null;

function first<T>(value: Relation<T> | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function hours(minutes: number | null | undefined) {
  return `${(Number(minutes ?? 0) / 60).toFixed(1)}h`;
}

export default async function TimesheetsPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const selectedLocationId = await getSelectedLocationId(profile);
  const locationIds = allowedLocationIds(profile, selectedLocationId);

  if (!hasWorkforcePermission(profile, "workforce.timesheets.read")) {
    return <div className="page-stack"><PageHeader description="Your current role does not include timesheet access." title="Timesheets" /></div>;
  }

  const entriesQuery = supabase.from("time_entries").select("id, location_id, user_id, clock_in_at, clock_out_at, status, worked_minutes, unpaid_break_minutes, notes, users:user_profiles!time_entries_user_id_fkey(full_name), locations(name)").eq("organization_id", profile.organizationId).order("clock_in_at", { ascending: false }).limit(100);
  const timesheetsQuery = supabase.from("timesheets").select("id, user_id, status, regular_minutes, overtime_minutes, pto_minutes, approved_at, users:user_profiles!timesheets_user_id_fkey(full_name), pay_periods(start_date, end_date)").eq("organization_id", profile.organizationId).order("created_at", { ascending: false }).limit(100);
  if (locationIds.length > 0) entriesQuery.in("location_id", locationIds);
  const [{ data: entries }, { data: timesheets }] = await Promise.all([entriesQuery, timesheetsQuery]);
  const totalWorked = (entries ?? []).reduce((sum, entry) => sum + Number(entry.worked_minutes ?? 0), 0);

  return (
    <div className="page-stack">
      <PageHeader description="Time entries and timesheet approval. Payroll export remains payroll-support only." title="Timesheets" />
      <section className="metric-grid">
        <StatCard detail="Loaded time entries" label="Entries" value={String(entries?.length ?? 0)} />
        <StatCard detail="Completed and edited" label="Worked Hours" value={hours(totalWorked)} />
        <StatCard detail="Open clock entries" label="Open" value={String(entries?.filter((entry) => entry.status === "open").length ?? 0)} />
        <StatCard detail="Ready for review" label="Review" value={String(timesheets?.filter((sheet) => sheet.status === "review").length ?? 0)} />
      </section>
      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Timesheets</h2><span>Approve after review</span></div>
          <div className="record-list">
            {(timesheets ?? []).map((sheet) => {
              const user = first(sheet.users);
              const period = first(sheet.pay_periods);
              return <article key={sheet.id}><strong>{user?.full_name ?? "Team member"} - {fromDbStatus(sheet.status)}</strong><p>{period?.start_date} to {period?.end_date} - regular {hours(sheet.regular_minutes)} - OT {hours(sheet.overtime_minutes)} - PTO {hours(sheet.pto_minutes)}</p>{hasWorkforcePermission(profile, "workforce.timesheets.approve") ? <TimesheetApprovalForm status={sheet.status} timesheetId={sheet.id} /> : null}</article>;
            })}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Time Entries</h2><span>Manager edits create audit rows</span></div>
          <div className="record-list">
            {(entries ?? []).slice(0, 25).map((entry) => {
              const user = first(entry.users);
              const location = first(entry.locations);
              return <article key={entry.id}><strong>{user?.full_name ?? "Team member"} - <StatusBadge status={fromDbStatus(entry.status)} /></strong><p>{location?.name ?? "Location"} - {formatDate(entry.clock_in_at)} - {hours(entry.worked_minutes)}</p>{hasWorkforcePermission(profile, "workforce.time_entries.manage") ? <TimeEntryEditForm entry={entry as unknown as Record<string, string | number | null>} locations={profile.locations} /> : null}</article>;
            })}
          </div>
        </section>
      </section>
    </div>
  );
}
