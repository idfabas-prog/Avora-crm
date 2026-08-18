import { updateChecklistItemStatus, updateExpansionSiteStatus, updateExpansionStage } from "@/app/expansion-actions";
import { fromDbStatus } from "@/lib/crm/constants";

const stages = [
  "market_research",
  "site_search",
  "loi_negotiation",
  "lease_contract",
  "design",
  "permitting",
  "construction",
  "hiring",
  "training",
  "pre_launch_marketing",
  "soft_open",
  "open",
  "paused",
  "cancelled"
];

const checklistStatuses = ["not_started", "in_progress", "blocked", "complete", "not_applicable"];
const siteStatuses = ["considering", "preferred", "loi", "rejected", "selected"];

export function ExpansionStageForm({ projectId, currentStage }: { projectId: string; currentStage: string }) {
  return (
    <form action={updateExpansionStage} className="inline-form">
      <input name="project_id" type="hidden" value={projectId} />
      <select aria-label="Expansion stage" defaultValue={currentStage} name="stage">
        {stages.map((stage) => <option key={stage} value={stage}>{fromDbStatus(stage)}</option>)}
      </select>
      <button className="secondary-button" type="submit">Update Stage</button>
    </form>
  );
}

export function ChecklistStatusForm({
  itemId,
  projectId,
  currentStatus
}: {
  itemId: string;
  projectId: string;
  currentStatus: string;
}) {
  return (
    <form action={updateChecklistItemStatus} className="inline-form">
      <input name="checklist_item_id" type="hidden" value={itemId} />
      <input name="project_id" type="hidden" value={projectId} />
      <select aria-label="Checklist status" defaultValue={currentStatus} name="status">
        {checklistStatuses.map((status) => <option key={status} value={status}>{fromDbStatus(status)}</option>)}
      </select>
      <button className="secondary-button" type="submit">Save</button>
    </form>
  );
}

export function SiteStatusForm({
  siteId,
  projectId,
  currentStatus
}: {
  siteId: string;
  projectId: string;
  currentStatus: string;
}) {
  return (
    <form action={updateExpansionSiteStatus} className="inline-form">
      <input name="site_id" type="hidden" value={siteId} />
      <input name="project_id" type="hidden" value={projectId} />
      <select aria-label="Site status" defaultValue={currentStatus} name="status">
        {siteStatuses.map((status) => <option key={status} value={status}>{fromDbStatus(status)}</option>)}
      </select>
      <button className="secondary-button" type="submit">Save</button>
    </form>
  );
}
