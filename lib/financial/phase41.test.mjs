import test from "node:test";
import assert from "node:assert/strict";
import { csvMoney, rowsToCsv } from "./csv.ts";
import { findCommissionConflicts, previewCommissionRule } from "./rule-preview.ts";
import { detectSaleHealthIssues } from "./health.ts";

test("detects same-priority commission conflicts", () => {
  const conflicts = findCommissionConflicts(
    { id: "new", userId: "u1", locationId: "l1", serviceId: "s1", active: true, effectiveStartDate: "2026-01-01" },
    [{ id: "old", userId: "u1", locationId: "l1", serviceId: "s1", active: true, effectiveStartDate: "2026-01-01" }]
  );

  assert.equal(conflicts.length, 1);
});

test("builds readable commission preview", () => {
  assert.equal(
    previewCommissionRule({ commissionType: "percentage", rate: 0.05, basis: "money_collected" }, { employee: "Julian Hart", service: "Hair Restoration", location: "Miami" }),
    "Julian Hart earns 5.00% of money collected on Hair Restoration in Miami."
  );
});

test("formats CSV money and escapes cells", () => {
  assert.equal(csvMoney(550000), "5500.00");
  assert.equal(rowsToCsv(["Name", "Amount"], [["A, B", "5500.00"]]), "Name,Amount\n\"A, B\",5500.00");
});

test("detects inconsistent sale financial health", () => {
  const issues = detectSaleHealthIssues([
    {
      id: "sale1",
      subtotal_cents: 10000,
      discount_amount_cents: 0,
      total_amount_cents: 10000,
      paid_amount_cents: 0,
      refunded_amount_cents: 0,
      balance_due_cents: 10000,
      sale_items: [{ quantity: 1, unit_price_cents: 10000, discount_amount_cents: 0, line_total_cents: 10000 }],
      payments: [{ amount_cents: 5000, status: "succeeded" }],
      refunds: []
    }
  ]);

  assert.equal(issues.some((issue) => issue.message.includes("Paid amount")), true);
});
