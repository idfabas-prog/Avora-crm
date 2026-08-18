import { StaffShiftForm, ShiftStatusForm } from "@/components/crm/WorkforceForms";
import { PageHeader } from "@/components/ui/PageHeader";
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

export default async function StaffSchedulePage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const selectedLocationId = await getSelectedLocationId(profile);
  const locationIds = allowedLocationIds(profile, selectedLocationId);

  if (!hasWorkforcePermission(profile, "workforce.schedule.read")) {
    return <div className="page-stack"><PageHeader description="Your current role does not include schedule access." title="Staff Schedule" /></div>;
  }

  const shiftsQuery = supabase
    .from("staff_shifts")
    .select("id, location_id, scheduled_start, scheduled_end, status, notes, users:user_profiles!staff_shifts_user_id_fkey(full_name), locations(name)")
    .eq("organization_id", profile.organizationId)
    .order("scheduled_start", { ascending: true })
    .limit(200);
  if (locationIds.length > 0) shiftsQuery.in("location_id", locationIds);

  const [{ data: shifts }, { data: users }, { data: templates }] = await Promise.all([
    shiftsQuery,
    supabase.from("user_profiles").select("id, full_name, email").eq("organization_id", profile.organizationId).order("full_name"),
    supabase.from("shift_templates").select("id, name").eq("organization_id", profile.organizationId).eq("active", true).order("name")
  ]);

  return (
    <div className="page-stack">
      <PageHeader description="Daily and weekly staff coverage by allowed location." title="Staff Schedule" />
      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Schedule</h2><span>{shifts?.length ?? 0} shifts</span></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Employee</th><th>Location</th><th>Start</th><th>End</th><th>Role</th><th>Status</th><th>Update</th></tr></thead>
              <tbody>
                {(shifts ?? []).map((shift) => {
                  const user = first(shift.users);
                  const location = first(shift.locations);
                  return <tr key={shift.id}><td>{user?.full_name ?? "Team member"}</td><td>{location?.name ?? "Location"}</td><td>{formatDate(shift.scheduled_start)}</td><td>{formatDate(shift.scheduled_end)}</td><td>{shift.notes ?? "-"}</td><td><StatusBadge status={fromDbStatus(shift.status)} /></td><td>{hasWorkforcePermission(profile, "workforce.schedule.write") ? <ShiftStatusForm shiftId={shift.id} status={shift.status} /> : "-"}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
        </section>
        {hasWorkforcePermission(profile, "workforce.schedule.write") ? (
          <section className="panel">
            <div className="panel-header"><h2>Create Shift</h2><span>Fictional development schedule</span></div>
            <StaffShiftForm locations={profile.locations} templates={(templates ?? []).map((item) => ({ id: item.id, name: item.name }))} users={(users ?? []).map((user) => ({ id: user.id, name: `${user.full_name} (${user.email})` }))} />
          </section>
        ) : null}
      </section>
    </div>
  );
}
