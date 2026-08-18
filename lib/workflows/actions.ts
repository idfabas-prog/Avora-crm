import { renderSmsTemplate } from "../communications/templates.ts";
import type { ActionType, ExecutionContext, WorkflowNode } from "./types.ts";

export const mergeVariables = [
  "first_name",
  "last_name",
  "location_name",
  "appointment_date",
  "appointment_time",
  "appointment_type",
  "provider_name",
  "salesperson_name",
  "balance_due"
] as const;

function money(cents: unknown) {
  return new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" }).format(Number(cents ?? 0) / 100);
}

export function workflowMergeValues(context: ExecutionContext) {
  const appointmentStart = context.appointment?.start_at ? new Date(String(context.appointment.start_at)) : null;
  return {
    first_name: String(context.contact?.first_name ?? ""),
    last_name: String(context.contact?.last_name ?? ""),
    location_name: String(context.location?.name ?? ""),
    appointment_date: appointmentStart ? appointmentStart.toLocaleDateString("en-US") : "",
    appointment_time: appointmentStart ? appointmentStart.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "",
    appointment_type: String(context.appointment?.appointment_type ?? context.appointment?.type ?? ""),
    provider_name: String(context.provider?.full_name ?? ""),
    salesperson_name: String(context.salesperson?.full_name ?? ""),
    balance_due: money(context.sale?.balance_due_cents)
  };
}

export function renderWorkflowMessage(body: string, context: ExecutionContext) {
  return renderSmsTemplate(body, workflowMergeValues(context));
}

export function actionIdempotencyKey(enrollmentId: string, nodeId: string, attempt = 1) {
  return `workflow:${enrollmentId}:${nodeId}:attempt:${attempt}`;
}

export function previewAction(node: WorkflowNode) {
  const actionType = String(node.configuration.action_type ?? "send_internal_notification") as ActionType;
  if (actionType === "send_sms" || actionType === "use_sms_template") {
    return node.configuration.template_key
      ? `Send SMS using '${String(node.configuration.template_key)}' template.`
      : `Send SMS: '${String(node.configuration.body ?? "").slice(0, 90)}'.`;
  }
  if (actionType === "create_task" || actionType === "create_task_to_schedule_appointment") {
    return `Create task: '${String(node.configuration.title ?? "Untitled task")}'.`;
  }
  if (actionType === "create_checklist_item") {
    return `Create expansion checklist item: '${String(node.configuration.title ?? "Untitled item")}'.`;
  }
  if (actionType === "create_review_request") {
    return "Create an ethical review request after eligibility checks.";
  }
  if (actionType === "enroll_in_campaign") {
    return `Enroll contact in campaign '${String(node.configuration.campaign_id ?? "configured campaign")}'.`;
  }
  if (actionType === "add_to_suppression_list") {
    return `Add contact to suppression list '${String(node.configuration.suppression_list_id ?? "configured list")}'.`;
  }
  if (actionType === "remove_from_suppression_list") {
    return `Remove contact from suppression list '${String(node.configuration.suppression_list_id ?? "configured list")}'.`;
  }
  if (actionType === "send_portal_notification") {
    return `Send portal notification: '${String(node.configuration.title ?? "Notification")}'.`;
  }
  if (actionType === "create_internal_notification") {
    return `Create internal notification: '${String(node.configuration.title ?? "Notification")}'.`;
  }
  if (actionType === "update_opportunity_stage" || actionType === "mark_opportunity_sold_after_payment") {
    return `Update opportunity stage to '${String(node.configuration.target_stage ?? "configured stage")}'.`;
  }
  if (actionType === "stop_workflow") {
    return "Stop this workflow enrollment.";
  }
  return actionType.replaceAll("_", " ");
}

export function shouldSkipSms(context: ExecutionContext) {
  const preference = context.contact?.sms_preference as Record<string, unknown> | undefined;
  if (preference?.opted_out || preference?.allowed === false) {
    return { skipped: true, reason: "Contact is opted out of SMS" };
  }
  if (!context.contact?.phone) {
    return { skipped: true, reason: "Contact has no SMS-capable phone" };
  }
  return { skipped: false, reason: null };
}
