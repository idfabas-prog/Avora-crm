import { actionTypes, conditionOperators, triggerTypes, workflowCategories, workflowNodeTypes } from "./types.ts";

export const categoryLabels: Record<string, string> = {
  lead_nurture: "Lead Nurture",
  appointment: "Appointment",
  sales: "Sales",
  treatment_follow_up: "Treatment Follow-Up",
  reactivation: "Reactivation",
  payment: "Payment",
  internal_operations: "Internal Operations",
  inventory: "Inventory",
  expansion: "Expansion",
  custom: "Custom"
};

export const statusLabels: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  archived: "Archived",
  waiting: "Waiting",
  completed: "Completed",
  stopped: "Stopped",
  failed: "Failed",
  cancelled: "Cancelled"
};

export const nodeLabels: Record<string, string> = {
  trigger: "Trigger",
  action: "Action",
  wait: "Wait",
  condition: "Condition",
  branch: "Branch",
  goal: "Goal",
  stop: "Stop"
};

export const actionLabels: Record<string, string> = {
  send_sms: "Send SMS",
  add_internal_note: "Add Internal Note",
  send_internal_notification: "Send Internal Notification",
  use_sms_template: "Use SMS Template",
  update_contact_status: "Update Contact Status",
  add_tag: "Add Tag",
  remove_tag: "Remove Tag",
  assign_contact: "Assign Contact",
  create_opportunity: "Create Opportunity",
  update_opportunity_stage: "Update Opportunity Stage",
  assign_opportunity: "Assign Opportunity",
  create_task_to_schedule_appointment: "Create Task to Schedule Appointment",
  update_appointment_status: "Update Appointment Status",
  create_task: "Create Task",
  create_checklist_item: "Create Checklist Item",
  send_portal_notification: "Send Portal Notification",
  create_internal_notification: "Create Internal Notification",
  create_review_request: "Create Review Request",
  enroll_in_campaign: "Enroll in Campaign",
  add_to_suppression_list: "Add to Suppression List",
  remove_from_suppression_list: "Remove from Suppression List",
  assign_task: "Assign Task",
  complete_task: "Complete Task",
  assign_conversation: "Assign Conversation",
  close_conversation: "Close Conversation",
  reopen_conversation: "Reopen Conversation",
  create_internal_task_after_payment: "Create Internal Task After Payment",
  mark_opportunity_sold_after_payment: "Mark Opportunity Sold After Payment",
  enroll_workflow: "Enroll in Another Workflow",
  remove_from_workflow: "Remove from Workflow",
  stop_workflow: "Stop Workflow"
};

export const triggerLabels = Object.fromEntries(triggerTypes.map((type) => [type, type.split(".").map((part) => part.replaceAll("_", " ")).join(" - ")]));
export const operatorLabels = Object.fromEntries(conditionOperators.map((operator) => [operator, operator.replaceAll("_", " ")]));

export const libraryGroups = [
  { label: "Triggers", items: triggerTypes.map((type) => ({ type: "trigger", key: type, label: triggerLabels[type] })) },
  { label: "Communication", items: ["send_sms", "use_sms_template", "add_internal_note", "send_internal_notification"].map((key) => ({ type: "action", key, label: actionLabels[key] })) },
  { label: "Campaigns", items: ["enroll_in_campaign", "add_to_suppression_list", "remove_from_suppression_list"].map((key) => ({ type: "action", key, label: actionLabels[key] })) },
  { label: "Reputation", items: ["create_review_request", "create_task", "send_portal_notification", "create_internal_notification"].map((key) => ({ type: "action", key, label: actionLabels[key] })) },
  { label: "CRM", items: ["update_contact_status", "add_tag", "remove_tag", "assign_contact", "create_opportunity", "update_opportunity_stage", "assign_opportunity"].map((key) => ({ type: "action", key, label: actionLabels[key] })) },
  { label: "Appointments", items: ["create_task_to_schedule_appointment", "update_appointment_status"].map((key) => ({ type: "action", key, label: actionLabels[key] })) },
  { label: "Sales", items: ["create_internal_task_after_payment", "mark_opportunity_sold_after_payment"].map((key) => ({ type: "action", key, label: actionLabels[key] })) },
  { label: "Expansion", items: ["create_task", "assign_task", "send_internal_notification", "create_checklist_item"].map((key) => ({ type: "action", key, label: actionLabels[key] })) },
  { label: "Tasks", items: ["create_task", "assign_task", "complete_task"].map((key) => ({ type: "action", key, label: actionLabels[key] })) },
  { label: "Logic", items: workflowNodeTypes.filter((type) => ["condition", "branch", "goal", "stop"].includes(type)).map((type) => ({ type, key: type, label: nodeLabels[type] })) },
  { label: "Timing", items: [{ type: "wait", key: "relative", label: "Wait" }, { type: "wait", key: "appointment_relative", label: "Wait Until Appointment Time" }, { type: "wait", key: "wait_for_condition", label: "Wait for Condition" }] },
  { label: "Workflow", items: ["enroll_workflow", "remove_from_workflow", "stop_workflow"].map((key) => ({ type: "action", key, label: actionLabels[key] })) }
];

export { actionTypes, conditionOperators, triggerTypes, workflowCategories };
