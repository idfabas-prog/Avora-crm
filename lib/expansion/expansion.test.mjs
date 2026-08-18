import test from "node:test";
import assert from "node:assert/strict";
import {
  assertCloneableConfiguration,
  breakEvenEstimate,
  budgetVariance,
  calculateReadiness,
  canAccessRegion,
  expansionStageRisk,
  managementFee,
  overlapRisk,
  siteScore
} from "./calculations.ts";
import { hasExpansionPermission } from "./permissions.ts";

const ownerProfile = { role: "owner" };
const managerProfile = { role: "manager" };
const salesProfile = { role: "salesperson" };

test("calculates opening readiness with blocker cap", () => {
  const result = calculateReadiness([
    { category: "Site", status: "complete", required: true, blocker: false },
    { category: "Clinical", status: "blocked", required: true, blocker: true },
    { category: "Marketing", status: "complete", required: false, blocker: false }
  ]);

  assert.equal(result.overall, 67);
  assert.equal(result.status, "at_risk");
  assert.deepEqual(result.blockers.map((item) => item.category), ["Clinical"]);
  assert.equal(result.categoryScores.Site, 100);
});

test("scores sites and explains factors", () => {
  const result = siteScore({
    askingRentCents: 1_800_000,
    squareFeet: 3000,
    visibilityScore: 84,
    parkingScore: 70,
    marketScore: 78,
    territoryFitScore: 65,
    competitionCount: 5
  });

  assert.equal(result.score > 60, true);
  assert.equal(result.factors.some((factor) => factor.includes("Visibility")), true);
});

test("classifies overlap risk from distance, zip, and territory signals", () => {
  const high = overlapRisk({ distanceMiles: 5, sharedPostalCodes: 2, sharedLeadSources: 1, sameTerritory: true });
  const low = overlapRisk({ distanceMiles: 35, sharedPostalCodes: 0, sharedLeadSources: 0, sameTerritory: false });

  assert.equal(high.risk, "high");
  assert.equal(low.risk, "low");
});

test("calculates budget variance and break-even planning estimate", () => {
  const budget = budgetVariance([
    { budgetCents: 1000, committedCents: 700, actualCents: 100 },
    { budgetCents: 500, committedCents: 100, actualCents: 200 }
  ]);
  const breakEven = breakEvenEstimate({
    startupCostCents: 100_000,
    targetMonthlyRevenueCents: 50_000,
    targetContributionMargin: 0.4,
    monthlyRentCents: 5_000,
    payrollMonthlyCents: 5_000,
    otherMonthlyFixedCostCents: 2_000
  });

  assert.equal(budget.variance, 700);
  assert.equal(breakEven.breakEvenMonths, 13);
});

test("calculates management fees without moving money", () => {
  assert.equal(managementFee(100_000, "percent", 0.04), 4000);
  assert.equal(managementFee(100_000, "flat_monthly", 2500), 2500);
});

test("enforces expansion and regional permissions", () => {
  assert.equal(hasExpansionPermission(ownerProfile, "expansion.financials.manage"), true);
  assert.equal(hasExpansionPermission(managerProfile, "regions.read"), true);
  assert.equal(hasExpansionPermission(salesProfile, "expansion.read"), false);
  assert.equal(canAccessRegion({ role: "manager", assignedRegionIds: ["south"], requestedRegionId: "south" }), true);
  assert.equal(canAccessRegion({ role: "manager", assignedRegionIds: ["south"], requestedRegionId: "north" }), false);
});

test("blocks unsafe location configuration cloning", () => {
  assert.doesNotThrow(() => assertCloneableConfiguration("appointment_types"));
  assert.throws(() => assertCloneableConfiguration("contacts"), /cannot be cloned/);
  assert.throws(() => assertCloneableConfiguration("unknown_table"), /approved configuration/);
});

test("classifies expansion stage risk", () => {
  assert.equal(expansionStageRisk("paused", 90), "critical");
  assert.equal(expansionStageRisk("site_search", 35), "important");
  assert.equal(expansionStageRisk("construction", 68), "watch");
  assert.equal(expansionStageRisk("open", 91), "low");
});
