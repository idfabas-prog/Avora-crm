import test from "node:test";
import assert from "node:assert/strict";
import { aggregateKpis, calculateTrend, contributionBeforeOverhead, emptyKpis, executiveDateRange, executiveScore, expansionReadiness, forecastConfidence, runRateForecast, safeDivide, scoreComponent, scoreTarget } from "./metrics.ts";
import { canReadAggregateLaborCost, canReadClinicalAggregate, hasExecutivePermission } from "./permissions.ts";

test("calculates contribution before overhead and margin", () => {
  const result = contributionBeforeOverhead(1000000, 180000, 220000);
  assert.equal(result.contributionCents, 600000);
  assert.equal(result.marginPercent, 0.6);
});

test("handles zero denominators without misleading percentages", () => {
  assert.equal(safeDivide(10, 0), 0);
  assert.equal(calculateTrend(100, 0).percentChange, null);
});

test("builds date ranges with prior comparison windows", () => {
  const range = executiveDateRange("this_month", new Date("2026-08-14T12:00:00"));
  assert.equal(range.start, "2026-08-01");
  assert.equal(range.end, "2026-08-14");
  assert.equal(range.priorEnd, "2026-07-31");
});

test("scores target performance with normal and lower-is-better metrics", () => {
  const revenueTarget = { target_value: 100, warning_threshold: 90, critical_threshold: 80 };
  const noShowTarget = { target_value: 0.1, warning_threshold: 0.14, critical_threshold: 0.18 };
  assert.equal(scoreTarget(110, revenueTarget), "Above Target");
  assert.equal(scoreTarget(85, revenueTarget), "Watch");
  assert.equal(scoreTarget(75, revenueTarget), "Below Target");
  assert.equal(scoreTarget(0.08, noShowTarget, true), "Above Target");
  assert.equal(scoreTarget(0.16, noShowTarget, true), "Watch");
});

test("forecasts month end with confidence labels", () => {
  const range = executiveDateRange("this_month", new Date("2026-08-15T12:00:00"));
  assert.equal(runRateForecast(150000, range, 30), 300000);
  assert.equal(forecastConfidence(range, 30), "Moderate Confidence");
});

test("aggregates company KPI totals from location scorecards", () => {
  const one = { ...emptyKpis, netCollectedRevenueCents: 1000, collectedRevenueCents: 1000, marketingSpendCents: 100, soldCount: 2, showedConsults: 4, bookedConsults: 5, nps: 70 };
  const two = { ...emptyKpis, netCollectedRevenueCents: 500, collectedRevenueCents: 500, marketingSpendCents: 100, soldCount: 1, showedConsults: 2, bookedConsults: 3, nps: 50 };
  const aggregate = aggregateKpis([one, two]);
  assert.equal(aggregate.netCollectedRevenueCents, 1500);
  assert.equal(aggregate.roas, 7.5);
  assert.equal(aggregate.closeRatePercent, 0.5);
  assert.equal(aggregate.nps, 60);
});

test("creates deterministic scorecards and expansion labels", () => {
  const components = { financial: 90, sales: 80, marketing: 85, operations: 75, retention: 90 };
  const score = executiveScore(components, { financial: 0.3, sales: 0.2, marketing: 0.18, operations: 0.17, retention: 0.15 });
  assert.equal(score, 85);
  const readiness = expansionReadiness({ score: 86, components, kpis: { ...emptyKpis, nps: 70 } });
  assert.equal(readiness.label, "Strong");
  assert.equal(readiness.factors.some((factor) => factor.includes("Revenue")), true);
});

test("keeps location authorization and executive permissions narrow", () => {
  assert.equal(hasExecutivePermission({ role: "owner" }, "executive.company.read"), true);
  assert.equal(hasExecutivePermission({ role: "manager" }, "executive.location.read"), true);
  assert.equal(hasExecutivePermission({ role: "manager" }, "executive.targets.manage"), false);
  assert.equal(hasExecutivePermission({ role: "salesperson" }, "executive.read"), false);
});

test("allows aggregate privacy while protecting sensitive detail by design", () => {
  assert.equal(canReadAggregateLaborCost({ role: "manager" }), true);
  assert.equal(canReadClinicalAggregate({ role: "manager" }), true);
  assert.equal(canReadClinicalAggregate({ role: "salesperson" }), false);
});

test("scores components with lower-is-better support", () => {
  assert.equal(scoreComponent(120, 100), 100);
  assert.equal(scoreComponent(0.08, 0.1, true), 100);
  assert.equal(scoreComponent(0.2, 0.1, true), 50);
});
