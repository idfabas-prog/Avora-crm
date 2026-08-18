"use client";

import { ActionForm } from "./ActionForm";
import { addCallNote, assignMissedCallCallback, createSimulatedOutboundCall, progressCallListMember, updateCallDisposition } from "@/app/call-actions";

export function ClickToCallForm({
  contacts,
  locations,
  defaultContactId,
  defaultPhone
}: {
  contacts: Array<{ id: string; name: string; phone: string | null }>;
  locations: Array<{ id: string; name: string }>;
  defaultContactId?: string;
  defaultPhone?: string | null;
}) {
  return (
    <ActionForm action={createSimulatedOutboundCall} submitLabel="Create Simulated Call" successMessage="Simulated call queued.">
      <input name="idempotency_key" type="hidden" value={`click-to-call-${defaultContactId ?? defaultPhone ?? "manual"}`} />
      <label>
        <span>Contact</span>
        <select name="contact_id" defaultValue={defaultContactId ?? ""}>
          <option value="">Manual number</option>
          {contacts.map((contact) => (
            <option key={contact.id} value={contact.id}>{contact.name}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Manual Number</span>
        <input name="to_number" placeholder="(305) 555-0148" defaultValue={defaultPhone ?? ""} />
      </label>
      <label>
        <span>From Number</span>
        <input name="from_number" defaultValue="+13055550101" />
      </label>
      <label>
        <span>Location</span>
        <select name="location_id">
          <option value="">Contact default</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>{location.name}</option>
          ))}
        </select>
      </label>
    </ActionForm>
  );
}

export function CallDispositionForm({
  callId,
  dispositions,
  currentDisposition
}: {
  callId: string;
  dispositions: Array<{ id: string; name: string }>;
  currentDisposition?: string | null;
}) {
  return (
    <ActionForm action={updateCallDisposition} submitLabel="Update Disposition" successMessage="Disposition updated.">
      <input name="call_id" type="hidden" value={callId} />
      <label>
        <span>Disposition</span>
        <select name="disposition_id" defaultValue="">
          <option value="">Choose disposition</option>
          {dispositions.map((disposition) => (
            <option key={disposition.id} value={disposition.id}>{disposition.name}</option>
          ))}
        </select>
      </label>
      {currentDisposition ? <input name="disposition" type="hidden" value={currentDisposition} /> : null}
    </ActionForm>
  );
}

export function AssignMissedCallForm({ callId, users }: { callId: string; users: Array<{ id: string; name: string }> }) {
  return (
    <ActionForm action={assignMissedCallCallback} submitLabel="Assign Callback" successMessage="Callback assigned.">
      <input name="call_id" type="hidden" value={callId} />
      <label>
        <span>Owner</span>
        <select name="assigned_to">
          {users.map((user) => (
            <option key={user.id} value={user.id}>{user.name}</option>
          ))}
        </select>
      </label>
    </ActionForm>
  );
}

export function CallNoteForm({ callId, contactId }: { callId: string; contactId?: string | null }) {
  return (
    <ActionForm action={addCallNote} submitLabel="Add Note" successMessage="Call note added.">
      <input name="call_id" type="hidden" value={callId} />
      {contactId ? <input name="contact_id" type="hidden" value={contactId} /> : null}
      <label>
        <span>Note</span>
        <textarea name="body" rows={4} placeholder="Add a non-clinical call note" />
      </label>
    </ActionForm>
  );
}

export function CallListProgressForm({
  callListId,
  contactId,
  currentStatus
}: {
  callListId: string;
  contactId: string;
  currentStatus: string;
}) {
  return (
    <ActionForm action={progressCallListMember} submitLabel="Update Status" successMessage="Call list status updated.">
      <input name="call_list_id" type="hidden" value={callListId} />
      <input name="contact_id" type="hidden" value={contactId} />
      <label>
        <span>Status</span>
        <select name="status" defaultValue={currentStatus}>
          <option value="pending">Pending</option>
          <option value="called">Called</option>
          <option value="connected">Connected</option>
          <option value="no_answer">No Answer</option>
          <option value="skipped">Skipped</option>
          <option value="completed">Completed</option>
        </select>
      </label>
    </ActionForm>
  );
}
