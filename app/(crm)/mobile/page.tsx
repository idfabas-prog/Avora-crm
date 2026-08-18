import Link from "next/link";
import { InstallAppPrompt } from "@/components/mobile/InstallAppPrompt";
import { MobileMetricCard, MobileRecordCard } from "@/components/mobile/MobileCards";
import { QuickActionSheet } from "@/components/mobile/QuickActionSheet";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { APP_DISPLAY_NAME } from "@/lib/config/branding";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { formatDateTime, fromDbStatus } from "@/lib/crm/constants";
import { getMobileHomeReport } from "@/lib/mobile/reports";
import { createClient } from "@/lib/supabase/server";

type Relation<T> = T | T[] | null;

function first<T>(value: Relation<T> | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function MobileHomePage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const selectedLocationId = await getSelectedLocationId(profile);
  const report = await getMobileHomeReport(supabase, profile, allowedLocationIds(profile, selectedLocationId));

  return (
    <div className="mobile-page">
      <PageHeader
        action={<QuickActionSheet role={profile.role} />}
        description={`Touch-first ${APP_DISPLAY_NAME} workspace for today, tasks, calls, and mobile alerts.`}
        title={`Hi, ${profile.fullName.split(" ")[0]}`}
      />
      <InstallAppPrompt />
      <section className="mobile-metric-grid">
        {report.metrics.map((metric) => <MobileMetricCard key={metric.label} {...metric} />)}
      </section>
      <section className="mobile-section">
        <div className="mobile-section-header"><h2>Today</h2><Link href="/mobile/schedule">Schedule</Link></div>
        {report.appointments.map((appointment) => {
          const contact = first(appointment.contacts);
          const type = first(appointment.appointment_types);
          return <MobileRecordCard detail={`${formatDateTime(appointment.start_at)} - ${type?.name ?? "Appointment"}`} href="/calendar" key={appointment.id} status={fromDbStatus(appointment.status)} title={contact ? `${contact.first_name} ${contact.last_name}` : "Appointment"} />;
        })}
      </section>
      <section className="mobile-section">
        <div className="mobile-section-header"><h2>Tasks</h2><Link href="/mobile/tasks">Open</Link></div>
        {report.tasks.map((task) => {
          const contact = first(task.contacts);
          return <MobileRecordCard detail={`${contact ? `${contact.first_name} ${contact.last_name}` : "No contact"} - Due ${formatDateTime(task.due_at)}`} href="/mobile/tasks" key={task.id} status={fromDbStatus(task.status)} title={task.title} />;
        })}
      </section>
      <section className="mobile-section">
        <div className="mobile-section-header"><h2>Calls</h2><Link href="/calls">All</Link></div>
        {report.calls.map((call) => {
          const contact = first(call.contacts);
          return <MobileRecordCard detail={`${fromDbStatus(call.direction)} - ${formatDateTime(call.started_at)}`} href={`/calls/${call.id}`} key={call.id} status={fromDbStatus(call.status)} title={contact ? `${contact.first_name} ${contact.last_name}` : "Unknown caller"} />;
        })}
      </section>
      <section className="mobile-section">
        <div className="mobile-section-header"><h2>Notifications</h2><Link href="/notifications">View</Link></div>
        {report.notifications.map((notification) => <MobileRecordCard detail={notification.body_safe} href={notification.deep_link ?? "/notifications"} key={notification.id} status={fromDbStatus(notification.status)} title={notification.title} />)}
      </section>
    </div>
  );
}
