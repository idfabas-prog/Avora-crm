import type { SupabaseClient } from "@supabase/supabase-js";

export type FinancialSummary = {
  grossSalesCents: number;
  collectedCents: number;
  refundedCents: number;
  netCollectedCents: number;
  outstandingCents: number;
  averageTicketCents: number;
  saleCount: number;
  paidSaleCount: number;
  partialSaleCount: number;
};

type QueryFilters = {
  organizationId: string;
  locationIds: string[];
  contactId?: string;
  startDate?: string;
  endDate?: string;
};

function applyLocation<T extends { in: (column: string, values: string[]) => T }>(query: T, locationIds: string[]) {
  return locationIds.length > 0 ? query.in("location_id", locationIds) : query;
}

function applyDate<T extends { gte: (column: string, value: string) => T; lte: (column: string, value: string) => T }>(
  query: T,
  column: string,
  filters: Pick<QueryFilters, "startDate" | "endDate">
) {
  let next = query;
  if (filters.startDate) next = next.gte(column, filters.startDate);
  if (filters.endDate) next = next.lte(column, filters.endDate);
  return next;
}

export async function getFinancialSummary(supabase: SupabaseClient, filters: QueryFilters): Promise<FinancialSummary> {
  let salesQuery = supabase
    .from("sales")
    .select("id, status, total_amount_cents, paid_amount_cents, refunded_amount_cents, balance_due_cents, sale_date")
    .eq("organization_id", filters.organizationId)
    .neq("status", "cancelled");
  salesQuery = applyLocation(salesQuery, filters.locationIds);
  salesQuery = applyDate(salesQuery, "sale_date", filters);
  if (filters.contactId) salesQuery = salesQuery.eq("contact_id", filters.contactId);

  let paymentsQuery = supabase
    .from("payments")
    .select("amount_cents, status, received_at")
    .eq("organization_id", filters.organizationId);
  paymentsQuery = applyLocation(paymentsQuery, filters.locationIds);
  paymentsQuery = applyDate(paymentsQuery, "received_at", filters);
  if (filters.contactId) paymentsQuery = paymentsQuery.eq("contact_id", filters.contactId);

  let refundsQuery = supabase
    .from("refunds")
    .select("amount_cents, status, refunded_at")
    .eq("organization_id", filters.organizationId);
  refundsQuery = applyLocation(refundsQuery, filters.locationIds);
  refundsQuery = applyDate(refundsQuery, "refunded_at", filters);
  if (filters.contactId) refundsQuery = refundsQuery.eq("contact_id", filters.contactId);

  const [{ data: sales, error: salesError }, { data: payments, error: paymentsError }, { data: refunds, error: refundsError }] = await Promise.all([
    salesQuery,
    paymentsQuery,
    refundsQuery
  ]);

  if (salesError) throw new Error(salesError.message);
  if (paymentsError) throw new Error(paymentsError.message);
  if (refundsError) throw new Error(refundsError.message);

  const saleRows = sales ?? [];
  const grossSalesCents = saleRows.reduce((sum, sale) => sum + (sale.total_amount_cents ?? 0), 0);
  const collectedCents = (payments ?? []).filter((payment) => payment.status === "succeeded").reduce((sum, payment) => sum + (payment.amount_cents ?? 0), 0);
  const refundedCents = (refunds ?? []).filter((refund) => refund.status === "succeeded").reduce((sum, refund) => sum + (refund.amount_cents ?? 0), 0);
  const outstandingCents = saleRows.reduce((sum, sale) => sum + (sale.balance_due_cents ?? 0), 0);

  return {
    grossSalesCents,
    collectedCents,
    refundedCents,
    netCollectedCents: Math.max(collectedCents - refundedCents, 0),
    outstandingCents,
    averageTicketCents: saleRows.length ? Math.round(grossSalesCents / saleRows.length) : 0,
    saleCount: saleRows.length,
    paidSaleCount: saleRows.filter((sale) => sale.status === "paid").length,
    partialSaleCount: saleRows.filter((sale) => sale.status === "partially_paid" || sale.status === "partially_refunded").length
  };
}
