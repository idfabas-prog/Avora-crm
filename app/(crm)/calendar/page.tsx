import { AddAppointmentForm, AppointmentStatusActions } from "@/components/crm/AppointmentForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { formatDate, formatDateTime, formatTime, fromDbStatus } from "@/lib/crm/constants";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function value(searchParams: Record<string, string | string[] | undefined>, key: string) {
  const item = searchParams[key];
  return Array.isArray(item) ? item[0] : item;
}

function startOfWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  copy.setDate(copy.getDate() - day);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export default async function CalendarPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const selectedLocationId = await getSelectedLocationId(profile);
  const locationIds = allowedLocationIds(profile, selectedLocationId);
  const view = value(params, "view") ?? "week";
  const selectedDate = new Date(value(params, "date") ?? new Date().toISOString());
  const providerFilter = value(params, "provider_id");
  const typeFilter = value(params, "appointment_type_id");

  let start = startOfWeek(selectedDate);
  let end = addDays(start, 7);

  if (view === "day") {
    start = new Date(selectedDate);
    start.setHours(0, 0, 0, 0);
    end = addDays(start, 1);
  }

  if (view === "month") {
    start = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    end = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1);
  }

  const [{ data: users }, { data: contacts }, { data: appointmentTypes }] = await Promise.all([
    supabase.from("user_profiles").select("id, full_name").eq("organization_id", profile.organizationId).order("full_name"),
    supabase.from("contacts").select("id, first_name, last_name").eq("organization_id", profile.organizationId).order("last_name"),
    supabase.from("appointment_types").select("id, name, duration_minutes").eq("organization_id", profile.organizationId).eq("active", true).order("name")
  ]);

  let query = supabase
    .from("appointments")
    .select(`
      id,
      start_at,
      end_at,
      status,
      notes,
      contact_id,
      provider_id,
      appointment_type_id,
      contacts(first_name, last_name, phone),
      appointment_types(name),
      locations(name),
      provider:user_profiles!appointments_provider_id_fkey(full_name),
      created_by_user:user_profiles!appointments_created_by_fkey(full_name)
    `)
    .eq("organization_id", profile.organizationId)
    .gte("start_at", start.toISOString())
    .lt("start_at", end.toISOString());

  if (locationIds.length > 0) {
    query = query.in("location_id", locationIds);
  }

  if (providerFilter) {
    query = query.eq("provider_id", providerFilter);
  }

  if (typeFilter) {
    query = query.eq("appointment_type_id", typeFilter);
  }

  const { data: appointments, error } = await query.order("start_at");

  if (error) {
    throw new Error(error.message);
  }

  const userOptions = (users ?? []).map((user) => ({ id: user.id, name: user.full_name }));
  const contactOptions = (contacts ?? []).map((contact) => ({ id: contact.id, name: `${contact.first_name} ${contact.last_name}` }));
  const locationOptions = profile.locations.map((location) => ({ id: location.id, name: location.name }));
  const appointmentTypeOptions = (appointmentTypes ?? []).map((type) => ({ id: type.id, name: type.name, duration_minutes: type.duration_minutes }));
  const days = view === "month"
    ? Array.from({ length: Math.ceil((end.getTime() - start.getTime()) / 86_400_000) }, (_, index) => addDays(start, index))
    : Array.from({ length: view === "day" ? 1 : 7 }, (_, index) => addDays(start, index));

  return (
    <div className="page-stack">
      <PageHeader
        action={
          <details className="drawer-details">
            <summary className="primary-button">New Appointment</summary>
            <div className="drawer-content">
              <h2>New Appointment</h2>
              <AddAppointmentForm appointmentTypes={appointmentTypeOptions} contacts={contactOptions} locations={locationOptions} providers={userOptions} />
            </div>
          </details>
        }
        description="Live appointments by time, filtered by location, provider, and appointment type."
        title="Calendar"
      />
      <form className="query-toolbar">
        <select defaultValue={view} name="view"><option value="week">Week</option><option value="day">Day</option><option value="month">Month</option></select>
        <input defaultValue={selectedDate.toISOString().slice(0, 10)} name="date" type="date" />
        <select defaultValue={providerFilter ?? ""} name="provider_id"><option value="">All providers</option>{userOptions.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select>
        <select defaultValue={typeFilter ?? ""} name="appointment_type_id"><option value="">All types</option>{appointmentTypeOptions.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select>
        <button type="submit">Apply</button>
      </form>
      <section className="calendar-grid">
        {days.map((day) => {
          const dateKey = day.toISOString().slice(0, 10);
          const dayAppointments = (appointments ?? []).filter((appointment) => appointment.start_at.slice(0, 10) === dateKey);

          return (
            <div className="calendar-day" key={dateKey}>
              <h2>{formatDate(day.toISOString())}</h2>
              <div className="record-list">
                {dayAppointments.map((appointment) => {
                  const contact = Array.isArray(appointment.contacts) ? appointment.contacts[0] : appointment.contacts;
                  const type = Array.isArray(appointment.appointment_types) ? appointment.appointment_types[0] : appointment.appointment_types;
                  const provider = Array.isArray(appointment.provider) ? appointment.provider[0] : appointment.provider;
                  const location = Array.isArray(appointment.locations) ? appointment.locations[0] : appointment.locations;

                  return (
                    <details className="appointment-card" key={appointment.id}>
                      <summary>
                        <strong>{formatTime(appointment.start_at)} · {contact ? `${contact.first_name} ${contact.last_name}` : "Unknown contact"}</strong>
                        <span>{type?.name ?? "Appointment"} · {provider?.full_name ?? "Unassigned"}</span>
                      </summary>
                      <p>{formatDateTime(appointment.start_at)} - {formatTime(appointment.end_at)}</p>
                      <p>{contact?.phone ?? "No phone"} · {location?.name ?? "No location"}</p>
                      <StatusBadge status={fromDbStatus(appointment.status)} />
                      {appointment.notes ? <p>{appointment.notes}</p> : null}
                      <AppointmentStatusActions appointmentId={appointment.id} />
                    </details>
                  );
                })}
                {dayAppointments.length === 0 ? <p className="quiet-text">No appointments.</p> : null}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
