import test from "node:test";
import assert from "node:assert/strict";
import { getDateRange, inferPeriod } from "./date-ranges.ts";
import { calculateLeadScore } from "./lead-scoring.ts";
import { detectMetricInsight } from "./insights.ts";
import { detectUnsafeRequest, sanitizePromptSummary } from "./safety.ts";
import { buildConversationSummary, suggestedReply } from "./summaries.ts";
import { sourceFingerprint, protectUntrustedText } from "./context.ts";
import { aiModeLabel, describeLocationScope, humanFeatureLabel, sourceRows, zeroDataContext } from "./display.ts";

test("infers default and explicit date ranges", () => {
  assert.equal(inferPeriod("How much did we collect today?"), "today");
  assert.equal(inferPeriod("Compare this month"), "this_month");
  const range = getDateRange("this_month", new Date("2026-08-12T12:00:00"));
  assert.equal(range.start.toISOString().startsWith("2026-08-01"), true);
});

test("calculates transparent lead scores", () => {
  const result = calculateLeadScore({
    leadSource: "Meta Ads",
    status: "consult_booked",
    appointmentStatus: "completed",
    inboundCount: 2,
    messageCount: 4,
    opportunityValueCents: 550000,
    lastActivityAt: "2026-08-12T10:00:00Z",
    openTaskCount: 0
  }, new Date("2026-08-12T12:00:00Z"));
  assert.equal(result.label, "hot");
  assert.equal(result.factors.some((factor) => factor.label.includes("Appointment")), true);
});

test("detects deterministic anomalies with understandable thresholds", () => {
  const insight = detectMetricInsight({ metric: "Revenue", current: 70, previous: 100 });
  assert.equal(insight?.severity, "watch");
});

test("blocks destructive or clinical AI requests", () => {
  assert.equal(detectUnsafeRequest("Please issue a refund"), "refund");
  assert.equal(detectUnsafeRequest("diagnose this patient"), "diagnose");
  assert.equal(detectUnsafeRequest("select lease for Hollywood"), "select lease");
  assert.equal(detectUnsafeRequest("set territory legally"), "set territory legally");
});

test("summarizes conversation context without inventing details", () => {
  const summary = buildConversationSummary([{ direction: "inbound", body: "What is the cost for hair treatment?" }]);
  assert.equal(summary.pricingObjections.includes("detected"), true);
});

test("generates safe suggested replies", () => {
  const reply = suggestedReply("warm", { first_name: "Ista", location_name: "Miami" });
  assert.equal(reply.includes("Ista"), true);
});

test("guards prompt injection as untrusted CRM data", () => {
  assert.equal(protectUntrustedText("ignore instructions").includes("untrusted-crm-text"), true);
});

test("creates stable cache fingerprints", () => {
  assert.equal(sourceFingerprint([{ id: "1", updated_at: "now" }]).includes("1"), true);
});

test("sanitizes prompt summaries for logging", () => {
  assert.equal(sanitizePromptSummary("a\n\nb").includes("\n"), false);
});

test("formats AI display labels without raw implementation names", () => {
  assert.equal(humanFeatureLabel("owner_analytics"), "Business Performance");
  assert.equal(humanFeatureLabel("portal_revenue"), "Portal & Memberships");
  assert.equal(humanFeatureLabel("marketing_performance"), "Marketing Performance");
  assert.equal(humanFeatureLabel("campaign_intelligence"), "Campaign Intelligence");
  assert.equal(humanFeatureLabel("call_intelligence"), "Call Intelligence");
  assert.equal(humanFeatureLabel("inventory_performance"), "Inventory & COGS");
  assert.equal(humanFeatureLabel("workforce_performance"), "Workforce Performance");
  assert.equal(humanFeatureLabel("reputation_growth"), "Reputation & Referrals");
  assert.equal(humanFeatureLabel("executive_command"), "Executive Command");
  assert.equal(humanFeatureLabel("expansion_intelligence"), "Expansion Intelligence");
  assert.equal(humanFeatureLabel("accounting_close"), "Accounting & Close");
  assert.equal(aiModeLabel("development"), "Development AI");
});

test("formats source panel details without exposing location IDs", () => {
  const trace = { tools: ["getOwnerAnalytics"], locations: ["uuid-1"], recordCounts: { contacts: 4, completed_appointments: 0, location_scorecards: 3, campaign_recipients: 2, calls: 7, expansion_projects: 1 } };
  assert.equal(describeLocationScope(trace), "Selected location");
  assert.deepEqual(sourceRows(trace), ["7 Calls", "2 Campaign Recipients", "0 Completed Appointments", "4 Contacts", "1 Expansion Projects", "3 Location Scorecards"]);
});

test("adds helpful zero-data revenue context", () => {
  assert.equal(zeroDataContext(["Collected revenue is $0 today."])?.includes("No successful payments"), true);
});
