export type StockLot = {
  quantity_available: number;
  cost_per_unit_cents: number;
  expiration_date?: string | null;
  status: string;
};

export type ReorderSettings = {
  par_level?: number | null;
  reorder_point?: number | null;
  reorder_quantity?: number | null;
};

export function inventoryValueCents(lots: StockLot[]) {
  return lots.reduce((sum, lot) => sum + Math.max(lot.quantity_available, 0) * lot.cost_per_unit_cents, 0);
}

export function stockStatus(available: number, settings: ReorderSettings) {
  if (available <= 0) return "out_of_stock";
  if (settings.reorder_point != null && available <= settings.reorder_point) return "low_stock";
  return "in_stock";
}

export function reorderSuggestion(available: number, settings: ReorderSettings) {
  if (settings.reorder_point == null || available > settings.reorder_point) return 0;
  const parGap = settings.par_level == null ? 0 : Math.max(settings.par_level - available, 0);
  return Math.max(settings.reorder_quantity ?? 0, parGap);
}

export function expiringBucket(expirationDate: string | null | undefined, today = new Date()) {
  if (!expirationDate) return "no_expiration";
  const expiration = new Date(`${expirationDate}T00:00:00`);
  const days = Math.ceil((expiration.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return "expired";
  if (days <= 30) return "expiring_30";
  if (days <= 60) return "expiring_60";
  if (days <= 90) return "expiring_90";
  return "valid";
}

export function canUseLot(lot: StockLot, quantity: number, today = new Date()) {
  if (quantity <= 0) return { allowed: false, reason: "Quantity must be positive" };
  if (lot.status !== "active") return { allowed: false, reason: "Lot is not active" };
  if (expiringBucket(lot.expiration_date, today) === "expired") return { allowed: false, reason: "Lot is expired" };
  if (lot.quantity_available < quantity) return { allowed: false, reason: "Insufficient inventory available" };
  return { allowed: true, reason: null };
}

export function cogsForUsage(usages: Array<{ total_cost_cents: number }>) {
  return usages.reduce((sum, usage) => sum + usage.total_cost_cents, 0);
}

export function grossProfit(collectedRevenueCents: number, directCogsCents: number) {
  const profitCents = collectedRevenueCents - directCogsCents;
  return {
    profitCents,
    margin: collectedRevenueCents > 0 ? profitCents / collectedRevenueCents : 0
  };
}
