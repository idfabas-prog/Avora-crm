export type HealthSale = {
  id: string;
  subtotal_cents: number | null;
  discount_amount_cents: number | null;
  total_amount_cents: number | null;
  paid_amount_cents: number | null;
  refunded_amount_cents: number | null;
  balance_due_cents: number | null;
  sale_items?: Array<{ quantity: number | null; unit_price_cents: number | null; discount_amount_cents: number | null; line_total_cents: number | null }> | null;
  payments?: Array<{ amount_cents: number | null; status: string | null }> | null;
  refunds?: Array<{ amount_cents: number | null; status: string | null }> | null;
};

export type HealthIssue = {
  severity: "warning" | "critical";
  entity: string;
  entityId: string;
  message: string;
};

export function detectSaleHealthIssues(sales: HealthSale[]) {
  const issues: HealthIssue[] = [];

  for (const sale of sales) {
    const expectedSubtotal = (sale.sale_items ?? []).reduce((sum, item) => sum + (item.quantity ?? 0) * (item.unit_price_cents ?? 0), 0);
    const expectedDiscount = (sale.sale_items ?? []).reduce((sum, item) => sum + (item.discount_amount_cents ?? 0), 0);
    const expectedTotal = Math.max(expectedSubtotal - expectedDiscount, 0);
    const expectedPaid = (sale.payments ?? []).filter((payment) => payment.status === "succeeded").reduce((sum, payment) => sum + (payment.amount_cents ?? 0), 0);
    const expectedRefunded = (sale.refunds ?? []).filter((refund) => refund.status === "succeeded").reduce((sum, refund) => sum + (refund.amount_cents ?? 0), 0);
    const expectedBalance = Math.max(expectedTotal - expectedPaid + expectedRefunded, 0);

    if ((sale.subtotal_cents ?? 0) !== expectedSubtotal) {
      issues.push({ severity: "warning", entity: "sales", entityId: sale.id, message: "Sale subtotal does not match line items" });
    }
    if ((sale.discount_amount_cents ?? 0) !== expectedDiscount) {
      issues.push({ severity: "warning", entity: "sales", entityId: sale.id, message: "Sale discount total does not match line items" });
    }
    if ((sale.total_amount_cents ?? 0) !== expectedTotal) {
      issues.push({ severity: "critical", entity: "sales", entityId: sale.id, message: "Sale total does not match recalculated line total" });
    }
    if ((sale.paid_amount_cents ?? 0) !== expectedPaid) {
      issues.push({ severity: "critical", entity: "sales", entityId: sale.id, message: "Paid amount does not match succeeded payments" });
    }
    if ((sale.refunded_amount_cents ?? 0) !== expectedRefunded) {
      issues.push({ severity: "critical", entity: "sales", entityId: sale.id, message: "Refunded amount does not match succeeded refunds" });
    }
    if ((sale.balance_due_cents ?? 0) !== expectedBalance) {
      issues.push({ severity: "critical", entity: "sales", entityId: sale.id, message: "Balance due does not match total, payments, and refunds" });
    }
  }

  return issues;
}
