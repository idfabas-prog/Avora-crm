import test from "node:test";
import assert from "node:assert/strict";
import { buildPaymentPlanSchedule, summarizePaymentPlan } from "./payment-plans.ts";
import { summarizeMembershipBenefits, isMembershipBillableInDemo } from "./memberships.ts";
import { hasPortalPermission } from "./permissions.ts";

test("builds a payment-plan schedule that exactly matches financed balance", () => {
  const schedule = buildPaymentPlanSchedule({
    totalAmountCents: 100000,
    downPaymentCents: 10000,
    installmentCount: 3,
    frequency: "monthly",
    startDate: "2026-08-15"
  });

  assert.equal(schedule.length, 3);
  assert.equal(schedule.reduce((sum, item) => sum + item.amountCents, 0), 90000);
  assert.deepEqual(schedule.map((item) => item.amountCents), [30000, 30000, 30000]);
});

test("puts uneven payment-plan cents on the final installment", () => {
  const schedule = buildPaymentPlanSchedule({
    totalAmountCents: 10000,
    downPaymentCents: 0,
    installmentCount: 3,
    frequency: "weekly",
    startDate: "2026-08-15"
  });

  assert.deepEqual(schedule.map((item) => item.amountCents), [3333, 3333, 3334]);
});

test("summarizes payment-plan balances and failures", () => {
  const summary = summarizePaymentPlan([
    { amount_cents: 1000, status: "paid" },
    { amount_cents: 2000, status: "due" },
    { amount_cents: 3000, status: "failed" }
  ]);

  assert.equal(summary.paidCents, 1000);
  assert.equal(summary.remainingCents, 5000);
  assert.equal(summary.failedCount, 1);
});

test("membership benefit ledger preserves grants and uses", () => {
  const summary = summarizeMembershipBenefits([
    { benefit_key: "botox_credit", event_type: "grant", quantity: 1 },
    { benefit_key: "botox_credit", event_type: "use", quantity: -1 },
    { benefit_key: "priority_booking", event_type: "grant", quantity: 1 }
  ]);

  assert.deepEqual(summary, [
    { benefitKey: "botox_credit", remaining: 0 },
    { benefitKey: "priority_booking", remaining: 1 }
  ]);
});

test("portal permissions separate staff roles", () => {
  assert.equal(hasPortalPermission({ role: "owner" }, "portal.manage"), true);
  assert.equal(hasPortalPermission({ role: "salesperson" }, "portal.manage"), false);
  assert.equal(hasPortalPermission({ role: "provider" }, "payment_plans.manage"), false);
});

test("recurring billing stays simulated outside production mode", () => {
  assert.equal(isMembershipBillableInDemo("development"), true);
  assert.equal(isMembershipBillableInDemo(undefined), true);
  assert.equal(isMembershipBillableInDemo("production"), false);
});
