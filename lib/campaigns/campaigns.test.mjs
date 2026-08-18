import test from "node:test";
import assert from "node:assert/strict";
import { assignVariant, campaignSendIdempotencyKey, contactFatigueScore, evaluateCampaignEligibility, nextAllowedSendTime, retryableFailure, validateVariantWeights } from "./safety.ts";
import { campaignPerformance, netCampaignRevenue, variantPerformance } from "./analytics.ts";

test("validates A/B variant weights and assigns contacts deterministically", () => {
  const variants = [
    { id: "a", name: "A", weightPercent: 50, active: true },
    { id: "b", name: "B", weightPercent: 50, active: true }
  ];
  assert.equal(validateVariantWeights(variants).valid, true);
  assert.deepEqual(assignVariant("contact-1", variants), assignVariant("contact-1", variants));
  assert.equal(validateVariantWeights([{ id: "a", name: "A", weightPercent: 40, active: true }]).valid, false);
});

test("blocks ineligible campaign recipients before scheduling", () => {
  const settings = { dailyContactFrequencyCap: 1, weeklyContactFrequencyCap: 3 };
  assert.equal(evaluateCampaignEligibility({ contactId: "c1", phone: "+13055550101", optedOut: true, suppressed: false, outboundToday: 0, outboundThisWeek: 0, allowedLocationIds: ["l1"], locationId: "l1", campaignStatus: "running", fatigueScore: 0 }, settings).status, "opted_out");
  assert.equal(evaluateCampaignEligibility({ contactId: "c1", phone: "+13055550101", optedOut: false, suppressed: true, outboundToday: 0, outboundThisWeek: 0, allowedLocationIds: ["l1"], locationId: "l1", campaignStatus: "running", fatigueScore: 0 }, settings).status, "suppressed");
  assert.equal(evaluateCampaignEligibility({ contactId: "c1", phone: "+13055550101", optedOut: false, suppressed: false, outboundToday: 1, outboundThisWeek: 0, allowedLocationIds: ["l1"], locationId: "l1", campaignStatus: "running", fatigueScore: 0 }, settings).status, "frequency_capped");
  assert.equal(evaluateCampaignEligibility({ contactId: "c1", phone: "+13055550101", optedOut: false, suppressed: false, outboundToday: 0, outboundThisWeek: 0, allowedLocationIds: ["l1"], locationId: "l2", campaignStatus: "running", fatigueScore: 0 }, settings).status, "unauthorized_location");
});

test("respects quiet hours and retry boundaries", () => {
  const next = nextAllowedSendTime(new Date("2026-08-14T22:30:00"), { quietHoursEnabled: true, quietHoursStart: "20:00", quietHoursEnd: "09:00", weekendsEnabled: true });
  assert.equal(next.getHours(), 9);
  assert.equal(contactFatigueScore({ outboundMarketing7d: 3, workflowMessages7d: 1, reviewRequests30d: 1, reactivationMessages30d: 0 }), 9);
  assert.equal(retryableFailure("temporary provider timeout"), true);
  assert.equal(retryableFailure("contact opted out"), false);
});

test("calculates campaign and variant performance", () => {
  const rows = [
    { status: "delivered", variantId: "a", revenueCents: 10000, sentAt: "now", deliveredAt: "now", repliedAt: "now", bookedAt: null, soldAt: null },
    { status: "converted", variantId: "b", revenueCents: 20000, sentAt: "now", deliveredAt: "now", repliedAt: null, bookedAt: "now", soldAt: "now" }
  ];
  const performance = campaignPerformance(rows);
  assert.equal(performance.sent, 2);
  assert.equal(performance.delivered, 2);
  assert.equal(performance.revenueCents, 30000);
  assert.equal(variantPerformance(rows).length, 2);
  assert.equal(netCampaignRevenue(50000, 12500), 37500);
});

test("uses stable campaign recipient idempotency keys", () => {
  assert.equal(campaignSendIdempotencyKey("run1", "contact1", "variant1"), "campaign-send:run1:contact1:variant1");
  assert.equal(campaignSendIdempotencyKey("run1", "contact1", null), "campaign-send:run1:contact1:default");
});
