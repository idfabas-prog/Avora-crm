export const workflowCategories = [
  "lead_nurture",
  "appointment",
  "sales",
  "treatment_follow_up",
  "reactivation",
  "payment",
  "internal_operations",
  "inventory",
  "expansion",
  "custom"
] as const;

export const workflowStatuses = ["draft", "active", "paused", "archived"] as const;
export const workflowVersionStatuses = ["draft", "published", "retired"] as const;
export const workflowNodeTypes = ["trigger", "action", "wait", "condition", "branch", "goal", "stop"] as const;

export const triggerTypes = [
  "contact.created",
  "contact.updated",
  "contact.tag_added",
  "contact.status_changed",
  "opportunity.created",
  "opportunity.stage_changed",
  "opportunity.won",
  "opportunity.lost",
  "appointment.created",
  "appointment.confirmed",
  "appointment.checked_in",
  "appointment.completed",
  "appointment.cancelled",
  "appointment.no_show",
  "appointment.rescheduled",
  "conversation.inbound_sms_received",
  "conversation.assigned",
  "conversation.closed",
  "call.inbound_started",
  "call.outbound_started",
  "call.answered",
  "call.completed",
  "call.missed",
  "call.voicemail",
  "call.followup_needed",
  "call.booked",
  "call.sale_attributed",
  "call.recording_available",
  "call.transcript_ready",
  "task.created",
  "task.completed",
  "sale.created",
  "sale.paid",
  "payment.succeeded",
  "payment.failed",
  "refund.completed",
  "balance.created",
  "treatment.session_created",
  "treatment.started",
  "treatment.completed",
  "treatment.cancelled",
  "treatment.no_show",
  "treatment.followup_due",
  "treatment.plan_completed",
  "entitlement.remaining_low",
  "entitlement.exhausted",
  "consent.signed",
  "clinical.photo_added",
  "reputation.review_request_eligible",
  "reputation.review_request_sent",
  "reputation.review_completed",
  "reputation.feedback_negative",
  "reputation.feedback_resolved",
  "referral.created",
  "referral.booked",
  "referral.sold",
  "referral.reward_earned",
  "referral.reward_issued",
  "reactivation.enrolled",
  "reactivation.booked",
  "reactivation.sold",
  "reactivation.completed",
  "patient.inactive_90_days",
  "patient.inactive_180_days",
  "package.near_exhaustion",
  "membership.cancelled",
  "campaign.recipient_scheduled",
  "campaign.sent",
  "campaign.delivered",
  "campaign.replied",
  "campaign.booked",
  "campaign.sold",
  "campaign.failed",
  "campaign.skipped",
  "expansion.project_created",
  "expansion.stage_changed",
  "expansion.site_selected",
  "expansion.checklist_overdue",
  "expansion.readiness_threshold",
  "expansion.location_created",
  "expansion.opened",
  "territory.assigned",
  "territory.overlap_detected",
  "brand_audit.completed",
  "brand_audit.remediation_needed",
  "manual.enrolled"
] as const;

export const conditionOperators = [
  "equals",
  "not_equals",
  "contains",
  "does_not_contain",
  "greater_than",
  "less_than",
  "greater_than_or_equal",
  "less_than_or_equal",
  "is_empty",
  "is_not_empty",
  "in",
  "not_in"
] as const;

export const actionTypes = [
  "send_sms",
  "add_internal_note",
  "send_internal_notification",
  "use_sms_template",
  "update_contact_status",
  "add_tag",
  "remove_tag",
  "assign_contact",
  "create_opportunity",
  "update_opportunity_stage",
  "assign_opportunity",
  "create_task_to_schedule_appointment",
  "update_appointment_status",
  "create_task",
  "send_portal_notification",
  "create_internal_notification",
  "create_checklist_item",
  "create_review_request",
  "enroll_in_campaign",
  "add_to_suppression_list",
  "remove_from_suppression_list",
  "assign_task",
  "complete_task",
  "assign_conversation",
  "close_conversation",
  "reopen_conversation",
  "create_internal_task_after_payment",
  "create_clinical_followup_task",
  "create_appointment_task",
  "notify_provider",
  "mark_opportunity_sold_after_payment",
  "enroll_workflow",
  "remove_from_workflow",
  "stop_workflow"
] as const;

export type WorkflowCategory = (typeof workflowCategories)[number];
export type WorkflowStatus = (typeof workflowStatuses)[number];
export type WorkflowVersionStatus = (typeof workflowVersionStatuses)[number];
export type WorkflowNodeType = (typeof workflowNodeTypes)[number];
export type TriggerType = (typeof triggerTypes)[number];
export type ConditionOperator = (typeof conditionOperators)[number];
export type ActionType = (typeof actionTypes)[number];

export type WorkflowCondition = {
  field: string;
  operator: ConditionOperator;
  value?: unknown;
};

export type WorkflowNode = {
  id: string;
  type: WorkflowNodeType;
  position?: { x: number; y: number };
  configuration: Record<string, unknown>;
};

export type WorkflowEdge = {
  source: string;
  target: string;
  label?: string;
};

export type WorkflowDefinition = {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
};

export type DomainEvent = {
  eventType: TriggerType | string;
  entityType: string;
  entityId?: string | null;
  organizationId?: string | null;
  locationId?: string | null;
  contactId?: string | null;
  opportunityId?: string | null;
  appointmentId?: string | null;
  saleId?: string | null;
  payload: Record<string, unknown>;
  occurredAt?: Date;
};

export type ExecutionContext = {
  event?: DomainEvent;
  contact?: Record<string, unknown>;
  opportunity?: Record<string, unknown>;
  appointment?: Record<string, unknown>;
  payment?: Record<string, unknown>;
  sale?: Record<string, unknown>;
  conversation?: Record<string, unknown>;
  location?: Record<string, unknown>;
  provider?: Record<string, unknown>;
  salesperson?: Record<string, unknown>;
  now?: Date;
  testMode?: boolean;
};

export type StepResult = {
  nodeId: string;
  nodeType: WorkflowNodeType;
  status: "completed" | "waiting" | "skipped" | "failed" | "stopped";
  label?: string;
  message: string;
  output?: Record<string, unknown>;
  nextNodeId?: string | null;
};
