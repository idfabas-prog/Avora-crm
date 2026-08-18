import test from "node:test";
import assert from "node:assert/strict";
import {
  assertAdvisoryOnlyAction,
  churnRiskPrediction,
  collectionPriorityPrediction,
  confidenceFromEvidence,
  explainScore,
  insightSeverity,
  leadConversionPrediction,
  noShowRiskPrediction,
  recommendationPriority,
  rollingAverageForecast,
  runRateForecast,
  sensitivePredictionExclusions,
  weightedRecentAverageForecast
} from "./operating-rules.ts";
import { humanFeatureLabel } from "./display.ts";

test("calculates explainable lead conversion prediction without sensitive factors", () => {
  const result = leadConversionPrediction({
    bookedConsult: true,
    inboundCount: 2,
    opportunityValueCents: 1_200_000,
    recentActivityDays: 1,
    openTaskCount: 0
  }, new Date("2026-08-14T10:00:00Z"));

  assert.equal(result.band, "urgent");
  assert.equal(result.score >= 80, true);
  assert.equal(result.excludedFactors.includes("diagnosis"), true);
  assert.equal(explainScore(result)[0].includes("Booked consult"), true);
});

test("calculates no-show, churn, and collection risks deterministically", () => {
  assert.equal(noShowRiskPrediction({ noShowCount: 1, overdueTaskCount: 1 }).band, "high");
  assert.equal(churnRiskPrediction({ monthsSinceLastVisit: 14, membershipPastDue: true }).band, "high");
  assert.equal(collectionPriorityPrediction({ unpaidBalanceCents: 250_000, recentActivityDays: 3 }).band, "medium");
});

test("labels confidence based on evidence volume and maturity", () => {
  assert.equal(confidenceFromEvidence(40, 0.9, 0.75), "high");
  assert.equal(confidenceFromEvidence(12, 0.7, 0.25), "moderate");
  assert.equal(confidenceFromEvidence(3, 0.5, 0.1), "limited");
});

test("generates transparent forecasts with gaps and limitations", () => {
  const runRate = runRateForecast({ actualValue: 1_000, elapsedDays: 5, periodDays: 10, targetValue: 2_500 });
  assert.equal(runRate.forecastValue, 2_000);
  assert.equal(runRate.gapValue, -500);
  assert.equal(runRate.method, "run_rate");

  const rolling = rollingAverageForecast({ actualValue: 0, elapsedDays: 3, periodDays: 4, recentValues: [10, 20, 30] });
  assert.equal(rolling.forecastValue, 80);

  const weighted = weightedRecentAverageForecast({ actualValue: 0, elapsedDays: 3, periodDays: 3, recentValues: [10, 20, 40], weights: [1, 2, 3] });
  assert.equal(weighted.forecastValue, 85);
});

test("classifies insight severity and recommendation priority", () => {
  assert.equal(insightSeverity(0.4, 25), "critical");
  assert.equal(insightSeverity(0.12, 3), "watch");
  assert.equal(recommendationPriority(88), "urgent");
  assert.equal(recommendationPriority(58), "medium");
});

test("blocks autonomous operating actions", () => {
  assert.throws(() => assertAdvisoryOnlyAction("send SMS to everyone"), /advisory-only/);
  assert.throws(() => assertAdvisoryOnlyAction("charge card now"), /advisory-only/);
  assert.doesNotThrow(() => assertAdvisoryOnlyAction("refresh advisory operating brief"));
});

test("documents sensitive attributes excluded from prediction", () => {
  assert.equal(sensitivePredictionExclusions.includes("race"), true);
  assert.equal(sensitivePredictionExclusions.includes("credit score"), true);
});

test("formats Phase 16 AI display label", () => {
  assert.equal(humanFeatureLabel("operating_system"), "AI Operating System");
});
