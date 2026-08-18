import { AppointmentRequestForm } from "@/components/portal/PortalForms";
import { formatDateTime, fromDbStatus } from "@/lib/crm/constants";
import { requireCurrentPatient } from "@/lib/portal/patient";
import { getPortalDashboardData } from "@/lib/portal/queries";
import { APP_DISPLAY_NAME } from "@/lib/config/branding";

function relationName(value: { name?: string } | { name?: string }[] | null) {
  const item = Array.isArray(value) ? value[0] : value;
  return item?.name ?? APP_DISPLAY_NAME;
}

export default async function PortalAppointmentsPage() {
  const patient = await requireCurrentPatient();
  const data = await getPortalDashboardData(patient);
  const appointmentOptions = data.upcomingAppointments.map((appointment) => ({ id: appointment.id, name: `${formatDateTime(appointment.start_at)} · ${relationName(appointment.appointment_types)}` }));

  return (
    <div className="portal-stack">
      <section className="portal-page-title"><p className="eyebrow">Appointments</p><h1>Your visits</h1></section>
      <section className="portal-grid">
        <article className="portal-panel"><h2>Upcoming</h2><div className="record-list">{data.upcomingAppointments.map((appointment) => <article key={appointment.id}><strong>{relationName(appointment.appointment_types)}</strong><p>{formatDateTime(appointment.start_at)} · {relationName(appointment.locations)}</p><span>{fromDbStatus(appointment.status)}</span></article>)}</div></article>
        <article className="portal-panel"><h2>Past</h2><div className="record-list">{data.pastAppointments.map((appointment) => <article key={appointment.id}><strong>{relationName(appointment.appointment_types)}</strong><p>{formatDateTime(appointment.start_at)} · {relationName(appointment.locations)}</p><span>{fromDbStatus(appointment.status)}</span></article>)}</div></article>
      </section>
      <section className="portal-panel"><h2>Request a Change</h2><p className="quiet-text">Requests are reviewed by {APP_DISPLAY_NAME} staff before any appointment is changed.</p><AppointmentRequestForm appointments={appointmentOptions} /></section>
    </div>
  );
}
