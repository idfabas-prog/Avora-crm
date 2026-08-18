import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCondition, evaluateSegment, validateSegmentRules } from "./evaluator.ts";
import { daysSince, segmentFields, segmentOperators } from "./fields.ts";
import { hasSegmentPermission, segmentLocationAllowed } from "./permissions.ts";

test("exposes supported segment fields and operators", () => {
  assert.equal(segmentFields.some((field) => field.key === "sms_opted_out"), true);
  assert.equal(segmentFields.some((field) => field.key === "last_appointment_days"), true);
  assert.equal(segmentOperators.includes("more_than_days_ago"), true);
});

test("validates and evaluates nested segment rules", () => {
  const rules = {
    logic: "and",
    conditions: [
      { field: "sms_opted_out", operator: "equals", value: false },
      {
        logic: "or",
        conditions: [
          { field: "tags", operator: "contains", value: "vip" },
          { field: "lifetime_collected_cents", operator: "greater_than", value: 100000 }
        ]
      }
    ]
  };
  assert.equal(validateSegmentRules(rules), true);
  assert.equal(evaluateSegment(rules, { id: "c1", smsOptedOut: false, tags: ["vip"], lifetimeCollectedCents: 0 }, new Date("2026-08-14")).matched, true);
  assert.equal(evaluateSegment(rules, { id: "c1", smsOptedOut: true, tags: ["vip"], lifetimeCollectedCents: 0 }, new Date("2026-08-14")).matched, false);
});

test("supports date-relative and empty operators", () => {
  const now = new Date("2026-08-14T12:00:00Z");
  assert.equal(daysSince("2026-08-01T12:00:00Z", now), 13);
  assert.equal(evaluateCondition({ field: "last_appointment_at", operator: "more_than_days_ago", value: 7 }, { id: "c1", lastAppointmentAt: "2026-08-01T12:00:00Z" }, now).matched, true);
  assert.equal(evaluateCondition({ field: "phone", operator: "is_not_empty" }, { id: "c1", phone: "+13055550101" }, now).matched, true);
});

test("keeps segment permissions and location scope tight", () => {
  assert.equal(hasSegmentPermission({ role: "manager" }, "segments.manage"), true);
  assert.equal(hasSegmentPermission({ role: "salesperson" }, "segments.manage"), false);
  assert.equal(segmentLocationAllowed({ role: "manager", locations: [{ id: "l1" }, { id: "l2" }] }, "l2"), true);
  assert.equal(segmentLocationAllowed({ role: "manager", locations: [{ id: "l1" }] }, "l2"), false);
});
