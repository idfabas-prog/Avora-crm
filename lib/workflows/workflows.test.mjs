import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCondition } from "./conditions.ts";
import { computeAppointmentRelativeWait, computeRelativeWait, applyQuietHours } from "./waits.ts";
import { validateWorkflowDefinition } from "./validation.ts";
import { enrollmentKeyFor, canReEnroll } from "./enrollment.ts";
import { actionIdempotencyKey, renderWorkflowMessage, shouldSkipSms } from "./actions.ts";
import { executeWorkflowTest } from "./engine.ts";
import { domainEventKey } from "./events.ts";
import { nextRetry, jobIdempotencyKey } from "./scheduler.ts";

test("matches condition operators", () => {
  assert.equal(evaluateCondition({ field: "contact.status", operator: "equals", value: "new_lead" }, { contact: { status: "new_lead" } }), true);
  assert.equal(evaluateCondition({ field: "sale.balance_due_cents", operator: "greater_than", value: 0 }, { sale: { balance_due_cents: 5000 } }), true);
  assert.equal(evaluateCondition({ field: "contact.tags", operator: "in", value: ["vip", "reactivation"] }, { contact: { tags: "vip" } }), true);
});

test("computes relative waits and appointment-relative waits", () => {
  const now = new Date("2026-08-12T12:00:00.000Z");
  assert.equal(computeRelativeWait({ amount: 1, unit: "day" }, now).toISOString(), "2026-08-13T12:00:00.000Z");
  assert.equal(computeAppointmentRelativeWait({ offset_amount: 24, offset_unit: "hour", direction: "before" }, new Date("2026-08-14T15:00:00.000Z")).toISOString(), "2026-08-13T15:00:00.000Z");
});

test("moves quiet-hour sends to next allowed morning", () => {
  const adjusted = applyQuietHours(new Date("2026-08-12T22:15:00"), { start: "20:00", end: "08:00" });
  assert.equal(adjusted.getHours(), 8);
  assert.equal(adjusted.getMinutes(), 0);
});

test("validates workflow shape before publish", () => {
  const valid = validateWorkflowDefinition({
    nodes: [
      { id: "trigger", type: "trigger", configuration: { trigger_type: "contact.created" } },
      { id: "sms", type: "action", configuration: { action_type: "send_sms", body: "Hi {{first_name}}" } }
    ],
    edges: [{ source: "trigger", target: "sms", label: "DEFAULT" }]
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.summary.smsActions, 1);

  const invalid = validateWorkflowDefinition({ nodes: [], edges: [] });
  assert.equal(invalid.ok, false);
});

test("validates Phase 12 reputation workflow triggers and actions", () => {
  const valid = validateWorkflowDefinition({
    nodes: [
      { id: "trigger", type: "trigger", configuration: { trigger_type: "reputation.feedback_negative" } },
      { id: "review", type: "action", configuration: { action_type: "create_review_request" } }
    ],
    edges: [{ source: "trigger", target: "review", label: "DEFAULT" }]
  });
  assert.equal(valid.ok, true);
});

test("validates Phase 14 campaign workflow triggers and actions", () => {
  const valid = validateWorkflowDefinition({
    nodes: [
      { id: "trigger", type: "trigger", configuration: { trigger_type: "campaign.delivered" } },
      { id: "suppress", type: "action", configuration: { action_type: "add_to_suppression_list", suppression_list_id: "list1" } }
    ],
    edges: [{ source: "trigger", target: "suppress", label: "DEFAULT" }]
  });
  assert.equal(valid.ok, true);
});

test("validates Phase 15 call workflow triggers with safe actions", () => {
  const valid = validateWorkflowDefinition({
    nodes: [
      { id: "trigger", type: "trigger", configuration: { trigger_type: "call.missed" } },
      { id: "sms", type: "action", configuration: { action_type: "send_sms", body: "Hi {{first_name}}, we missed your call.", simulated: true } },
      { id: "task", type: "action", configuration: { action_type: "create_task", title: "Call back {{first_name}}" } }
    ],
    edges: [
      { source: "trigger", target: "sms", label: "DEFAULT" },
      { source: "sms", target: "task", label: "SUCCESS" }
    ]
  });
  assert.equal(valid.ok, true);
});

test("validates Phase 17 expansion workflow triggers with safe actions", () => {
  const valid = validateWorkflowDefinition({
    nodes: [
      { id: "trigger", type: "trigger", configuration: { trigger_type: "expansion.checklist_overdue" } },
      { id: "task", type: "action", configuration: { action_type: "create_task", title: "Review launch blocker" } },
      { id: "checklist", type: "action", configuration: { action_type: "create_checklist_item", title: "Confirm remediation" } }
    ],
    edges: [
      { source: "trigger", target: "task", label: "DEFAULT" },
      { source: "task", target: "checklist", label: "SUCCESS" }
    ]
  });
  assert.equal(valid.ok, true);
});

test("enforces enrollment policy keys and re-enrollment behavior", () => {
  assert.equal(enrollmentKeyFor("one_active_per_contact", { contactId: "c1" }), "contact:c1");
  assert.equal(enrollmentKeyFor("one_per_triggering_record", { triggeringEntityType: "appointment", triggeringEntityId: "a1" }), "appointment:a1");
  assert.equal(canReEnroll("never", "completed"), false);
  assert.equal(canReEnroll("after_completion", "completed"), true);
});

test("builds action idempotency keys and skips opted-out SMS", () => {
  assert.equal(actionIdempotencyKey("e1", "sms1", 2), "workflow:e1:sms1:attempt:2");
  assert.equal(shouldSkipSms({ contact: { phone: "+13055550101", sms_preference: { opted_out: true } } }).skipped, true);
});

test("renders safe workflow merge variables", () => {
  const rendered = renderWorkflowMessage("Hi {{first_name}}, balance {{balance_due}}", { contact: { first_name: "Fictional" }, sale: { balance_due_cents: 12500 } });
  assert.equal(rendered.rendered, "Hi Fictional, balance $125.00");
  assert.deepEqual(rendered.missing, []);
});

test("executes test mode without sending live SMS", () => {
  const steps = executeWorkflowTest({
    nodes: [
      { id: "trigger", type: "trigger", configuration: { trigger_type: "manual.enrolled" } },
      { id: "sms", type: "action", configuration: { action_type: "send_sms", body: "Hi {{first_name}}" } },
      { id: "wait", type: "wait", configuration: { wait_type: "relative", amount: 1, unit: "day" } }
    ],
    edges: [
      { source: "trigger", target: "sms", label: "DEFAULT" },
      { source: "sms", target: "wait", label: "SUCCESS" }
    ]
  }, { contact: { first_name: "Avery", phone: "+13055550123" }, testMode: true });
  assert.equal(steps[1].message, "Simulated SMS: Hi Avery");
  assert.equal(steps[2].status, "waiting");
});

test("records event and job idempotency", () => {
  assert.equal(domainEventKey({ eventType: "contact.created", entityType: "contact", entityId: "c1", payload: {}, occurredAt: new Date("2026-08-12T00:00:00Z") }), "contact.created:contact:c1:2026-08-12T00:00:00.000Z");
  assert.equal(jobIdempotencyKey("e1", "wait1"), "workflow-job:e1:wait1");
});

test("uses retry policy and stops non-retryable failures", () => {
  assert.equal(nextRetry(1, "temporary").retry, true);
  assert.equal(nextRetry(1, "sms_opted_out").retry, false);
  assert.equal(nextRetry(3, "temporary").retry, false);
});
