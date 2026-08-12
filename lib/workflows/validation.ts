import { actionTypes, conditionOperators, triggerTypes, workflowNodeTypes, type WorkflowDefinition, type WorkflowNode } from "./types.ts";

export type WorkflowValidation = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  summary: {
    triggers: number;
    conditions: number;
    smsActions: number;
    waits: number;
    estimatedMaxDurationMinutes: number;
  };
};

function waitMinutes(node: WorkflowNode) {
  if (node.type !== "wait") return 0;
  const amount = Number(node.configuration.amount ?? node.configuration.timeout_amount ?? 0);
  const unit = String(node.configuration.unit ?? node.configuration.timeout_unit ?? "minute");
  if (unit.startsWith("day")) return amount * 1440;
  if (unit.startsWith("hour")) return amount * 60;
  return amount;
}

function hasCycle(definition: WorkflowDefinition) {
  const graph = new Map<string, string[]>();
  for (const edge of definition.edges) {
    graph.set(edge.source, [...(graph.get(edge.source) ?? []), edge.target]);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(nodeId: string): boolean {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visiting.add(nodeId);
    for (const next of graph.get(nodeId) ?? []) {
      if (visit(next)) return true;
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  }

  return [...graph.keys()].some(visit);
}

export function validateWorkflowDefinition(definition: WorkflowDefinition): WorkflowValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const nodes = definition.nodes ?? [];
  const edges = definition.edges ?? [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const triggers = nodes.filter((node) => node.type === "trigger");
  const conditions = nodes.filter((node) => node.type === "condition");
  const smsActions = nodes.filter((node) => node.type === "action" && ["send_sms", "use_sms_template"].includes(String(node.configuration.action_type)));
  const waits = nodes.filter((node) => node.type === "wait");

  if (triggers.length !== 1) errors.push("Workflow must have exactly one trigger.");

  for (const node of nodes) {
    if (!workflowNodeTypes.includes(node.type)) {
      errors.push(`Node '${node.id}' has unsupported type '${node.type}'.`);
    }
    if (node.type === "trigger" && !triggerTypes.includes(String(node.configuration.trigger_type) as never)) {
      errors.push(`Trigger '${node.id}' has unsupported trigger type.`);
    }
    if (node.type === "action" && !actionTypes.includes(String(node.configuration.action_type) as never)) {
      errors.push(`Action '${node.id}' has unsupported action type.`);
    }
    if (node.type === "condition") {
      const operator = String(node.configuration.operator ?? "");
      if (operator && !conditionOperators.includes(operator as never)) {
        errors.push(`Condition '${node.id}' has unsupported operator.`);
      }
    }
    if (node.type === "wait" && Number(node.configuration.amount ?? node.configuration.timeout_amount ?? node.configuration.offset_amount ?? 1) <= 0) {
      errors.push(`Wait '${node.id}' must use a positive value.`);
    }
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.source)) errors.push(`Edge references missing source '${edge.source}'.`);
    if (!nodeIds.has(edge.target)) errors.push(`Edge references missing destination '${edge.target}'.`);
  }

  for (const node of nodes) {
    if (node.type !== "trigger" && edges.every((edge) => edge.target !== node.id)) {
      warnings.push(`Node '${node.id}' is not reachable from another node.`);
    }
    if (!["stop", "goal"].includes(node.type) && edges.every((edge) => edge.source !== node.id)) {
      warnings.push(`Node '${node.id}' has no outgoing path.`);
    }
  }

  for (const condition of conditions) {
    const labels = edges.filter((edge) => edge.source === condition.id).map((edge) => (edge.label ?? "").toUpperCase());
    if (!labels.includes("YES") && !labels.includes("TRUE")) errors.push(`Condition '${condition.id}' needs a YES/TRUE branch.`);
    if (!labels.includes("NO") && !labels.includes("FALSE")) warnings.push(`Condition '${condition.id}' has no NO/FALSE branch.`);
  }

  if (hasCycle(definition)) {
    errors.push("Workflow contains a cycle. Cycles are not supported in Phase 5.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: {
      triggers: triggers.length,
      conditions: conditions.length,
      smsActions: smsActions.length,
      waits: waits.length,
      estimatedMaxDurationMinutes: waits.reduce((sum, node) => sum + waitMinutes(node), 0)
    }
  };
}
