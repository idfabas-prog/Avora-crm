import Link from "next/link";
import { TimeClockForm } from "@/components/crm/WorkforceForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { formatDate, fromDbStatus } from "@/lib/crm/constants";
import { createClient } from "@/lib/supabase/server";
import { hasWorkforcePermission } from "@/lib/workforce/permissions";

function hours(minutes: number | null | undefined) {
  return `${(Number(minutes ?? 0) / 60).toFixed(1)}h`;
}

export default async function TimeClockPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();

  if (!hasWorkforcePermission(profile, "workforce.timeclock.use")) {
    return <div className="page-shell"><main className="main-content"><PageHeader description="Your current role does not include time clock access." title="Time Clock" /></main></div>;
  }

  const today = new Date().toISOString().slice(0, 10);
  const locationIds = profile.locations.map((location) => location.id);
  const openQuery = supabase.from("time_entries").select("id, clock_in_at, worked_minutes, locations(name)").eq("organization_id", profile.organizationId).eq("user_id", profile.id).eq("status", "open").is("clock_out_at", null).limit(1).maybeSingle();
  const shiftsQuery = supabase.from("staff_shifts").select("id, scheduled_start, scheduled_end, notes, locations(name)").eq("organization_id", profile.organizationId).eq("user_id", profile.id).gte("scheduled_start", `${today}T00:00:00`).lte("scheduled_start", `${today}T23:59:59`).order("scheduled_start");
  if (locationIds.length > 0) shiftsQuery.in("location_id", locationIds);
  const [{ data: openEntry }, { data: shifts }, { data: recent }] = await Promise.all([
    openQuery,
    shiftsQuery,
    supabase.from("time_entries").select("id, clock_in_at, clock_out_at, status, worked_minutes").eq("organization_id", profile.organizationId).eq("user_id", profile.id).order("clock_in_at", { ascending: false }).limit(10)
  ]);

  return (
    <div className="page-shell">
      <main className="main-content">
        <div className="page-stack">
          <PageHeader
            action={<div className="header-actions"><Link className="secondary-button" href="/dashboard">Dashboard</Link><Link className="primary-button" href="/time-clock/kiosk">Kiosk</Link></div>}
            description="Employee self-service clock-in, breaks, and clock-out."
            title="Time Clock"
          />
          <section className="dashboard-grid">
            <section className="panel">
              <div className="panel-header"><h2>{openEntry ? "Active Shift" : "Clock In"}</h2><span>{profile.fullName}</span></div>
              {openEntry ? <p className="muted">Clocked in at {formatDate(openEntry.clock_in_at)}.</p> : null}
              <TimeClockForm locations={profile.locations} openEntryId={openEntry?.id ?? null} shifts={(shifts ?? []).map((shift) => ({ id: shift.id, name: `${formatDate(shift.scheduled_start)} - ${shift.notes ?? "Shift"}` }))} />
            </section>
            <section className="panel">
              <div className="panel-header"><h2>Recent Entries</h2><span>Personal attendance</span></div>
              <div className="record-list">{(recent ?? []).map((entry) => <article key={entry.id}><strong>{fromDbStatus(entry.status)}</strong><p>{formatDate(entry.clock_in_at)} to {entry.clock_out_at ? formatDate(entry.clock_out_at) : "Open"} - {hours(entry.worked_minutes)}</p></article>)}</div>
            </section>
          </section>
        </div>
      </main>
    </div>
  );
}
