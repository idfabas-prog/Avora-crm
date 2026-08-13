import test from "node:test";
import assert from "node:assert/strict";
import { calculateEntitlementUsage, canExposeClinicalDetail, isNoteEditable, nextSessionNumber, planProgress, shouldConsumeEntitlement } from "./entitlements.ts";

test("calculates entitlement use and remaining sessions from immutable events", () => {
  const result = calculateEntitlementUsage(3, [
    { eventType: "grant", quantity: 3 },
    { eventType: "use", quantity: 1, treatmentSessionId: "session-1" }
  ]);
  assert.equal(result.usedQuantity, 1);
  assert.equal(result.remainingQuantity, 2);
});

test("cancelled and no-show sessions do not consume entitlement", () => {
  assert.equal(shouldConsumeEntitlement("completed"), true);
  assert.equal(shouldConsumeEntitlement("cancelled"), false);
  assert.equal(shouldConsumeEntitlement("no_show"), false);
});

test("restores and complimentary adjustments preserve clinical history", () => {
  const result = calculateEntitlementUsage(3, [
    { eventType: "use", quantity: 2 },
    { eventType: "restore", quantity: 1 },
    { eventType: "adjustment", quantity: 1 }
  ]);
  assert.equal(result.usedQuantity, 1);
  assert.equal(result.remainingQuantity, 3);
});

test("calculates plan progress from sessions", () => {
  assert.deepEqual(planProgress(4, 2), { planned: 4, completed: 2, remaining: 2, percent: 50 });
  assert.equal(nextSessionNumber(2), 3);
});

test("locked notes require addenda and salespeople cannot see clinical details", () => {
  assert.equal(isNoteEditable(null), true);
  assert.equal(isNoteEditable("2026-08-12T10:00:00Z"), false);
  assert.equal(canExposeClinicalDetail("salesperson"), false);
  assert.equal(canExposeClinicalDetail("provider"), true);
});
