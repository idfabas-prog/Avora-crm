import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateCsat,
  calculateNps,
  eligibleForReview,
  npsCategory,
  referralConversionRate,
  referralNetContribution,
  reactivationPriority,
  reviewResponseRate,
  reviewTemplateAvoidsGating,
  rewardLedgerBalance,
  shouldEscalateFeedback
} from "./metrics.ts";
import { hasReputationPermission, reputationLocationAllowed } from "./permissions.ts";

const owner = { role: "owner", locations: [{ id: "miami" }] };
const manager = { role: "manager", locations: [{ id: "miami" }] };
const salesperson = { role: "salesperson", locations: [{ id: "tampa" }] };
const provider = { role: "provider", locations: [{ id: "miami" }] };

test("NPS classification and calculation follow standard categories", () => {
  assert.equal(npsCategory(6), "detractor");
  assert.equal(npsCategory(8), "passive");
  assert.equal(npsCategory(9), "promoter");
  assert.deepEqual(calculateNps([10, 9, 8, 6, 4]), { score: 0, promoters: 2, passives: 1, detractors: 2, count: 5 });
});

test("CSAT and response-rate calculations are deterministic", () => {
  assert.equal(calculateCsat([5, 4, 2]).average, 11 / 3);
  assert.equal(Math.round(calculateCsat([5, 4, 2]).positivePercent), 67);
  assert.equal(reviewResponseRate(8, 2), 25);
});

test("negative feedback escalation is threshold based", () => {
  assert.equal(shouldEscalateFeedback({ score: 6 }), true);
  assert.equal(shouldEscalateFeedback({ rating: 2 }), true);
  assert.equal(shouldEscalateFeedback({ score: 9, rating: 5 }), false);
});

test("review eligibility respects opt-out, cooldown, and active requests without sentiment gating", () => {
  assert.equal(eligibleForReview({ hasCompletedVisit: true, hasSucceededPayment: false, optedOut: true, daysSinceLastRequest: null, cooldownDays: 90, activeRequestExists: false }).eligible, false);
  assert.equal(eligibleForReview({ hasCompletedVisit: true, hasSucceededPayment: false, optedOut: false, daysSinceLastRequest: 10, cooldownDays: 90, activeRequestExists: false }).reason, "Review request cooldown is active");
  assert.equal(eligibleForReview({ hasCompletedVisit: false, hasSucceededPayment: true, optedOut: false, daysSinceLastRequest: null, cooldownDays: 90, activeRequestExists: false }).eligible, true);
});

test("review request templates reject review gating phrases", () => {
  assert.equal(reviewTemplateAvoidsGating("Leave us a 5-star review"), false);
  assert.equal(reviewTemplateAvoidsGating("If you had a good visit, review us"), false);
  assert.equal(reviewTemplateAvoidsGating("Please share honest feedback about your visit."), true);
});

test("referral metrics and reward ledger preserve reversals", () => {
  assert.equal(Math.round(referralConversionRate([{ status: "lead" }, { status: "sold" }, { status: "reward_issued" }])), 67);
  assert.equal(rewardLedgerBalance([{ eventType: "issued", amountCents: 5000 }, { eventType: "reversed", amountCents: 2000 }]), 3000);
  assert.equal(referralNetContribution(200_000, 5_000), 195_000);
});

test("reactivation priority is transparent and bounded", () => {
  assert.equal(reactivationPriority({ lifetimeRevenueCents: 2_000_000, monthsSinceLastVisit: 12, packageUtilizationPercent: 40, referralCount: 2 }), 89);
  assert.equal(reactivationPriority({ lifetimeRevenueCents: 20_000_000, monthsSinceLastVisit: 100, packageUtilizationPercent: 20, referralCount: 20 }), 100);
});

test("role permissions align with Phase 12 guidance", () => {
  assert.equal(hasReputationPermission(owner, "referrals.rewards.manage"), true);
  assert.equal(hasReputationPermission(manager, "reputation.feedback.manage"), true);
  assert.equal(hasReputationPermission(salesperson, "referrals.manage"), true);
  assert.equal(hasReputationPermission(salesperson, "reputation.feedback.manage"), false);
  assert.equal(hasReputationPermission(provider, "reputation.feedback.read"), true);
});

test("location helper enforces manager location scope", () => {
  assert.equal(reputationLocationAllowed(manager, "miami"), true);
  assert.equal(reputationLocationAllowed(manager, "tampa"), false);
  assert.equal(reputationLocationAllowed(manager, null), true);
});
