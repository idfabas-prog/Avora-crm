import {
  addInternalConversationNote,
  assignConversation,
  sendConversationSms,
  simulateInboundSms,
  updateConversationStatus
} from "@/app/communications-actions";
import { ActionForm } from "@/components/crm/ActionForm";

type UserOption = { id: string; name: string };
type TemplateOption = { id: string; name: string; body: string };

export function SmsComposer({
  conversationId,
  templates,
  optedOut
}: {
  conversationId: string;
  templates: TemplateOption[];
  optedOut: boolean;
}) {
  return (
    <ActionForm action={sendConversationSms} submitLabel="Send SMS" successMessage="Message queued">
      <input name="conversation_id" type="hidden" value={conversationId} />
      {optedOut ? <p className="form-error">This contact is opted out of SMS. Normal outbound SMS is blocked.</p> : null}
      <label>
        <span>Template</span>
        <select name="template_body" defaultValue="">
          <option value="">No template</option>
          {templates.map((template) => <option key={template.id} value={template.body}>{template.name}</option>)}
        </select>
      </label>
      <label><span>Message</span><textarea name="body" rows={4} /></label>
    </ActionForm>
  );
}

export function InternalNoteForm({ conversationId }: { conversationId: string }) {
  return (
    <ActionForm action={addInternalConversationNote} submitLabel="Add Internal Note" successMessage="Internal note added">
      <input name="conversation_id" type="hidden" value={conversationId} />
      <label><span>Internal Note</span><textarea name="body" required rows={3} /></label>
    </ActionForm>
  );
}

export function ConversationControls({
  conversationId,
  users,
  assignedUserId
}: {
  conversationId: string;
  users: UserOption[];
  assignedUserId: string | null;
}) {
  return (
    <div className="conversation-controls">
      <form action={assignConversation} className="stage-move-form">
        <input name="conversation_id" type="hidden" value={conversationId} />
        <select defaultValue={assignedUserId ?? ""} name="assigned_user_id">
          <option value="">Unassigned</option>
          {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
        </select>
        <button type="submit">Assign</button>
      </form>
      {["Open", "Pending", "Closed"].map((status) => (
        <form action={updateConversationStatus} key={status}>
          <input name="conversation_id" type="hidden" value={conversationId} />
          <input name="status" type="hidden" value={status} />
          <button type="submit">{status}</button>
        </form>
      ))}
    </div>
  );
}

export function DevelopmentSimulator({ conversationId }: { conversationId: string }) {
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  return (
    <details className="simulator-box">
      <summary>Development simulator</summary>
      <ActionForm action={simulateInboundSms} submitLabel="Simulate Inbound" successMessage="Inbound SMS simulated">
        <input name="conversation_id" type="hidden" value={conversationId} />
        <label><span>Inbound body</span><input name="body" defaultValue="Thanks, can you send me appointment times?" /></label>
      </ActionForm>
    </details>
  );
}
