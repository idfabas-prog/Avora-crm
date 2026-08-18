import test from "node:test";
import assert from "node:assert/strict";
import { canUseLot, cogsForUsage, expiringBucket, grossProfit, inventoryValueCents, reorderSuggestion, stockStatus } from "./metrics.ts";
import { hasInventoryPermission } from "./permissions.ts";

test("calculates inventory value from actual lot cost", () => {
  assert.equal(inventoryValueCents([
    { quantity_available: 8, cost_per_unit_cents: 35000, status: "active" },
    { quantity_available: 2, cost_per_unit_cents: 500, status: "active" }
  ]), 281000);
});

test("detects low stock and reorder quantity", () => {
  const settings = { par_level: 10, reorder_point: 5, reorder_quantity: 4 };
  assert.equal(stockStatus(4, settings), "low_stock");
  assert.equal(reorderSuggestion(4, settings), 6);
  assert.equal(stockStatus(0, settings), "out_of_stock");
});

test("blocks expired quarantined and insufficient lots", () => {
  const today = new Date("2026-08-13T00:00:00");
  assert.equal(canUseLot({ quantity_available: 1, cost_per_unit_cents: 100, expiration_date: "2026-08-12", status: "active" }, 1, today).allowed, false);
  assert.equal(canUseLot({ quantity_available: 1, cost_per_unit_cents: 100, status: "quarantined" }, 1, today).allowed, false);
  assert.equal(canUseLot({ quantity_available: 1, cost_per_unit_cents: 100, status: "active" }, 2, today).allowed, false);
});

test("buckets expiration windows", () => {
  const today = new Date("2026-08-13T00:00:00");
  assert.equal(expiringBucket("2026-08-20", today), "expiring_30");
  assert.equal(expiringBucket("2026-10-20", today), "expiring_90");
  assert.equal(expiringBucket(null, today), "no_expiration");
});

test("calculates cogs and gross margin", () => {
  const cogs = cogsForUsage([{ total_cost_cents: 35000 }, { total_cost_cents: 250 }]);
  const profit = grossProfit(200000, cogs);
  assert.equal(cogs, 35250);
  assert.equal(profit.profitCents, 164750);
  assert.equal(Number(profit.margin.toFixed(3)), 0.824);
});

test("inventory permissions keep PO approval away from providers", () => {
  assert.equal(hasInventoryPermission({ role: "owner" }, "inventory.purchase_orders.approve"), true);
  assert.equal(hasInventoryPermission({ role: "provider" }, "inventory.purchase_orders.approve"), false);
  assert.equal(hasInventoryPermission({ role: "provider" }, "inventory.write"), true);
  assert.equal(hasInventoryPermission({ role: "salesperson" }, "inventory.cogs.read"), false);
});
