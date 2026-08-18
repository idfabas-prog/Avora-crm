export type Mapping = {
  mappingType: string;
  sourceKey: string;
  externalAccountId: string | null;
  active?: boolean;
};

export type JournalLine = {
  accountId: string;
  amountCents: number;
  debitCredit: "debit" | "credit";
  description: string;
  sourceType: string;
  sourceId: string;
};

export function normalizeMappingKey(value: string | null | undefined) {
  return String(value ?? "default").trim().toLowerCase();
}

export function resolveMapping(mappings: Mapping[], mappingType: string, sourceKey: string | null | undefined) {
  const type = normalizeMappingKey(mappingType);
  const key = normalizeMappingKey(sourceKey);
  const active = mappings.filter((mapping) => mapping.active !== false && normalizeMappingKey(mapping.mappingType) === type);

  return active.find((mapping) => normalizeMappingKey(mapping.sourceKey) === key)
    ?? active.find((mapping) => normalizeMappingKey(mapping.sourceKey) === "default")
    ?? null;
}

function account(mappings: Mapping[], type: string, key: string | null | undefined, fallback: string) {
  return resolveMapping(mappings, type, key)?.externalAccountId ?? fallback;
}

function line(accountId: string, amountCents: number, debitCredit: "debit" | "credit", description: string, sourceType: string, sourceId: string): JournalLine {
  return { accountId, amountCents: Math.abs(Math.round(amountCents)), debitCredit, description, sourceType, sourceId };
}

export function journalPreviewForSale(input: { saleId: string; amountCents: number; category: string; mappings: Mapping[] }) {
  return [
    line(account(input.mappings, "undeposited_funds", "default", "1100"), input.amountCents, "debit", "Operational sale receivable/undeposited funds", "sale", input.saleId),
    line(account(input.mappings, "revenue", input.category, "4000"), input.amountCents, "credit", `${input.category} operational revenue`, "sale", input.saleId)
  ];
}

export function journalPreviewForPayment(input: { paymentId: string; amountCents: number; method: string; mappings: Mapping[] }) {
  return [
    line(account(input.mappings, "cash", input.method, "1010"), input.amountCents, "debit", "Payment clearing/deposit", "payment", input.paymentId),
    line(account(input.mappings, "undeposited_funds", "default", "1100"), input.amountCents, "credit", "Payment applied to receivable/undeposited funds", "payment", input.paymentId)
  ];
}

export function journalPreviewForRefund(input: { refundId: string; amountCents: number; method: string; mappings: Mapping[] }) {
  return [
    line(account(input.mappings, "refund", "default", "4000"), input.amountCents, "debit", "Operational refund or revenue contra", "refund", input.refundId),
    line(account(input.mappings, "cash", input.method, "1010"), input.amountCents, "credit", "Refund paid from clearing/deposit account", "refund", input.refundId)
  ];
}

export function journalPreviewForCogs(input: { usageId: string; amountCents: number; mappings: Mapping[] }) {
  return [
    line(account(input.mappings, "cogs", "inventory_usage", "5000"), input.amountCents, "debit", "Treatment inventory usage COGS", "inventory_usage", input.usageId),
    line(account(input.mappings, "inventory_asset", "default", "1200"), input.amountCents, "credit", "Inventory asset reduction", "inventory_usage", input.usageId)
  ];
}

export function journalPreviewForExpense(input: { sourceId: string; sourceType: string; amountCents: number; mappingType: string; description: string; mappings: Mapping[] }) {
  return [
    line(account(input.mappings, input.mappingType, "default", "6100"), input.amountCents, "debit", input.description, input.sourceType, input.sourceId),
    line(account(input.mappings, "cash", "stripe_card", "1010"), input.amountCents, "credit", "Accrued/export clearing account", input.sourceType, input.sourceId)
  ];
}

export function balanceJournal(lines: JournalLine[]) {
  const debitTotalCents = lines.filter((item) => item.debitCredit === "debit").reduce((sum, item) => sum + item.amountCents, 0);
  const creditTotalCents = lines.filter((item) => item.debitCredit === "credit").reduce((sum, item) => sum + item.amountCents, 0);
  return { debitTotalCents, creditTotalCents, balanced: debitTotalCents === creditTotalCents };
}

export function batchIdempotencyKey(input: { connectionId: string | null; sourceType: string; sourceId: string; exportVersion?: number }) {
  return [input.connectionId ?? "csv", input.sourceType, input.sourceId, String(input.exportVersion ?? 1)].join(":");
}

export function reconciliationStatus(input: { avoraGrossCents: number; processorGrossCents: number; avoraNetCents?: number; processorNetCents?: number }) {
  if (input.avoraGrossCents === input.processorGrossCents && (input.avoraNetCents ?? input.processorNetCents ?? 0) === (input.processorNetCents ?? input.avoraNetCents ?? 0)) return "matched";
  if (input.processorGrossCents === 0) return "unmatched";
  return "partial";
}

export function closeReadiness(input: { requiredItems: number; completedRequiredItems: number; openCriticalExceptions: number; unbalancedBatches: number }) {
  if (input.requiredItems === 0) return { readiness: 0, blockers: ["No close checklist exists"] };
  const blockers = [
    ...(input.openCriticalExceptions > 0 ? [`${input.openCriticalExceptions} critical exception(s)`] : []),
    ...(input.unbalancedBatches > 0 ? [`${input.unbalancedBatches} unbalanced batch(es)`] : []),
    ...(input.completedRequiredItems < input.requiredItems ? ["Required close checklist is incomplete"] : [])
  ];
  return {
    readiness: Math.max(0, Math.round((input.completedRequiredItems / input.requiredItems) * 100) - blockers.length * 10),
    blockers
  };
}

export function periodContainsDate(period: { periodStart: string; periodEnd: string }, date: string) {
  return date >= period.periodStart && date <= period.periodEnd;
}

export function postCloseAdjustmentNeeded(period: { status: string; periodStart: string; periodEnd: string }, transactionDate: string) {
  return period.status === "closed" && periodContainsDate(period, transactionDate);
}

export function csvRowsForJournal(lines: JournalLine[]) {
  return [
    ["Source Type", "Source ID", "Account", "Debit", "Credit", "Description"].join(","),
    ...lines.map((item) => [
      item.sourceType,
      item.sourceId,
      item.accountId,
      item.debitCredit === "debit" ? (item.amountCents / 100).toFixed(2) : "",
      item.debitCredit === "credit" ? (item.amountCents / 100).toFixed(2) : "",
      `"${item.description.replaceAll("\"", "\"\"")}"`
    ].join(","))
  ].join("\n");
}

export function assertNoLiveAccountingAction(action: string): never {
  throw new Error(`${action} is not available in Phase 18 development mode; use CSV/mock exports only`);
}
