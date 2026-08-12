import { enrollmentKeyFor } from "./enrollment.ts";
import { computeRelativeWait } from "./waits.ts";
import type { DomainEvent, WorkflowDefinition, WorkflowEdge, WorkflowNode } from "./types.ts";

export type ProcessableWorkflow = {
  id: string;
  organization_id: string;
  status: string;
  active_version_id: string | null;
  enrollment_policy: "allow_multiple" | "one_per_contact" | "one_active_per_contact" | "one_per_triggering_record";
  location_scope: string;
  workflow_locations?: Array<{ location_id: string | null }> | null;
  workflow_versions?: { definition_json: WorkflowDefinition } | { definition_json: WorkflowDefinition }[] | null;
};

export function activeDefinition(workflow: ProcessableWorkflow) {
  const relation = Array.isArray(workflow.workflow_versions) ? workflow.workflow_versions[0] : workflow.workflow_versions;
  return relation?.definition_json ?? null;
}

export function workflowAllowsEventLocation(workflow: ProcessableWorkflow, event: DomainEvent) {
  if (workflow.location_scope !== "specific") return true;
  const locationIds = (workflow.workflow_locations ?? []).map((location) => location.location_id).filter(Boolean);
  return Boolean(event.locationId && locationIds.includes(event.locationId));
}

export function firstExecutableNode(definition: WorkflowDefinition) {
  const trigger = definition.nodes.find((node) => node.type === "trigger");
  if (!trigger) return null;
  const edge = definition.edges.find((item) => item.source === trigger.id);
  return edge ? definition.nodes.find((node) => node.id === edge.target) ?? null : null;
}

export function nextNode(definition: WorkflowDefinition, nodeId: string, labels: string[] = ["SUCCESS", "DEFAULT", "RESUME"]) {
  const upperLabels = labels.map((label) => label.toUpperCase());
  const edge: WorkflowEdge | undefined = definition.edges.find((item) => item.source === nodeId && upperLabels.includes(String(item.label ?? "DEFAULT").toUpperCase()))
    ?? definition.edges.find((item) => item.source === nodeId);
  return edge ? definition.nodes.find((node) => node.id === edge.target) ?? null : null;
}

export function buildEnrollmentPayload(workflow: ProcessableWorkflow, event: DomainEvent, eventId: string) {
  const enrollmentKey = enrollmentKeyFor(workflow.enrollment_policy, {
    contactId: event.contactId,
    triggeringEntityType: event.entityType,
    triggeringEntityId: event.entityId
  });

  return {
    organization_id: workflow.organization_id,
    workflow_id: workflow.id,
    workflow_version_id: workflow.active_version_id,
    contact_id: event.contactId ?? null,
    opportunity_id: event.opportunityId ?? null,
    appointment_id: event.appointmentId ?? null,
    sale_id: event.saleId ?? null,
    location_id: event.locationId ?? null,
    status: "active",
    enrollment_key: enrollmentKey,
    trigger_event_id: eventId,
    metadata: { trigger_event_type: event.eventType, trigger_payload: event.payload }
  };
}

export function jobRunAtForNode(node: WorkflowNode, now = new Date()) {
  if (node.type === "wait") {
    return computeRelativeWait(node.configuration, now);
  }
  return now;
}
