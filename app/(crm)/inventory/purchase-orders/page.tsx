import Link from "next/link";
import { ApprovePurchaseOrderForm, PurchaseOrderForm, ReceivePurchaseOrderItemForm } from "@/components/crm/InventoryForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { formatDate, fromDbStatus } from "@/lib/crm/constants";
import { formatMoney } from "@/lib/financial/money";
import { hasInventoryPermission } from "@/lib/inventory/permissions";
import { createClient } from "@/lib/supabase/server";

type Relation<T> = T | T[] | null;

function first<T>(value: Relation<T> | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PurchaseOrdersPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const selectedLocationId = await getSelectedLocationId(profile);
  const locationIds = allowedLocationIds(profile, selectedLocationId);

  if (!hasInventoryPermission(profile, "inventory.purchase_orders.read")) {
    return (
      <div className="page-stack">
        <PageHeader description="Your current role does not include purchase order access." title="Purchase Orders" />
      </div>
    );
  }

  const poQuery = supabase
    .from("purchase_orders")
    .select("id, po_number, status, order_date, expected_date, total_cents, notes, locations(name), vendors(name), creator:user_profiles!purchase_orders_created_by_fkey(full_name), purchase_order_items(id, quantity_ordered, quantity_received, unit_cost_cents, line_total_cents, vendor_sku, inventory_items(name, unit_of_measure))")
    .eq("organization_id", profile.organizationId)
    .order("order_date", { ascending: false })
    .limit(60);
  if (locationIds.length > 0) poQuery.in("location_id", locationIds);

  const [{ data: orders }, { data: items }, { data: vendors }] = await Promise.all([
    poQuery,
    supabase.from("inventory_items").select("id, name").eq("organization_id", profile.organizationId).eq("active", true).order("name"),
    supabase.from("vendors").select("id, name").eq("organization_id", profile.organizationId).eq("active", true).order("name")
  ]);

  const itemOptions = (items ?? []).map((item) => ({ id: item.id, name: item.name }));
  const vendorOptions = (vendors ?? []).map((vendor) => ({ id: vendor.id, name: vendor.name }));

  return (
    <div className="page-stack">
      <PageHeader
        action={<div className="header-actions"><Link className="secondary-button" href="/api/exports/inventory?type=pos">Export POs</Link><Link className="primary-button" href="/inventory">Inventory</Link></div>}
        description="Draft, approve, order, and receive fictional development purchase orders."
        title="Purchase Orders"
      />
      {hasInventoryPermission(profile, "inventory.purchase_orders.create") ? <section className="panel"><div className="panel-header"><h2>Create PO</h2><span>One line item starter PO</span></div><PurchaseOrderForm items={itemOptions} locations={profile.locations} vendors={vendorOptions} /></section> : null}
      <section className="panel">
        <div className="panel-header"><h2>Open & Recent Orders</h2><span>Partial receiving supported</span></div>
        <div className="record-list">
          {(orders ?? []).map((order) => {
            const location = first(order.locations);
            const vendor = first(order.vendors);
            const creator = first(order.creator);
            return (
              <article key={order.id}>
                <div className="split-row">
                  <strong>{order.po_number} - {vendor?.name ?? "Vendor"}</strong>
                  <StatusBadge status={fromDbStatus(order.status)} />
                </div>
                <p>{location?.name ?? "Location"} - ordered {formatDate(order.order_date)} - expected {formatDate(order.expected_date)} - {formatMoney(order.total_cents)}</p>
                <span>Created by {creator?.full_name ?? "Unknown"} - {order.notes ?? "No notes"}</span>
                {order.status === "draft" && hasInventoryPermission(profile, "inventory.purchase_orders.approve") ? <ApprovePurchaseOrderForm purchaseOrderId={order.id} /> : null}
                <div className="record-list compact-list">
                  {(order.purchase_order_items ?? []).map((item) => {
                    const inventoryItem = first(item.inventory_items);
                    const remaining = Number(item.quantity_ordered ?? 0) - Number(item.quantity_received ?? 0);
                    return (
                      <article key={item.id}>
                        <strong>{inventoryItem?.name ?? "Item"} - {item.quantity_received}/{item.quantity_ordered} {inventoryItem?.unit_of_measure ?? "unit"}</strong>
                        <p>{formatMoney(item.unit_cost_cents)} each - {formatMoney(item.line_total_cents)} line total - remaining {remaining}</p>
                        {remaining > 0 && hasInventoryPermission(profile, "inventory.receive") ? <ReceivePurchaseOrderItemForm itemId={item.id} /> : null}
                      </article>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
