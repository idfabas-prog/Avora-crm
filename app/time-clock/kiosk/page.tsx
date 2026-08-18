import Link from "next/link";
import { TimeClockForm } from "@/components/crm/WorkforceForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { APP_DISPLAY_NAME } from "@/lib/config/branding";
import { formatDate } from "@/lib/crm/constants";
import { createClient } from "@/lib/supabase/server";
import { hasWorkforcePermission } from "@/lib/workforce/permissions";

export default async function TimeClockKioskPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();

  if (!hasWorkforcePermission(profile, "workforce.timeclock.use")) {
    return <div className="page-shell"><main className="main-content"><PageHeader description="Your current role does not include time clock access." title="Kiosk" /></main></div>;
  }

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: openEntry }, { data: shifts }] = await Promise.all([
    supabase.from("time_entries").select("id, clock_in_at").eq("organization_id", profile.organizationId).eq("user_id", profile.id).eq("status", "open").is("clock_out_at", null).limit(1).maybeSingle(),
    supabase.from("staff_shifts").select("id, scheduled_start, notes").eq("organization_id", profile.organizationId).eq("user_id", profile.id).gte("scheduled_start", `${today}T00:00:00`).lte("scheduled_start", `${today}T23:59:59`).order("scheduled_start")
  ]);

  return (
    <div className="page-shell">
      <main className="main-content">
        <div className="page-stack">
          <PageHeader
            action={<Link className="secondary-button" href="/time-clock">Standard Clock</Link>}
            description={openEntry ? `Active since ${formatDate(openEntry.clock_in_at)}` : `Kiosk-friendly time capture for fictional ${APP_DISPLAY_NAME} development staff.`}
            title="Time Clock Kiosk"
          />
          <section className="panel">
            <TimeClockForm locations={profile.locations} openEntryId={openEntry?.id ?? null} shifts={(shifts ?? []).map((shift) => ({ id: shift.id, name: `${formatDate(shift.scheduled_start)} - ${shift.notes ?? "Shift"}` }))} />
          </section>
        </div>
      </main>
    </div>
  );
}
