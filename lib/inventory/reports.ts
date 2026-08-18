import type { SupabaseClient } from "@supabase/supabase-js";
import { inventoryValueCents, reorderSuggestion, stockStatus } from "./metrics";

export type InventoryReportFilters = {
  organizationId: string;
  locationIds: string[];
};

type LotRow = {
  id: string;
  location_id: string;
  inventory_item_id: string;
  lot_number: string | null;
  expiration_date: string | null;
  quantity_available: number;
  quantity_received: number;
  cost_per_unit_cents: number;
  status: string;
  inventory_items: { name: string; sku: string | null; category: string; unit_of_measure: string } | { name: string; sku: string | null; category: string; unit_of_measure: string }[] | null;
  locations: { name: string } | { name: string }[] | null;
};

function first<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export async function getInventoryReport(supabase: SupabaseClient, filters: InventoryReportFilters) {
  const lotsQuery = supabase
    .from("inventory_lots")
    .select("id, location_id, inventory_item_id, lot_number, expiration_date, quantity_available, quantity_received, cost_per_unit_cents, status, inventory_items(name, sku, category, unit_of_measure), locations(name)")
    .eq("organization_id", filters.organizationId)
    .order("expiration_date", { ascending: true });
  const poQuery = supabase
    .from("purchase_orders")
    .select("id, status, total_cents, order_date, expected_date, location_id, vendors(name), locations(name)")
    .eq("organization_id", filters.organizationId)
    .order("order_date", { ascending: false })
    .limit(100);
  const usageQuery = supabase
    .from("treatment_inventory_usage")
    .select("id, location_id, inventory_item_id, treatment_session_id, quantity_used, total_cost_cents, created_at, inventory_items(name, category), treatment_sessions(service_id, services(name), provider:user_profiles!treatment_sessions_provider_id_fkey(full_name))")
    .eq("organization_id", filters.organizationId)
    .limit(1000);
  const settingsQuery = supabase
    .from("inventory_location_settings")
    .select("location_id, inventory_item_id, par_level, reorder_point, reorder_quantity")
    .eq("organization_id", filters.organizationId);

  if (filters.locationIds.length > 0) {
    lotsQuery.in("location_id", filters.locationIds);
    poQuery.in("location_id", filters.locationIds);
    usageQuery.in("location_id", filters.locationIds);
    settingsQuery.in("location_id", filters.locationIds);
  }

  const [{ data: lots }, { data: purchaseOrders }, { data: usage }, { data: settings }] = await Promise.all([lotsQuery, poQuery, usageQuery, settingsQuery]);
  const lotRows = (lots ?? []) as LotRow[];
  const settingsByLocationItem = new Map((settings ?? []).map((row) => [`${row.location_id}:${row.inventory_item_id}`, row]));
  const rows = lotRows.map((lot) => {
    const item = first(lot.inventory_items);
    const location = first(lot.locations);
    const itemSettings = settingsByLocationItem.get(`${lot.location_id}:${lot.inventory_item_id}`) ?? {};
    return {
      ...lot,
      itemName: item?.name ?? "Inventory Item",
      sku: item?.sku ?? null,
      category: item?.category ?? "Other",
      unit: item?.unit_of_measure ?? "unit",
      locationName: location?.name ?? "Location",
      valueCents: Math.round(lot.quantity_available * lot.cost_per_unit_cents),
      stockStatus: stockStatus(lot.quantity_available, itemSettings),
      reorderQuantity: reorderSuggestion(lot.quantity_available, itemSettings)
    };
  });
  const cogsThisMonth = (usage ?? []).reduce((sum, item) => sum + item.total_cost_cents, 0);

  return {
    rows,
    purchaseOrders: purchaseOrders ?? [],
    usage: usage ?? [],
    summary: {
      inventoryValueCents: Math.round(inventoryValueCents(lotRows)),
      lowStockCount: rows.filter((row) => row.stockStatus === "low_stock").length,
      outOfStockCount: rows.filter((row) => row.stockStatus === "out_of_stock").length,
      expiringSoonCount: rows.filter((row) => row.expiration_date && new Date(row.expiration_date) <= new Date(Date.now() + 90 * 86_400_000)).length,
      openPurchaseOrders: (purchaseOrders ?? []).filter((po) => !["received", "closed", "cancelled"].includes(po.status)).length,
      cogsThisMonth
    }
  };
}
