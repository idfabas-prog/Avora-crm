"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  addWorkflowNode,
  createWorkflow,
  duplicateWorkflow,
  manuallyEnrollContact,
  pauseWorkflow,
  publishWorkflow,
  reorderWorkflowNode,
  retryFailedEnrollment,
  runWorkflowTest,
  saveWorkflowDefinition,
  saveWorkflowSettings,
  stopWorkflowEnrollment
} from "@/app/workflow-actions";
import { ActionForm } from "@/components/crm/ActionForm";
import { actionTypes, categoryLabels, conditionOperators, libraryGroups, triggerLabels } from "@/lib/workflows/constants";
import type { WorkflowDefinition } from "@/lib/workflows/types";

type Option = { id: string; name: string };

export function CreateWorkflowForm() {
  return (
    <ActionForm action={createWorkflow} submitLabel="Create Workflow" successMessage="Workflow created">
      <div className="form-grid two">
        <label><span>Name</span><input name="name" required /></label>
        <label><span>Category</span><select name="category">{Object.entries(categoryLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label><span>Initial Trigger</span><select name="trigger_type">{Object.entries(triggerLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label><span>Location Scope</span><select name="location_scope"><option value="all">All Locations</option><option value="specific">Specific Locations</option></select></label>
        <label><span>Enrollment Policy</span><select name="enrollment_policy"><option value="one_active_per_contact">One active enrollment per contact</option><option value="one_per_contact">One enrollment per contact</option><option value="one_per_triggering_record">One per triggering record</option><option value="allow_multiple">Allow multiple</option></select></label>
        <label><span>Re-enrollment</span><select name="re_enrollment_policy"><option value="after_completion">After completion</option><option value="never">Never</option><option value="always">Always</option></select></label>
      </div>
      <label><span>Description</span><textarea name="description" rows={3} /></label>
    </ActionForm>
  );
}

export function WorkflowSettingsForm({
  workflow,
  locations,
  selectedLocationIds
}: {
  workflow: Record<string, string | number | boolean | null>;
  locations: Option[];
  selectedLocationIds: string[];
}) {
  return (
    <ActionForm action={saveWorkflowSettings} submitLabel="Save Settings" successMessage="Workflow settings saved">
      <input name="workflow_id" type="hidden" value={String(workflow.id)} />
      <div className="form-grid two">
        <label><span>Name</span><input defaultValue={String(workflow.name ?? "")} name="name" required /></label>
        <label><span>Category</span><select defaultValue={String(workflow.category ?? "custom")} name="category">{Object.entries(categoryLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label><span>Location Scope</span><select defaultValue={String(workflow.location_scope ?? "all")} name="location_scope"><option value="all">All Locations</option><option value="specific">Specific Locations</option></select></label>
        <label><span>Enrollment Policy</span><select defaultValue={String(workflow.enrollment_policy ?? "one_active_per_contact")} name="enrollment_policy"><option value="one_active_per_contact">One active enrollment per contact</option><option value="one_per_contact">One enrollment per contact</option><option value="one_per_triggering_record">One per triggering record</option><option value="allow_multiple">Allow multiple</option></select></label>
        <label><span>Re-enrollment</span><select defaultValue={String(workflow.re_enrollment_policy ?? "after_completion")} name="re_enrollment_policy"><option value="after_completion">After completion</option><option value="never">Never</option><option value="always">Always</option></select></label>
        <label><span>Failure Policy</span><select defaultValue={String(workflow.failure_policy ?? "retry_then_stop")} name="failure_policy"><option value="retry_then_stop">Retry then stop</option><option value="continue">Continue</option><option value="stop">Stop</option></select></label>
        <label><span>Max SMS / Minute</span><input defaultValue={String(workflow.max_sms_per_minute ?? 10)} min={1} name="max_sms_per_minute" required type="number" /></label>
        <label><span>Max Enrollments / Batch</span><input defaultValue={String(workflow.max_enrollments_per_batch ?? 100)} min={1} name="max_enrollments_per_batch" required type="number" /></label>
        <label><span>Quiet Hours Start</span><input defaultValue={String(workflow.quiet_hours_start ?? "20:00")} name="quiet_hours_start" required type="time" /></label>
        <label><span>Quiet Hours End</span><input defaultValue={String(workflow.quiet_hours_end ?? "08:00")} name="quiet_hours_end" required type="time" /></label>
      </div>
      <label><span>Description</span><textarea defaultValue={String(workflow.description ?? "")} name="description" rows={3} /></label>
      <fieldset className="checkbox-grid">
        <label className="checkbox-row"><input defaultChecked={Boolean(workflow.test_mode)} name="test_mode" type="checkbox" /> Keep communication actions in safe test/simulated mode</label>
        <label className="checkbox-row"><input defaultChecked={Boolean(workflow.respect_business_days)} name="respect_business_days" type="checkbox" /> Respect business-day scheduling</label>
      </fieldset>
      <fieldset className="checkbox-grid">
        <legend>Specific Locations</legend>
        {locations.map((location) => <label className="checkbox-row" key={location.id}><input defaultChecked={selectedLocationIds.includes(location.id)} name="location_ids" type="checkbox" value={location.id} /> {location.name}</label>)}
      </fieldset>
    </ActionForm>
  );
}

export function WorkflowDefinitionForm({ workflowId, definition }: { workflowId: string; definition: WorkflowDefinition }) {
  const [text, setText] = useState(() => JSON.stringify(definition, null, 2));
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  return (
    <form
      className="record-form"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        setError(null);
        const formData = new FormData(event.currentTarget);
        startTransition(async () => {
          try {
            await saveWorkflowDefinition(formData);
            setDirty(false);
            setMessage("Draft definition saved");
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Could not save definition");
          }
        });
      }}
    >
      <input name="workflow_id" type="hidden" value={workflowId} />
      <label><span>Versioned Definition JSON</span><textarea name="definition_json" onChange={(event) => { setDirty(true); setText(event.target.value); }} rows={22} value={text} /></label>
      {dirty ? <p className="quiet-text">Unsaved changes</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-success">{message}</p> : null}
      <button className="primary-button" disabled={pending} type="submit">{pending ? "Saving..." : "Save Draft"}</button>
    </form>
  );
}

export function AddWorkflowNodeForm({ workflowId }: { workflowId: string }) {
  const flattened = useMemo(() => libraryGroups.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label }))), []);
  return (
    <ActionForm action={addWorkflowNode} submitLabel="Add Node" successMessage="Node added">
      <input name="workflow_id" type="hidden" value={workflowId} />
      <div className="form-grid two">
        <label><span>Node Type</span><select name="node_type"><option value="trigger">Trigger</option><option value="action">Action</option><option value="wait">Wait</option><option value="condition">Condition</option><option value="goal">Goal</option><option value="stop">Stop</option></select></label>
        <label><span>Library Item</span><select name="library_key">{flattened.map((item) => <option key={`${item.type}-${item.key}`} value={item.key}>{item.group}: {item.label}</option>)}</select></label>
        <label><span>Wait Amount</span><input defaultValue="1" min={1} name="wait_amount" type="number" /></label>
        <label><span>Wait Unit</span><select name="wait_unit"><option value="minute">Minutes</option><option value="hour">Hours</option><option value="day">Days</option></select></label>
        <label><span>Condition Field</span><input defaultValue="contact.status" name="condition_field" /></label>
        <label><span>Condition Operator</span><select name="condition_operator">{conditionOperators.map((operator) => <option key={operator} value={operator}>{operator.replaceAll("_", " ")}</option>)}</select></label>
        <label><span>Condition Value</span><input name="condition_value" /></label>
        <label><span>Action Title</span><input name="title" placeholder="Create task title" /></label>
      </div>
      <label><span>SMS Body / Note Body</span><textarea name="body" rows={4} placeholder="Hi {{first_name}}, ..." /></label>
      <label><span>Target Stage</span><input name="target_stage" placeholder="Sold" /></label>
      <label><span>Goal / Stop Label</span><input name="label" /></label>
    </ActionForm>
  );
}

export function NodeReorderControls({ workflowId, nodeId }: { workflowId: string; nodeId: string }) {
  return (
    <div className="quick-actions">
      {(["up", "down"] as const).map((direction) => (
        <form action={reorderWorkflowNode} key={direction}>
          <input name="workflow_id" type="hidden" value={workflowId} />
          <input name="node_id" type="hidden" value={nodeId} />
          <input name="direction" type="hidden" value={direction} />
          <button type="submit">{direction === "up" ? "Move Up" : "Move Down"}</button>
        </form>
      ))}
    </div>
  );
}

export function WorkflowTopActions({ workflowId, status }: { workflowId: string; status: string }) {
  return (
    <div className="header-actions">
      <form action={publishWorkflow}>
        <input name="workflow_id" type="hidden" value={workflowId} />
        <button className="primary-button" type="submit">Publish</button>
      </form>
      <form action={pauseWorkflow}>
        <input name="workflow_id" type="hidden" value={workflowId} />
        <input name="status" type="hidden" value={status === "paused" ? "active" : "paused"} />
        <button className="secondary-button" type="submit">{status === "paused" ? "Resume" : "Pause"}</button>
      </form>
      <form action={pauseWorkflow}>
        <input name="workflow_id" type="hidden" value={workflowId} />
        <input name="status" type="hidden" value="archived" />
        <button className="secondary-button" type="submit">Archive</button>
      </form>
      <form action={duplicateWorkflow}>
        <input name="workflow_id" type="hidden" value={workflowId} />
        <button className="secondary-button" type="submit">Duplicate</button>
      </form>
    </div>
  );
}

export function WorkflowTestForm({ workflowId, contacts }: { workflowId: string; contacts: Option[] }) {
  return (
    <ActionForm action={runWorkflowTest} submitLabel="Run Test" successMessage="Workflow test completed">
      <input name="workflow_id" type="hidden" value={workflowId} />
      <label><span>Fictional Test Contact</span><select name="contact_id" required>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></label>
      <p className="quiet-text">Test mode simulates communication actions and records the exact step results without sending live SMS.</p>
    </ActionForm>
  );
}

export function ManualEnrollmentForm({ workflowId, contacts }: { workflowId: string; contacts: Option[] }) {
  return (
    <ActionForm action={manuallyEnrollContact} submitLabel="Enroll Contact" successMessage="Contact enrolled">
      <input name="workflow_id" type="hidden" value={workflowId} />
      <label><span>Contact</span><select name="contact_id" required>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></label>
      <label className="checkbox-row"><input name="confirm_enroll" required type="checkbox" value="yes" /> I understand this enrolls only the selected fictional/development contact.</label>
    </ActionForm>
  );
}

export function StopEnrollmentForm({ enrollmentId }: { enrollmentId: string }) {
  return (
    <ActionForm action={stopWorkflowEnrollment} submitLabel="Stop Enrollment" successMessage="Enrollment stopped">
      <input name="enrollment_id" type="hidden" value={enrollmentId} />
      <label><span>Reason</span><input name="reason" required /></label>
    </ActionForm>
  );
}

export function RetryEnrollmentForm({ enrollmentId }: { enrollmentId: string }) {
  return (
    <form action={retryFailedEnrollment}>
      <input name="enrollment_id" type="hidden" value={enrollmentId} />
      <button type="submit">Retry</button>
    </form>
  );
}

export function ActionTypeOptions() {
  return <>{actionTypes.map((action) => <option key={action} value={action}>{action.replaceAll("_", " ")}</option>)}</>;
}
