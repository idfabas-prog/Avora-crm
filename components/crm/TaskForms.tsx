import { createTask, updateTaskStatus } from "@/app/actions";
import { ActionForm } from "@/components/crm/ActionForm";
import { taskStatuses } from "@/lib/crm/constants";

type Option = { id: string; name: string };

export function AddTaskForm({
  contacts,
  opportunities,
  locations,
  users,
  contactId
}: {
  contacts: Option[];
  opportunities: Option[];
  locations: Option[];
  users: Option[];
  contactId?: string;
}) {
  return (
    <ActionForm action={createTask} submitLabel="Create Task" successMessage="Task created">
      <div className="form-grid two">
        <label><span>Title</span><input name="title" required /></label>
        <label><span>Assigned Employee</span><select name="assigned_to"><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
        <label><span>Contact</span><select defaultValue={contactId ?? ""} name="contact_id"><option value="">None</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></label>
        <label><span>Opportunity</span><select name="opportunity_id"><option value="">None</option>{opportunities.map((opportunity) => <option key={opportunity.id} value={opportunity.id}>{opportunity.name}</option>)}</select></label>
        <label><span>Location</span><select name="location_id"><option value="">None</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <label><span>Due</span><input name="due_at" type="datetime-local" /></label>
        <label><span>Status</span><select name="status">{taskStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
      </div>
    </ActionForm>
  );
}

export function TaskStatusForm({ taskId, currentStatus }: { taskId: string; currentStatus: string }) {
  return (
    <form action={updateTaskStatus} className="stage-move-form">
      <input name="task_id" type="hidden" value={taskId} />
      <select defaultValue={currentStatus} name="status">
        {taskStatuses.map((status) => <option key={status}>{status}</option>)}
      </select>
      <button type="submit">Update</button>
    </form>
  );
}
