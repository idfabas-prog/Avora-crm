import { createContactNote } from "@/app/actions";
import { ActionForm } from "@/components/crm/ActionForm";

export function NoteForm({ contactId }: { contactId: string }) {
  return (
    <ActionForm action={createContactNote} submitLabel="Add Note" successMessage="Note added">
      <input name="contact_id" type="hidden" value={contactId} />
      <label>
        <span>Note</span>
        <textarea name="body" required rows={4} />
      </label>
    </ActionForm>
  );
}
