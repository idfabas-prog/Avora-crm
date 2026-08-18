import test from "node:test";
import assert from "node:assert/strict";
import { callbackPriority, callbackTaskIdempotencyKey, callListNextMember, callSummaryMetrics, deterministicCallScore, isMissedCall, netCallRevenueCents, nextQueueMember, providerCallIdempotencyKey, queueOverflowNeeded } from "./metrics.ts";
import { canReadCallRecording, canReadCallTranscript, hasCallPermission } from "./permissions.ts";
import { DevelopmentTelephonyAdapter } from "../integrations/telephony/development-adapter.ts";

test("detects inbound missed calls deterministically", () => {
  assert.equal(isMissedCall({ direction: "inbound", status: "missed" }), true);
  assert.equal(isMissedCall({ direction: "inbound", status: "completed", answeredAt: null }), true);
  assert.equal(isMissedCall({ direction: "inbound", status: "completed", answeredAt: "2026-08-14T12:00:00Z" }), false);
  assert.equal(isMissedCall({ direction: "outbound", status: "no_answer" }), false);
});

test("summarizes call-center metrics safely", () => {
  const metrics = callSummaryMetrics([
    { direction: "inbound", status: "completed", durationSeconds: 300, ringDurationSeconds: 10, booked: true },
    { direction: "inbound", status: "missed", durationSeconds: 40, ringDurationSeconds: 40 },
    { direction: "outbound", status: "completed", durationSeconds: 200, ringDurationSeconds: 8, saleAttributed: true, revenueCents: 100000, refundCents: 25000 }
  ]);
  assert.equal(metrics.totalCalls, 3);
  assert.equal(metrics.missedCalls, 1);
  assert.equal(Number(metrics.answerRate.toFixed(2)), 0.5);
  assert.equal(metrics.netRevenueCents, 75000);
});

test("keeps provider calls and callback tasks idempotent", () => {
  assert.equal(providerCallIdempotencyKey("Development", "ABC"), "development:abc");
  assert.equal(callbackTaskIdempotencyKey("call-1"), "missed-call-callback:call-1");
});

test("prioritizes callbacks and handles queue overflow", () => {
  assert.equal(callbackPriority({ missed: true, hasOpportunity: true, lifetimeValueCents: 1200000, minutesSinceCall: 5 }), 90);
  assert.equal(queueOverflowNeeded({ waitSeconds: 60, maxWaitSeconds: 45, voicemailEnabled: false }), true);
  assert.equal(nextQueueMember([
    { active: true, available: true, priority: 20, lastAnsweredAt: "2026-08-14T12:00:00Z" },
    { active: true, available: true, priority: 10, lastAnsweredAt: "2026-08-14T13:00:00Z" }
  ])?.priority, 10);
});

test("progresses call lists by pending order", () => {
  const next = callListNextMember([
    { status: "connected", orderIndex: 1 },
    { status: "pending", orderIndex: 3 },
    { status: "pending", orderIndex: 2 }
  ]);
  assert.equal(next?.orderIndex, 2);
});

test("calculates transparent coaching score from observable call behavior", () => {
  const score = deterministicCallScore({ transcriptText: "We can schedule today and answer financing cost questions. I will follow up.", disposition: "Booked Appointment", bookedAppointment: true, followUpCreated: true });
  assert.equal(score.score, 100);
});

test("keeps recording transcript and AI permissions role-scoped", () => {
  assert.equal(hasCallPermission({ role: "owner" }, "calls.ai_summary"), true);
  assert.equal(hasCallPermission({ role: "salesperson" }, "calls.make"), true);
  assert.equal(canReadCallRecording({ role: "salesperson" }), false);
  assert.equal(canReadCallTranscript({ role: "provider" }), false);
});

test("development telephony never places a live call", async () => {
  const adapter = new DevelopmentTelephonyAdapter();
  const call = await adapter.createCall({ organizationId: "org", locationId: "loc", contactId: "contact", fromNumber: "+13055550101", toNumber: "+13055550102", idempotencyKey: "same" });
  const retry = await adapter.createCall({ organizationId: "org", locationId: "loc", contactId: "contact", fromNumber: "+13055550101", toNumber: "+13055550102", idempotencyKey: "same" });
  assert.equal(call.providerCallId, retry.providerCallId);
  assert.equal(call.simulated, true);
});

test("sale revenue is reduced by refunds", () => {
  assert.equal(netCallRevenueCents([{ revenueCents: 650000, refundCents: 50000 }]), 600000);
});
