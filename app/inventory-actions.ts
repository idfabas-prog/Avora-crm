"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { dollarsToCents } from "@/lib/financial/money";
import { assertInventoryPermission, inventoryLocationAllowed } from "@/lib/inventory/permissions";
import { emitDomainEvent } from "@/lib/workflows/server-events";

function required(value: FormDataEntryValue | null, label: string) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function optional(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

function checked(value: FormDataEntryValue | null) {
  return String(value ?? "") === "on";
}

function numberValue(value: FormDataEntryValue | null, fallback = 0) {
  const text = String(value ?? "").trim();
  return text ? Number(text) : fallback;
}

async function audit(action: string, entityTable: string, entityId: string | null, metadata: Record<string, unknown> = {}) {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  await supabase.from("audit_logs").insert({
    organization_id: profile.organizationId,
    actor_id: profile.id,
    action,
    entity_table: entityTable,
    entity_id: entityId,
    metadata
  });
}

async function refreshStockAlerts(supabase: Awaited<ReturnType<typeof createClient>>, profile: Awaited<ReturnType<typeof requireCurrentProfile>>) {
  const allowedLocations = profile.locations.map((location) => location.id);
  if (allowedLocations.length === 0) return;

  const [{ data: settings }, { data: lots }] = await Promise.all([
    supabase.from("inventory_location_settings").select("location_id, inventory_item_id, reorder_point, inventory_items(name, unit_of_measure), locations(name)").eq("organization_id", profile.organizationId).eq("active", true).in("location_id", allowedLocations),
    supabase.from("inventory_lots").select("id, location_id, inventory_item_id, quantity_available").eq("organization_id", profile.organizationId).in("location_id", allowedLocations).in("status", ["active", "exhausted"])
  ]);

  for (const setting of settings ?? []) {
    if (setting.reorder_point == null) continue;
    const matchingLots = (lots ?? []).filter((lot) => lot.location_id === setting.location_id && lot.inventory_item_id === setting.inventory_item_id);
    const available = matchingLots.reduce((sum, lot) => sum + Number(lot.quantity_available ?? 0), 0);
    const alertType = available <= 0 ? "out_of_stock" : available <= Number(setting.reorder_point) ? "low_stock" : null;
    if (!alertType) continue;

    const item = Array.isArray(setting.inventory_items) ? setting.inventory_items[0] : setting.inventory_items;
    const location = Array.isArray(setting.locations) ? setting.locations[0] : setting.locations;
    const { data: existing } = await supabase
      .from("inventory_alerts")
      .select("id")
      .eq("organization_id", profile.organizationId)
      .eq("location_id", setting.location_id)
      .eq("inventory_item_id", setting.inventory_item_id)
      .eq("alert_type", alertType)
      .eq("status", "open")
      .is("inventory_lot_id", null)
      .maybeSingle();
    const message = `${item?.name ?? "Inventory item"} at ${location?.name ?? "location"} is ${alertType === "out_of_stock" ? "out of stock" : "at or below reorder point"}.`;

    if (existing?.id) {
      await supabase.from("inventory_alerts").update({ message }).eq("id", existing.id);
    } else {
      await supabase.from("inventory_alerts").insert({
        organization_id: profile.organizationId,
        location_id: setting.location_id,
        inventory_item_id: setting.inventory_item_id,
        inventory_lot_id: null,
        alert_type: alertType,
        status: "open",
        message
      });
      await emitDomainEvent({
        organizationId: profile.organizationId,
        eventType: alertType === "out_of_stock" ? "inventory.out_of_stock" : "inventory.low_stock",
        entityType: "inventory_item",
        entityId: setting.inventory_item_id,
        locationId: setting.location_id,
        payload: { available, reorder_point: setting.reorder_point }
      });
    }
  }
}

function assertLocation(profile: Awaited<ReturnType<typeof requireCurrentProfile>>, locationId: string) {
  if (!inventoryLocationAllowed(profile, locationId)) {
    throw new Error("Inventory location is not available for this user");
  }
}

export async function upsertInventoryItem(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertInventoryPermission(profile, "inventory.write");
  const supabase = await createClient();
  const itemId = optional(formData.get("inventory_item_id"));
  const payload = {
    organization_id: profile.organizationId,
    name: required(formData.get("name"), "Item name"),
    sku: optional(formData.get("sku")),
    category: required(formData.get("category"), "Category"),
    description: optional(formData.get("description")),
    unit_of_measure: required(formData.get("unit_of_measure"), "Unit"),
    default_cost_cents: dollarsToCents(optional(formData.get("default_cost"))),
    track_lot: checked(formData.get("track_lot")),
    track_expiration: checked(formData.get("track_expiration")),
    active: checked(formData.get("active"))
  };
  const query = itemId
    ? supabase.from("inventory_items").update(payload).eq("id", itemId).eq("organization_id", profile.organizationId).select("id").single()
    : supabase.from("inventory_items").insert(payload).select("id").single();
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  await audit(itemId ? "Inventory Item Updated" : "Inventory Item Created", "inventory_items", data.id);
  revalidatePath("/inventory");
  revalidatePath("/settings/inventory/items");
}

export async function upsertVendor(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertInventoryPermission(profile, "inventory.vendors.manage");
  const supabase = await createClient();
  const vendorId = optional(formData.get("vendor_id"));
  const payload = {
    organization_id: profile.organizationId,
    name: required(formData.get("name"), "Vendor name"),
    contact_name: optional(formData.get("contact_name")),
    email: optional(formData.get("email")),
    phone: optional(formData.get("phone")),
    website: optional(formData.get("website")),
    account_number: optional(formData.get("account_number")),
    notes: optional(formData.get("notes")),
    active: checked(formData.get("active"))
  };
  const query = vendorId
    ? supabase.from("vendors").update(payload).eq("id", vendorId).eq("organization_id", profile.organizationId).select("id").single()
    : supabase.from("vendors").insert(payload).select("id").single();
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  await audit("Vendor Updated", "vendors", data.id);
  revalidatePath("/settings/inventory/vendors");
}

export async function upsertInventoryLocationSetting(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertInventoryPermission(profile, "inventory.settings.manage");
  const supabase = await createClient();
  const locationId = required(formData.get("location_id"), "Location");
  assertLocation(profile, locationId);
  const { error } = await supabase.from("inventory_location_settings").upsert({
    organization_id: profile.organizationId,
    location_id: locationId,
    inventory_item_id: required(formData.get("inventory_item_id"), "Inventory item"),
    par_level: numberValue(formData.get("par_level")),
    reorder_point: numberValue(formData.get("reorder_point")),
    reorder_quantity: numberValue(formData.get("reorder_quantity")),
    active: checked(formData.get("active"))
  }, { onConflict: "location_id,inventory_item_id" });
  if (error) throw new Error(error.message);
  await audit("Inventory Reorder Setting Updated", "inventory_location_settings", null, { location_id: locationId });
  revalidatePath("/inventory");
  revalidatePath("/settings/inventory/items");
}

export async function createPurchaseOrder(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertInventoryPermission(profile, "inventory.purchase_orders.create");
  const supabase = await createClient();
  const locationId = required(formData.get("location_id"), "Location");
  assertLocation(profile, locationId);
  const quantity = numberValue(formData.get("quantity"), 1);
  const unitCostCents = dollarsToCents(required(formData.get("unit_cost"), "Unit cost"));
  const poNumber = required(formData.get("po_number"), "PO number");
  const { data: po, error } = await supabase.from("purchase_orders").insert({
    organization_id: profile.organizationId,
    location_id: locationId,
    vendor_id: required(formData.get("vendor_id"), "Vendor"),
    po_number: poNumber,
    status: "draft",
    order_date: required(formData.get("order_date"), "Order date"),
    expected_date: optional(formData.get("expected_date")),
    subtotal_cents: Math.round(quantity * unitCostCents),
    shipping_cents: dollarsToCents(optional(formData.get("shipping"))),
    tax_cents: dollarsToCents(optional(formData.get("tax"))),
    total_cents: Math.round(quantity * unitCostCents) + dollarsToCents(optional(formData.get("shipping"))) + dollarsToCents(optional(formData.get("tax"))),
    notes: optional(formData.get("notes")),
    created_by: profile.id
  }).select("id").single();
  if (error) throw new Error(error.message);
  const { error: itemError } = await supabase.from("purchase_order_items").insert({
    purchase_order_id: po.id,
    inventory_item_id: required(formData.get("inventory_item_id"), "Inventory item"),
    vendor_sku: optional(formData.get("vendor_sku")),
    quantity_ordered: quantity,
    unit_cost_cents: unitCostCents,
    line_total_cents: Math.round(quantity * unitCostCents),
    notes: optional(formData.get("item_notes"))
  });
  if (itemError) throw new Error(itemError.message);
  await audit("PO Created", "purchase_orders", po.id, { location_id: locationId });
  await emitDomainEvent({ organizationId: profile.organizationId, eventType: "inventory.po_created", entityType: "purchase_order", entityId: po.id, locationId, payload: { po_number: poNumber } });
  revalidatePath("/inventory/purchase-orders");
}

export async function approvePurchaseOrder(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertInventoryPermission(profile, "inventory.purchase_orders.approve");
  const supabase = await createClient();
  const poId = required(formData.get("purchase_order_id"), "Purchase order");
  const { error } = await supabase.from("purchase_orders").update({ status: "approved", approved_by: profile.id, approved_at: new Date().toISOString() }).eq("id", poId).eq("organization_id", profile.organizationId);
  if (error) throw new Error(error.message);
  await audit("PO Approved", "purchase_orders", poId);
  revalidatePath("/inventory/purchase-orders");
}

export async function receivePurchaseOrderItem(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertInventoryPermission(profile, "inventory.receive");
  const supabase = await createClient();
  const poItemId = required(formData.get("purchase_order_item_id"), "PO item");
  const { error } = await supabase.rpc("receive_purchase_order_item", {
    target_purchase_order_item_id: poItemId,
    received_quantity: numberValue(formData.get("received_quantity"), 1),
    received_lot_number: optional(formData.get("lot_number")),
    received_expiration_date: optional(formData.get("expiration_date")),
    received_date: optional(formData.get("received_date")) ?? new Date().toISOString().slice(0, 10),
    idempotency_key: optional(formData.get("idempotency_key")) ?? `receive-${poItemId}-${crypto.randomUUID()}`,
    actor_user_id: profile.id
  });
  if (error) throw new Error(error.message);
  await audit("PO Received", "purchase_order_items", poItemId);
  await emitDomainEvent({ organizationId: profile.organizationId, eventType: "inventory.po_received", entityType: "purchase_order_item", entityId: poItemId, payload: { quantity: numberValue(formData.get("received_quantity"), 1) } });
  await refreshStockAlerts(supabase, profile);
  revalidatePath("/inventory");
  revalidatePath("/inventory/purchase-orders");
}

export async function receiveInventoryStock(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertInventoryPermission(profile, "inventory.receive");
  const supabase = await createClient();
  const locationId = required(formData.get("location_id"), "Location");
  assertLocation(profile, locationId);
  const itemId = required(formData.get("inventory_item_id"), "Inventory item");
  const { error } = await supabase.rpc("receive_inventory_stock", {
    target_organization_id: profile.organizationId,
    target_location_id: locationId,
    target_inventory_item_id: itemId,
    target_vendor_id: optional(formData.get("vendor_id")),
    received_quantity: numberValue(formData.get("received_quantity"), 1),
    received_lot_number: optional(formData.get("lot_number")),
    received_expiration_date: optional(formData.get("expiration_date")),
    received_date: optional(formData.get("received_date")) ?? new Date().toISOString().slice(0, 10),
    unit_cost_cents: dollarsToCents(required(formData.get("unit_cost"), "Unit cost")),
    receive_reason: required(formData.get("reason"), "Reason"),
    idempotency_key: optional(formData.get("idempotency_key")) ?? `direct-receive-${itemId}-${locationId}-${crypto.randomUUID()}`,
    actor_user_id: profile.id
  });
  if (error) throw new Error(error.message);
  await audit("Stock Received", "inventory_lots", null, { location_id: locationId, inventory_item_id: itemId });
  await emitDomainEvent({ organizationId: profile.organizationId, eventType: "inventory.po_received", entityType: "inventory_item", entityId: itemId, locationId, payload: { source: "direct_receive" } });
  await refreshStockAlerts(supabase, profile);
  revalidatePath("/inventory");
}

export async function recordInventoryAdjustment(formData: FormData) {
  const profile = await requireCurrentProfile();
  const type = required(formData.get("event_type"), "Event type");
  assertInventoryPermission(profile, type === "waste" ? "inventory.waste" : "inventory.adjust");
  const supabase = await createClient();
  const lotId = required(formData.get("inventory_lot_id"), "Lot");
  const { error } = await supabase.rpc("record_inventory_adjustment", {
    target_lot_id: lotId,
    adjustment_quantity: numberValue(formData.get("quantity"), 1),
    adjustment_type: type,
    adjustment_reason: required(formData.get("reason"), "Reason"),
    idempotency_key: optional(formData.get("idempotency_key")) ?? `${type}-${lotId}-${crypto.randomUUID()}`,
    actor_user_id: profile.id
  });
  if (error) throw new Error(error.message);
  await audit(type === "waste" ? "Waste Recorded" : "Adjustment Recorded", "inventory_lots", lotId, { event_type: type });
  await emitDomainEvent({ organizationId: profile.organizationId, eventType: type === "waste" ? "inventory.waste_recorded" : "inventory.adjustment_recorded", entityType: "inventory_lot", entityId: lotId, payload: { type } });
  await refreshStockAlerts(supabase, profile);
  revalidatePath("/inventory");
}

export async function recordTreatmentInventoryUsage(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertInventoryPermission(profile, "inventory.write");
  const supabase = await createClient();
  const sessionId = required(formData.get("treatment_session_id"), "Treatment session");
  const lotId = required(formData.get("inventory_lot_id"), "Lot");
  const { error } = await supabase.rpc("record_treatment_inventory_usage", {
    target_treatment_session_id: sessionId,
    target_lot_id: lotId,
    used_quantity: numberValue(formData.get("quantity_used"), 1),
    idempotency_key: optional(formData.get("idempotency_key")) ?? `usage-${sessionId}-${lotId}-${crypto.randomUUID()}`,
    actor_user_id: profile.id
  });
  if (error) throw new Error(error.message);
  await audit("Treatment Usage Recorded", "treatment_sessions", sessionId, { lot_id: lotId });
  await emitDomainEvent({ organizationId: profile.organizationId, eventType: "inventory.usage_recorded", entityType: "treatment_session", entityId: sessionId, payload: { lot_id: lotId } });
  await refreshStockAlerts(supabase, profile);
  revalidatePath(`/clinical/sessions/${sessionId}`);
  revalidatePath("/inventory");
  revalidatePath("/reports/gross-profit");
}

export async function createInventoryTransfer(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertInventoryPermission(profile, "inventory.transfer");
  const supabase = await createClient();
  const fromLocationId = required(formData.get("from_location_id"), "From location");
  const toLocationId = required(formData.get("to_location_id"), "To location");
  assertLocation(profile, fromLocationId);
  assertLocation(profile, toLocationId);
  if (fromLocationId === toLocationId) throw new Error("Transfer locations must be different");
  const lotId = required(formData.get("inventory_lot_id"), "Lot");
  const { data: lot, error: lotError } = await supabase
    .from("inventory_lots")
    .select("id, inventory_item_id, location_id, quantity_available")
    .eq("id", lotId)
    .eq("organization_id", profile.organizationId)
    .single();
  if (lotError || !lot) throw new Error(lotError?.message ?? "Inventory lot was not found");
  if (lot.location_id !== fromLocationId) throw new Error("Selected lot is not at the origin location");
  const quantity = numberValue(formData.get("quantity"), 1);
  if (Number(lot.quantity_available ?? 0) < quantity) throw new Error("Insufficient inventory for transfer");

  const { data: transfer, error } = await supabase.from("inventory_transfers").insert({
    organization_id: profile.organizationId,
    from_location_id: fromLocationId,
    to_location_id: toLocationId,
    status: "draft",
    transfer_date: required(formData.get("transfer_date"), "Transfer date"),
    created_by: profile.id,
    notes: optional(formData.get("notes"))
  }).select("id").single();
  if (error) throw new Error(error.message);
  const { error: itemError } = await supabase.from("inventory_transfer_items").insert({
    transfer_id: transfer.id,
    inventory_item_id: lot.inventory_item_id,
    inventory_lot_id: lot.id,
    quantity
  });
  if (itemError) throw new Error(itemError.message);
  await audit("Transfer Created", "inventory_transfers", transfer.id, { from_location_id: fromLocationId, to_location_id: toLocationId });
  await emitDomainEvent({ organizationId: profile.organizationId, eventType: "inventory.transfer_created", entityType: "inventory_transfer", entityId: transfer.id, locationId: fromLocationId, payload: { to_location_id: toLocationId } });
  revalidatePath("/inventory");
}

export async function shipInventoryTransfer(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertInventoryPermission(profile, "inventory.transfer");
  const supabase = await createClient();
  const transferId = required(formData.get("transfer_id"), "Transfer");
  const { error } = await supabase.rpc("ship_inventory_transfer", {
    target_transfer_id: transferId,
    idempotency_key: optional(formData.get("idempotency_key")) ?? `ship-${transferId}`,
    actor_user_id: profile.id
  });
  if (error) throw new Error(error.message);
  await audit("Transfer Shipped", "inventory_transfers", transferId);
  await refreshStockAlerts(supabase, profile);
  revalidatePath("/inventory");
}

export async function receiveInventoryTransfer(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertInventoryPermission(profile, "inventory.transfer");
  const supabase = await createClient();
  const transferId = required(formData.get("transfer_id"), "Transfer");
  const { error } = await supabase.rpc("receive_inventory_transfer", {
    target_transfer_id: transferId,
    idempotency_key: optional(formData.get("idempotency_key")) ?? `receive-transfer-${transferId}`,
    actor_user_id: profile.id
  });
  if (error) throw new Error(error.message);
  await audit("Transfer Received", "inventory_transfers", transferId);
  await emitDomainEvent({ organizationId: profile.organizationId, eventType: "inventory.transfer_received", entityType: "inventory_transfer", entityId: transferId, payload: {} });
  await refreshStockAlerts(supabase, profile);
  revalidatePath("/inventory");
}
