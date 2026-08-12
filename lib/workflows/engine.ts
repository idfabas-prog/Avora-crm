import { previewAction, renderWorkflowMessage, shouldSkipSms } from "./actions.ts";
import { evaluateOperator } from "./conditions.ts";
import { describeWait } from "./waits.ts";
import type { ExecutionContext, StepResult, WorkflowDefinition, WorkflowEdge, WorkflowNode } from "./types.ts";

function nextEdge(edges: WorkflowEdge[], nodeId: string, labels: string[]) {
  const upperLabels = labels.map((label) => label.toUpperCase());
  return edges.find((edge) => edge.source === nodeId && upperLabels.includes(String(edge.label ?? "DEFAULT").toUpperCase()))
    ?? edges.find((edge) => edge.source === nodeId);
}

function nodeTitle(node: WorkflowNode) {
  return String(node.configuration.label ?? node.configuration.action_type ?? node.configuration.trigger_type ?? node.type);
}

export function workflowSummary(definition: WorkflowDefinition) {
  return {
    trigger: definition.nodes.find((node) => node.type === "trigger")?.configuration.trigger_type ?? "No trigger",
    conditions: definition.nodes.filter((node) => node.type === "condition").length,
    smsActions: definition.nodes.filter((node) => node.type === "action" && ["send_sms", "use_sms_template"].includes(String(node.configuration.action_type))).length,
    waits: definition.nodes.filter((node) => node.type === "wait").length,
    actions: definition.nodes.filter((node) => node.type === "action").length
  };
}

export function executeWorkflowTest(definition: WorkflowDefinition, context: ExecutionContext) {
  const steps: StepResult[] = [];
  const trigger = definition.nodes.find((node) => node.type === "trigger");
  if (!trigger) {
    return [{ nodeId: "missing-trigger", nodeType: "stop" as const, status: "failed" as const, message: "Workflow has no trigger." }];
  }

  const nodes = new Map(definition.nodes.map((node) => [node.id, node]));
  let current: WorkflowNode | undefined = trigger;
  const seen = new Set<string>();

  while (current && !seen.has(current.id) && steps.length < 100) {
    seen.add(current.id);
    let result: StepResult;
    let labels = ["DEFAULT", "SUCCESS"];

    if (current.type === "trigger") {
      result = { nodeId: current.id, nodeType: current.type, status: "completed", message: `Trigger matched: ${String(current.configuration.trigger_type)}.` };
    } else if (current.type === "condition") {
      const passed = evaluateOperator(contextValue(context, String(current.configuration.field)), String(current.configuration.operator ?? "equals") as never, current.configuration.value);
      labels = passed ? ["YES", "TRUE"] : ["NO", "FALSE"];
      result = { nodeId: current.id, nodeType: current.type, status: "completed", label: labels[0], message: `Condition ${passed ? "passed" : "did not pass"}: ${String(current.configuration.field)} ${String(current.configuration.operator)}.` };
    } else if (current.type === "wait") {
      result = { nodeId: current.id, nodeType: current.type, status: "waiting", message: `${describeWait(current.configuration)}. Test mode records the schedule without sleeping.`, output: { simulated: true } };
      labels = ["RESUME", "SUCCESS", "DEFAULT"];
    } else if (current.type === "action") {
      const actionType = String(current.configuration.action_type);
      if (actionType === "send_sms" || actionType === "use_sms_template") {
        const skip = shouldSkipSms(context);
        if (skip.skipped) {
          result = { nodeId: current.id, nodeType: current.type, status: "skipped", message: `SMS skipped: ${skip.reason}.`, output: { reason: skip.reason } };
        } else {
          const body = String(current.configuration.body ?? "");
          const rendered = renderWorkflowMessage(body, context);
          result = {
            nodeId: current.id,
            nodeType: current.type,
            status: rendered.missing.length ? "failed" : "completed",
            message: rendered.missing.length ? `SMS template missing: ${rendered.missing.join(", ")}.` : `Simulated SMS: ${rendered.rendered}`,
            output: { simulated: true, missing: rendered.missing }
          };
          if (rendered.missing.length) labels = ["FAILED"];
        }
      } else {
        result = { nodeId: current.id, nodeType: current.type, status: "completed", message: previewAction(current), output: { simulated: true } };
      }
    } else if (current.type === "goal") {
      result = { nodeId: current.id, nodeType: current.type, status: "completed", message: `Goal reached: ${nodeTitle(current)}.` };
    } else if (current.type === "stop") {
      result = { nodeId: current.id, nodeType: current.type, status: "stopped", message: `Workflow stopped: ${nodeTitle(current)}.` };
    } else {
      result = { nodeId: current.id, nodeType: current.type, status: "completed", message: nodeTitle(current) };
    }

    const edge = nextEdge(definition.edges, current.id, labels);
    result.nextNodeId = edge?.target ?? null;
    steps.push(result);
    if (current.type === "stop" || result.status === "failed") break;
    current = edge?.target ? nodes.get(edge.target) : undefined;
  }

  return steps;
}

function contextValue(context: ExecutionContext, field: string) {
  return field.split(".").reduce<unknown>((current, key) => {
    if (current && typeof current === "object" && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, context);
}
