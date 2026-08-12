import test from "node:test";
import assert from "node:assert/strict";
import { calculateSaleTotals, calculateDiscountAmount } from "./sale-calculations.ts";
import { summarizePayments, refundableAmount } from "./payment-calculations.ts";
import { calculateCommissionAmount, calculateCommissionReversal, resolveCommissionRule } from "./commission-engine.ts";
import { calculateRoyaltyAmount, calculateRoyaltyReversal, resolveRoyaltyRule } from "./royalty-engine.ts";
import { formatMoney, dollarsToCents } from "./money.ts";

test("calculates sale totals, partial payments, and balances", () => {
  const totals = calculateSaleTotals({
    items: [{ quantity: 1, unitPriceCents: 550000, discountAmountCents: 0 }],
    paidAmountCents: 100000
  });

  assert.equal(totals.totalAmountCents, 550000);
  assert.equal(totals.balanceDueCents, 450000);
  assert.equal(totals.status, "partially_paid");
});

test("prevents discounts from making negative line totals", () => {
  assert.equal(calculateDiscountAmount(10000, "fixed", 20000), 10000);
  assert.equal(calculateDiscountAmount(10000, "percentage", 25), 2500);
});

test("summarizes payments and refunds", () => {
  const summary = summarizePayments({
    payments: [{ amountCents: 100000, status: "succeeded" }, { amountCents: 50000, status: "failed" }],
    refunds: [{ amountCents: 25000, status: "succeeded" }]
  });

  assert.equal(summary.grossCollectedCents, 100000);
  assert.equal(summary.refundedCents, 25000);
  assert.equal(summary.netCollectedCents, 75000);
  assert.equal(refundableAmount(100000, 25000), 75000);
});

test("resolves commission rule precedence and reversals", () => {
  const rules = [
    { id: "default", userId: "u1", locationId: null, serviceId: null, packageId: null, category: null, rate: 0.03, commissionType: "percentage", basis: "money_collected" },
    { id: "location", userId: "u1", locationId: "loc1", serviceId: null, packageId: null, category: null, rate: 0.04, commissionType: "percentage", basis: "money_collected" },
    { id: "service-location", userId: "u1", locationId: "loc1", serviceId: "svc1", packageId: null, category: null, rate: 0.05, commissionType: "percentage", basis: "money_collected" }
  ];
  const rule = resolveCommissionRule(rules, { userId: "u1", locationId: "loc1", serviceId: "svc1", packageId: null, category: "Hair Restoration" });

  assert.equal(rule?.id, "service-location");
  assert.equal(calculateCommissionAmount(200000, rule), 10000);
  assert.equal(calculateCommissionReversal(10000), -10000);
});

test("resolves royalty exemptions and reversals", () => {
  const rules = [
    { id: "default", locationId: null, category: null, serviceId: null, packageId: null, rate: 0.07, basis: "money_collected" },
    { id: "botox-exempt", locationId: null, category: "Botox", serviceId: null, packageId: null, rate: 0, basis: "money_collected" }
  ];

  const rule = resolveRoyaltyRule(rules, { locationId: "loc1", category: "Botox", serviceId: "svc1", packageId: null });
  assert.equal(rule?.id, "botox-exempt");
  assert.equal(calculateRoyaltyAmount(42000, rule.rate), 0);
  assert.equal(calculateRoyaltyReversal(5000), -5000);
});

test("formats and parses money in cents", () => {
  assert.equal(dollarsToCents("$5,500.00"), 550000);
  assert.equal(formatMoney(550000), "$5,500");
});
