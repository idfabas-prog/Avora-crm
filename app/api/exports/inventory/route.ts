import { requireCurrentProfile } from "@/lib/auth/profile";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { csvMoney, rowsToCsv } from "@/lib/financial/csv";
import { hasInventoryPermission } from "@/lib/inventory/permissions";
import { createClient } from "@/lib/supabase/server";

type ExportType = "inventory" | "lots" | "pos" | "waste" | "cogs" | "gross-profit";
type Relation<T> = T | T[] | null;

function first<T>(value: Relation<T> | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function download(csv: string, filename: string) {
  return new Response(csv, {
    headers: {
      "content-disposition": `attachment; filename="${filename}"`,
      "content-type": "text/csv; charset=utf-8"
    }
  });
}

export async function GET(request: Request) {
  const profile = await requireCurrentProfile();
  if (!hasInventoryPermission(profile, "inventory.reports.read")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const type = ((new URL(request.url).searchParams.get("type") ?? "inventory") as ExportType);
  const supabase = await createClient();
  const selectedLocationId = await getSelectedLocationId(profile);
  const locationIds = allowedLocationIds(profile, selectedLocationId);

  if (type === "pos") {
    const query = supabase.from("purchase_orders").select("po_number, status, order_date, expected_date, subtotal_cents, shipping_cents, tax_cents, total_cents, locations(name), vendors(name)").eq("organization_id", profile.organizationId).order("order_date", { ascending: false }).limit(1000);
    if (locationIds.length > 0) query.in("location_id", locationIds);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = (data ?? []).map((po) => {
      const location = first(po.locations);
      const vendor = first(po.vendors);
      return [po.po_number, po.status, po.order_date, po.expected_date, location?.name, vendor?.name, csvMoney(po.subtotal_cents), csvMoney(po.shipping_cents), csvMoney(po.tax_cents), csvMoney(po.total_cents)];
    });
    return download(rowsToCsv(["po_number", "status", "order_date", "expected_date", "location", "vendor", "subtotal", "shipping", "tax", "total"], rows), "avora-inventory-purchase-orders.csv");
  }

  if (type === "cogs") {
    const query = supabase.from("treatment_inventory_usage").select("created_at, quantity_used, unit_cost_cents, total_cost_cents, locations(name), inventory_items(name, category), inventory_lots(lot_number), treatment_sessions(services(name), provider:user_profiles!treatment_sessions_provider_id_fkey(full_name))").eq("organization_id", profile.organizationId).order("created_at", { ascending: false }).limit(1000);
    if (locationIds.length > 0) query.in("location_id", locationIds);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = (data ?? []).map((row) => {
      const location = first(row.locations);
      const item = first(row.inventory_items);
      const lot = first(row.inventory_lots);
      const session = first(row.treatment_sessions);
      const service = first(session?.services);
      const provider = first(session?.provider);
      return [row.created_at, location?.name, item?.name, item?.category, lot?.lot_number, service?.name, provider?.full_name, row.quantity_used, csvMoney(row.unit_cost_cents), csvMoney(row.total_cost_cents)];
    });
    return download(rowsToCsv(["created_at", "location", "item", "category", "lot", "service", "provider", "quantity", "unit_cost", "total_cost"], rows), "avora-inventory-cogs.csv");
  }

  if (type === "waste") {
    const query = supabase.from("inventory_events").select("created_at, event_type, quantity, unit_cost_cents, reason, locations(name), inventory_items(name, category), inventory_lots(lot_number), creator:user_profiles!inventory_events_created_by_fkey(full_name)").eq("organization_id", profile.organizationId).eq("event_type", "waste").order("created_at", { ascending: false }).limit(1000);
    if (locationIds.length > 0) query.in("location_id", locationIds);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = (data ?? []).map((row) => {
      const location = first(row.locations);
      const item = first(row.inventory_items);
      const lot = first(row.inventory_lots);
      const creator = first(row.creator);
      const cost = Math.round(Math.abs(Number(row.quantity ?? 0)) * Number(row.unit_cost_cents ?? 0));
      return [row.created_at, location?.name, item?.name, item?.category, lot?.lot_number, row.quantity, csvMoney(row.unit_cost_cents), csvMoney(cost), row.reason, creator?.full_name];
    });
    return download(rowsToCsv(["created_at", "location", "item", "category", "lot", "quantity", "unit_cost", "waste_cost", "reason", "user"], rows), "avora-inventory-waste.csv");
  }

  const query = supabase.from("inventory_lots").select("lot_number, expiration_date, received_date, quantity_received, quantity_available, cost_per_unit_cents, status, locations(name), inventory_items(name, sku, category, unit_of_measure), vendors(name)").eq("organization_id", profile.organizationId).order("expiration_date", { ascending: true }).limit(1000);
  if (locationIds.length > 0) query.in("location_id", locationIds);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []).map((lot) => {
    const location = first(lot.locations);
    const item = first(lot.inventory_items);
    const vendor = first(lot.vendors);
    const value = Math.round(Number(lot.quantity_available ?? 0) * Number(lot.cost_per_unit_cents ?? 0));
    return [location?.name, item?.name, item?.sku, item?.category, lot.lot_number, lot.status, lot.quantity_received, lot.quantity_available, item?.unit_of_measure, lot.expiration_date, lot.received_date, vendor?.name, csvMoney(lot.cost_per_unit_cents), csvMoney(value)];
  });
  return download(rowsToCsv(["location", "item", "sku", "category", "lot", "status", "received", "available", "unit", "expiration", "received_date", "vendor", "unit_cost", "value"], rows), "avora-inventory-lots.csv");
}
