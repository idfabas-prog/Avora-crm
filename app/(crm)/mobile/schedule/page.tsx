import { AppointmentStatusActions } from "@/components/crm/AppointmentForms";
import { MobileRecordCard } from "@/components/mobile/MobileCards";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { formatDateTime, fromDbStatus } from "@/lib/crm/constants";
import { createClient } from "@/lib/supabase/server";

type Relation<T> = T | T[] | null;
function first<T>(value: Relation<T> | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function MobileSchedulePage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const selectedLocationId = await getSelectedLocationId(profile);
  const locationIds = allowedLocationIds(profile, selectedLocationId);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  let query = supabase
    .from("appointments")
    .select("id, start_at, end_at, status, contacts(first_name, last_name, phone), appointment_types(name), locations(name), provider:user_profiles!appointments_provider_id_fkey(full_name)")
    .eq("organization_id", profile.organizationId)
    .gte("start_at", start.toISOString())
    .lt("start_at", end.toISOString())
    .order("start_at")
    .limit(80);
  if (locationIds.length > 0) query = query.in("location_id", locationIds);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (
    <div className="mobile-page">
      <PageHeader description="Touch-friendly agenda for the next seven days." title="Mobile Schedule" />
      <section className="mobile-section">
        {(data ?? []).map((appointment) => {
          const contact = first(appointment.contacts);
          const type = first(appointment.appointment_types);
          const location = first(appointment.locations);
          const provider = first(appointment.provider);
          return (
            <MobileRecordCard
              actions={<AppointmentStatusActions appointmentId={appointment.id} />}
              detail={`${formatDateTime(appointment.start_at)} - ${type?.name ?? "Appointment"} - ${location?.name ?? "No location"} - ${provider?.full_name ?? "Unassigned"}`}
              href="/calendar"
              key={appointment.id}
              status={fromDbStatus(appointment.status)}
              title={contact ? `${contact.first_name} ${contact.last_name}` : "Appointment"}
            />
          );
        })}
      </section>
    </div>
  );
}
