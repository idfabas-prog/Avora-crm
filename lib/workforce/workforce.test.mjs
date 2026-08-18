import test from "node:test";
import assert from "node:assert/strict";
import {
  contributionBeforeOverhead,
  hasScheduleConflict,
  hourlyEquivalentCents,
  laborCostCents,
  providerUtilization,
  ptoAvailableMinutes,
  revenuePerLaborHour,
  splitOvertime,
  workedMinutes
} from "./calculations.ts";
import { hasWorkforcePermission } from "./permissions.ts";

const baseProfile = {
  id: "u1",
  organizationId: "o1",
  fullName: "Demo User",
  email: "demo@example.test",
  title: null,
  role: "provider",
  organization: "Avora",
  locations: []
};

test("deducts unpaid breaks from worked minutes", () => {
  const minutes = workedMinutes(
    { start: new Date("2026-08-13T09:00:00Z"), end: new Date("2026-08-13T17:00:00Z") },
    [{ start: new Date("2026-08-13T13:00:00Z"), end: new Date("2026-08-13T13:30:00Z"), paid: false }]
  );
  assert.equal(minutes, 450);
});

test("splits weekly overtime deterministically", () => {
  assert.deepEqual(splitOvertime(2520, { weeklyThresholdMinutes: 2400, multiplier: 1.5 }), {
    regularMinutes: 2400,
    overtimeMinutes: 120
  });
});

test("calculates hourly and salary labor costs without floating hour storage", () => {
  const hourly = laborCostCents({ employmentType: "hourly", hourlyRateCents: 3000, overtimeEligible: true, overtimeMultiplier: 1.5 }, 2400, 120, 480);
  assert.equal(hourly.totalCostCents, 153000);
  assert.equal(hourlyEquivalentCents({ employmentType: "salary", annualSalaryCents: 10400000, overtimeEligible: false, overtimeMultiplier: 1.5, annualWorkMinutes: 124800 }), 5000);
});

test("tracks PTO availability from immutable events", () => {
  assert.equal(ptoAvailableMinutes([{ minutes: 4800 }, { minutes: -480 }], 240), 4080);
});

test("detects schedule conflicts", () => {
  assert.equal(hasScheduleConflict(
    { start: new Date("2026-08-13T13:00:00Z"), end: new Date("2026-08-13T18:00:00Z") },
    [{ start: new Date("2026-08-13T09:00:00Z"), end: new Date("2026-08-13T17:00:00Z") }]
  ), true);
});

test("calculates utilization and revenue per labor hour", () => {
  assert.equal(providerUtilization(1440, 1920), 0.75);
  assert.equal(revenuePerLaborHour(200000, 120), 100000);
});

test("combines revenue inventory COGS and labor into contribution", () => {
  const result = contributionBeforeOverhead(200000, 30000, 40000);
  assert.equal(result.contributionCents, 130000);
  assert.equal(result.margin, 0.65);
});

test("workforce permissions protect compensation by default", () => {
  assert.equal(hasWorkforcePermission(baseProfile, "workforce.timeclock.use"), true);
  assert.equal(hasWorkforcePermission(baseProfile, "workforce.compensation.read"), false);
  assert.equal(hasWorkforcePermission({ ...baseProfile, role: "owner" }, "workforce.compensation.read"), true);
});
