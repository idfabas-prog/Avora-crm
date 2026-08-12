import { createAppointment, updateAppointmentStatus } from "@/app/actions";
import { ActionForm } from "@/components/crm/ActionForm";
import { appointmentStatuses } from "@/lib/crm/constants";

type Option = { id: string; name: string };
type AppointmentTypeOption = Option & { duration_minutes: number };

export function AddAppointmentForm({
  contacts,
  locations,
  providers,
  appointmentTypes
}: {
  contacts: Option[];
  locations: Option[];
  providers: Option[];
  appointmentTypes: AppointmentTypeOption[];
}) {
  return (
    <ActionForm action={createAppointment} submitLabel="Create Appointment" successMessage="Appointment created">
      <div className="form-grid two">
        <label><span>Contact</span><select name="contact_id" required>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></label>
        <label><span>Location</span><select name="location_id" required>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <label><span>Appointment Type</span><select name="appointment_type_id" required>{appointmentTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label>
        <label><span>Provider</span><select name="provider_id"><option value="">Unassigned</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>
        <label><span>Date</span><input name="date" required type="date" /></label>
        <label><span>Start Time</span><input name="start_time" required type="time" /></label>
        <label><span>Duration</span><select name="duration_minutes">{appointmentTypes.map((type) => <option key={type.id} value={type.duration_minutes}>{type.duration_minutes} minutes</option>)}</select></label>
        <label><span>Status</span><select name="status" defaultValue="Scheduled">{appointmentStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
      </div>
      <label><span>Notes</span><textarea name="notes" rows={3} /></label>
    </ActionForm>
  );
}

export function AppointmentStatusActions({ appointmentId }: { appointmentId: string }) {
  return (
    <div className="quick-actions">
      {["Confirmed", "Checked In", "Completed", "No Show", "Cancelled"].map((status) => (
        <form action={updateAppointmentStatus} key={status}>
          <input name="appointment_id" type="hidden" value={appointmentId} />
          <input name="status" type="hidden" value={status} />
          <button type="submit">{status}</button>
        </form>
      ))}
    </div>
  );
}
