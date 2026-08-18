import test from "node:test";
import assert from "node:assert/strict";
import {
  balanceJournal,
  batchIdempotencyKey,
  closeReadiness,
  csvRowsForJournal,
  journalPreviewForCogs,
  journalPreviewForExpense,
  journalPreviewForPayment,
  journalPreviewForRefund,
  journalPreviewForSale,
  periodContainsDate,
  postCloseAdjustmentNeeded,
  reconciliationStatus,
  resolveMapping
} from "./calculations.ts";
import { hasAccountingPermission, accountingLocationAllowed } from "./permissions.ts";
import { getAccountingConfig } from "./config.ts";
import { createDevelopmentAccountingProvider } from "../integrations/accounting/development-provider.ts";
import { createQuickBooksProvider } from "../integrations/accounting/quickbooks/index.ts";
import { createXeroProvider } from "../integrations/accounting/xero/index.ts";
import { detectUnsafeRequest } from "../ai/safety.ts";

const mappings = [
  { mappingType: "revenue", sourceKey: "Hair Restoration", externalAccountId: "4000", active: true },
  { mappingType: "cash", sourceKey: "stripe_card", externalAccountId: "1010", active: true },
  { mappingType: "undeposited_funds", sourceKey: "default", externalAccountId: "1100", active: true },
  { mappingType: "refund", sourceKey: "default", externalAccountId: "4000", active: true },
  { mappingType: "cogs", sourceKey: "inventory_usage", externalAccountId: "5000", active: true },
  { mappingType: "inventory_asset", sourceKey: "default", externalAccountId: "1200", active: true },
  { mappingType: "commission_expense", sourceKey: "default", externalAccountId: "6100", active: true },
  { mappingType: "royalty_expense", sourceKey: "default", externalAccountId: "6200", active: true },
  { mappingType: "management_fee", sourceKey: "default", externalAccountId: "6300", active: true }
];

test("resolves explicit and default accounting mappings", () => {
  assert.equal(resolveMapping(mappings, "revenue", "Hair Restoration")?.externalAccountId, "4000");
  assert.equal(resolveMapping(mappings, "undeposited_funds", "anything")?.externalAccountId, "1100");
  assert.equal(resolveMapping(mappings, "missing", "default"), null);
});

test("creates balanced sale, payment, refund, COGS, commission, royalty, and management fee previews", () => {
  const previews = [
    journalPreviewForSale({ saleId: "sale-1", amountCents: 550000, category: "Hair Restoration", mappings }),
    journalPreviewForPayment({ paymentId: "payment-1", amountCents: 100000, method: "stripe_card", mappings }),
    journalPreviewForRefund({ refundId: "refund-1", amountCents: 25000, method: "stripe_card", mappings }),
    journalPreviewForCogs({ usageId: "usage-1", amountCents: 35000, mappings }),
    journalPreviewForExpense({ sourceId: "commission-1", sourceType: "commission", amountCents: 12000, mappingType: "commission_expense", description: "Commission expense", mappings }),
    journalPreviewForExpense({ sourceId: "royalty-1", sourceType: "royalty", amountCents: 8000, mappingType: "royalty_expense", description: "Royalty expense", mappings }),
    journalPreviewForExpense({ sourceId: "fee-1", sourceType: "management_fee", amountCents: 15000, mappingType: "management_fee", description: "Management fee", mappings })
  ];
  for (const lines of previews) {
    assert.equal(balanceJournal(lines).balanced, true);
  }
});

test("generates stable export idempotency keys", () => {
  assert.equal(batchIdempotencyKey({ connectionId: "conn", sourceType: "sale", sourceId: "sale-1", exportVersion: 1 }), "conn:sale:sale-1:1");
});

test("matches processor reconciliation by gross and net amounts", () => {
  assert.equal(reconciliationStatus({ avoraGrossCents: 10000, processorGrossCents: 10000, avoraNetCents: 9700, processorNetCents: 9700 }), "matched");
  assert.equal(reconciliationStatus({ avoraGrossCents: 10000, processorGrossCents: 9000 }), "partial");
  assert.equal(reconciliationStatus({ avoraGrossCents: 10000, processorGrossCents: 0 }), "unmatched");
});

test("calculates close readiness and post-close adjustment flags", () => {
  const readiness = closeReadiness({ requiredItems: 10, completedRequiredItems: 8, openCriticalExceptions: 1, unbalancedBatches: 1 });
  assert.equal(readiness.blockers.length, 3);
  assert.equal(periodContainsDate({ periodStart: "2026-08-01", periodEnd: "2026-08-31" }, "2026-08-14"), true);
  assert.equal(postCloseAdjustmentNeeded({ status: "closed", periodStart: "2026-08-01", periodEnd: "2026-08-31" }, "2026-08-14"), true);
});

test("exports journal previews as CSV rows", () => {
  const csv = csvRowsForJournal(journalPreviewForCogs({ usageId: "usage-1", amountCents: 35000, mappings }));
  assert.equal(csv.includes("Inventory asset reduction"), true);
});

test("accounting permissions and location scope are restrictive", () => {
  const profile = { role: "manager", locations: [{ id: "loc-1", name: "Miami", slug: "miami" }] };
  assert.equal(hasAccountingPermission(profile, "accounting.reports.read"), true);
  assert.equal(hasAccountingPermission(profile, "accounting.connections.manage"), false);
  assert.equal(accountingLocationAllowed(profile, "loc-1"), true);
  assert.equal(accountingLocationAllowed(profile, "loc-2"), false);
});

test("development provider works without live accounting credentials", async () => {
  const provider = createDevelopmentAccountingProvider();
  assert.equal((await provider.testConnection()).ok, true);
  assert.equal((await provider.fetchChartOfAccounts()).length, 14);
  assert.equal((await provider.exportJournalBatch([{ id: "line-1" }])).success, true);
});

test("quickbooks and xero foundations do not make live calls in Phase 18", async () => {
  assert.equal((await createQuickBooksProvider().testConnection()).ok, false);
  assert.equal((await createXeroProvider().testConnection()).ok, false);
  await assert.rejects(() => createQuickBooksProvider().exportJournalBatch([]), /not available/);
  await assert.rejects(() => createXeroProvider().exportJournalBatch([]), /not available/);
});

test("accounting mode defaults to development and AI blocks accounting writes", () => {
  assert.equal(getAccountingConfig().mode, "development");
  assert.equal(detectUnsafeRequest("approve batch and post journal"), "approve batch");
  assert.equal(detectUnsafeRequest("close period now"), "close period");
});
