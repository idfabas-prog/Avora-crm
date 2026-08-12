import { createContact, updateContact } from "@/app/actions";
import { ActionForm } from "@/components/crm/ActionForm";
import { contactStatuses } from "@/lib/crm/constants";

type Option = { id: string; name: string };
type ContactFormData = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  location_id: string | null;
  lead_source: string | null;
  assigned_to: string | null;
  status: string;
};

function ContactFields({
  contact,
  locations,
  users
}: {
  contact?: ContactFormData;
  locations: Option[];
  users: Option[];
}) {
  return (
    <>
      {contact ? <input name="contact_id" type="hidden" value={contact.id} /> : null}
      <div className="form-grid two">
        <label><span>First Name</span><input defaultValue={contact?.first_name} name="first_name" required /></label>
        <label><span>Last Name</span><input defaultValue={contact?.last_name} name="last_name" required /></label>
        <label><span>Phone</span><input defaultValue={contact?.phone ?? ""} name="phone" /></label>
        <label><span>Email</span><input defaultValue={contact?.email ?? ""} name="email" type="email" /></label>
        <label>
          <span>Location</span>
          <select defaultValue={contact?.location_id ?? ""} name="location_id">
            <option value="">Unassigned</option>
            {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
          </select>
        </label>
        <label><span>Lead Source</span><input defaultValue={contact?.lead_source ?? ""} name="lead_source" /></label>
        <label>
          <span>Assigned Employee</span>
          <select defaultValue={contact?.assigned_to ?? ""} name="assigned_to">
            <option value="">Unassigned</option>
            {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select defaultValue={contact?.status ?? "New Lead"} name="status">
            {contactStatuses.map((status) => <option key={status}>{status}</option>)}
          </select>
        </label>
      </div>
    </>
  );
}

export function AddContactForm({
  locations,
  users
}: {
  locations: Option[];
  users: Option[];
}) {
  return (
    <ActionForm action={createContact} submitLabel="Create Contact" successMessage="Contact created">
      <ContactFields locations={locations} users={users} />
      <label><span>Initial Note</span><textarea name="notes" rows={4} /></label>
    </ActionForm>
  );
}

export function EditContactForm({
  contact,
  locations,
  users
}: {
  contact: ContactFormData;
  locations: Option[];
  users: Option[];
}) {
  return (
    <ActionForm action={updateContact} submitLabel="Save Contact" successMessage="Contact updated">
      <ContactFields contact={contact} locations={locations} users={users} />
    </ActionForm>
  );
}
