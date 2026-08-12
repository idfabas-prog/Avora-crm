import { createOpportunity, moveOpportunityStage } from "@/app/actions";
import { ActionForm } from "@/components/crm/ActionForm";

type Option = { id: string; name: string };
type StageOption = Option & { pipeline_id: string };

export function AddOpportunityForm({
  contacts,
  pipelines,
  stages,
  locations,
  users
}: {
  contacts: Option[];
  pipelines: Option[];
  stages: StageOption[];
  locations: Option[];
  users: Option[];
}) {
  return (
    <ActionForm action={createOpportunity} submitLabel="Create Opportunity" successMessage="Opportunity created">
      <div className="form-grid two">
        <label><span>Contact</span><select name="contact_id" required>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></label>
        <label><span>Pipeline</span><select name="pipeline_id" required>{pipelines.map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}</select></label>
        <label><span>Stage</span><select name="stage_id" required>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></label>
        <label><span>Name</span><input name="name" required /></label>
        <label><span>Value</span><input inputMode="decimal" name="value" placeholder="9500" /></label>
        <label><span>Assigned Employee</span><select name="assigned_to"><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
        <label><span>Location</span><select name="location_id"><option value="">Unassigned</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <label><span>Status</span><select name="status" defaultValue="open"><option value="open">Open</option><option value="won">Won</option><option value="lost">Lost</option></select></label>
      </div>
    </ActionForm>
  );
}

export function StageMoveForm({
  opportunityId,
  stages,
  currentStageId
}: {
  opportunityId: string;
  stages: Option[];
  currentStageId: string;
}) {
  return (
    <form action={moveOpportunityStage} className="stage-move-form">
      <input name="opportunity_id" type="hidden" value={opportunityId} />
      <select aria-label="Move stage" defaultValue={currentStageId} name="stage_id">
        {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
      </select>
      <button type="submit">Move</button>
    </form>
  );
}
