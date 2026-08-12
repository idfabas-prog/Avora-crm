import { evaluateConditions } from "./conditions.ts";
import type { DomainEvent, WorkflowDefinition, WorkflowNode } from "./types.ts";

export function getTriggerNode(definition: WorkflowDefinition) {
  return definition.nodes.find((node) => node.type === "trigger") ?? null;
}

export function triggerMatches(node: WorkflowNode, event: DomainEvent) {
  if (node.type !== "trigger") return false;
  if (String(node.configuration.trigger_type) !== event.eventType) return false;
  return evaluateConditions(node.configuration.filters as never, { event, ...event.payload });
}

export function workflowMatchesEvent(definition: WorkflowDefinition, event: DomainEvent) {
  const trigger = getTriggerNode(definition);
  return Boolean(trigger && triggerMatches(trigger, event));
}
