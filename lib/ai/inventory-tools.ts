import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentProfile } from "@/lib/auth/profile";
import { formatMoney } from "@/lib/financial/money";
import { getInventoryReport } from "@/lib/inventory/reports";
import { grossProfit } from "@/lib/inventory/metrics";

export async function getInventorySummary(supabase: SupabaseClient, profile: CurrentProfile, locationIds: string[], question = "") {
  const report = await getInventoryReport(supabase, { organizationId: profile.organizationId, locationIds });
  const lowStock = report.rows.filter((row) => row.stockStatus === "low_stock" || row.stockStatus === "out_of_stock");
  const expiring = report.rows.filter((row) => row.expiration_date && new Date(row.expiration_date) <= new Date(Date.now() + 90 * 86_400_000));
  const wasteCost = report.usage
    .filter((row) => String(row.created_at ?? "").startsWith(new Date().toISOString().slice(0, 7)))
    .reduce((sum, row) => sum + Number(row.total_cost_cents ?? 0), 0);
  const serviceCogs = new Map<string, number>();

  for (const usage of report.usage) {
    const session = Array.isArray(usage.treatment_sessions) ? usage.treatment_sessions[0] : usage.treatment_sessions;
    const service = Array.isArray(session?.services) ? session?.services[0] : session?.services;
    const label = service?.name ?? "Other";
    serviceCogs.set(label, (serviceCogs.get(label) ?? 0) + Number(usage.total_cost_cents ?? 0));
  }

  const highestCogs = Array.from(serviceCogs.entries()).sort((a, b) => b[1] - a[1])[0];

  return {
    facts: [
      `Inventory value is ${formatMoney(report.summary.inventoryValueCents)} across the selected allowed location scope.`,
      `${report.summary.lowStockCount} items are low stock and ${report.summary.outOfStockCount} are out of stock.`,
      `${report.summary.expiringSoonCount} lots expire within 90 days.`,
      `Open purchase orders: ${report.summary.openPurchaseOrders}.`,
      `Direct inventory COGS in the loaded usage set is ${formatMoney(report.summary.cogsThisMonth)}.`
    ],
    analysis: [
      lowStock.length ? `Reorder candidates: ${lowStock.slice(0, 5).map((row) => `${row.itemName} at ${row.locationName}`).join(", ")}.` : "No low-stock item appears in the current result set.",
      expiring.length ? `Expiring lots: ${expiring.slice(0, 5).map((row) => `${row.itemName} ${row.lot_number ?? ""}`).join(", ")}.` : "No expiring lots appear in the current result set.",
      highestCogs ? `Highest direct product cost in usage data: ${highestCogs[0]} at ${formatMoney(highestCogs[1])}.` : "No treatment usage COGS is available yet.",
      question.toLowerCase().includes("margin") ? `Gross profit is computed as collected revenue less direct inventory COGS; current inventory-only gross profit baseline is ${formatMoney(grossProfit(report.summary.inventoryValueCents, report.summary.cogsThisMonth).profitCents)}.` : "Inventory recommendations are read-only; AI cannot place POs, approve POs, or adjust stock."
    ],
    recommendations: [
      lowStock.length ? "Review reorder suggestions before creating any draft purchase order." : "Keep current par levels under observation as usage grows.",
      expiring.length ? "Prioritize FEFO usage review for expiring active lots." : "No expiration intervention is indicated from the loaded rows.",
      "Use the inventory and gross-profit reports for audited figures before making operational decisions."
    ],
    trace: {
      tools: ["getInventorySummary", "getLowStockItems", "getExpiringLots", "getInventoryValuation", "getCOGSSummary", "getServiceGrossProfit", "getWasteSummary"],
      locations: locationIds,
      recordCounts: {
        inventory_lots: report.rows.length,
        low_stock_items: lowStock.length,
        expiring_lots: expiring.length,
        purchase_orders: report.purchaseOrders.length,
        usage_rows: report.usage.length
      },
      filters: { question, wasteCost }
    }
  };
}

export const getLowStockItems = getInventorySummary;
export const getExpiringLots = getInventorySummary;
export const getInventoryValuation = getInventorySummary;
export const getCOGSSummary = getInventorySummary;
export const getServiceGrossProfit = getInventorySummary;
export const getWasteSummary = getInventorySummary;
