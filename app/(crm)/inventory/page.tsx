import Link from "next/link";
import { DirectReceiveInventoryForm, InventoryAdjustmentForm, InventoryTransferForm, TransferStatusForm } from "@/components/crm/InventoryForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { formatDate, fromDbStatus } from "@/lib/crm/constants";
import { formatMoney } from "@/lib/financial/money";
import { hasInventoryPermission } from "@/lib/inventory/permissions";
import { getInventoryReport } from "@/lib/inventory/reports";
import { createClient } from "@/lib/supabase/server";

type Relation<T> = T | T[] | null;

function first<T>(value: Relation<T> | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function InventoryPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const selectedLocationId = await getSelectedLocationId(profile);
  const locationIds = allowedLocationIds(profile, selectedLocationId);
  const canRead = hasInventoryPermission(profile, "inventory.read");

  if (!canRead) {
    return (
      <div className="page-stack">
        <PageHeader description="Your current role does not include inventory access." title="Inventory" />
      </div>
    );
  }

  const report = await getInventoryReport(supabase, { organizationId: profile.organizationId, locationIds });
  const itemsQuery = supabase.from("inventory_items").select("id, name").eq("organization_id", profile.organizationId).eq("active", true).order("name");
  const vendorsQuery = supabase.from("vendors").select("id, name").eq("organization_id", profile.organizationId).eq("active", true).order("name");
  const lotsQuery = supabase
    .from("inventory_lots")
    .select("id, lot_number, quantity_available, inventory_items(name, unit_of_measure), locations(name)")
    .eq("organization_id", profile.organizationId)
    .gt("quantity_available", 0)
    .eq("status", "active")
    .order("expiration_date", { ascending: true });
  const transfersQuery = supabase
    .from("inventory_transfers")
    .select("id, status, transfer_date, from:locations!inventory_transfers_from_location_id_fkey(name), to:locations!inventory_transfers_to_location_id_fkey(name), inventory_transfer_items(quantity, inventory_items(name), inventory_lots(lot_number))")
    .eq("organization_id", profile.organizationId)
    .order("created_at", { ascending: false })
    .limit(20);
  const eventsQuery = supabase
    .from("inventory_events")
    .select("id, event_type, quantity, unit_cost_cents, reason, created_at, inventory_items(name), inventory_lots(lot_number), locations(name), creator:user_profiles!inventory_events_created_by_fkey(full_name)")
    .eq("organization_id", profile.organizationId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (locationIds.length > 0) {
    lotsQuery.in("location_id", locationIds);
    transfersQuery.or(`from_location_id.in.(${locationIds.join(",")}),to_location_id.in.(${locationIds.join(",")})`);
    eventsQuery.in("location_id", locationIds);
  }

  const [{ data: items }, { data: vendors }, { data: activeLots }, { data: transfers }, { data: events }] = await Promise.all([
    itemsQuery,
    vendorsQuery,
    lotsQuery,
    transfersQuery,
    eventsQuery
  ]);

  const lotOptions = (activeLots ?? []).map((lot) => {
    const item = first(lot.inventory_items);
    const location = first(lot.locations);
    return {
      id: lot.id,
      name: `${item?.name ?? "Item"} ${lot.lot_number ? `#${lot.lot_number}` : ""} - ${location?.name ?? "Location"} (${lot.quantity_available} ${item?.unit_of_measure ?? "unit"})`
    };
  });
  const itemOptions = (items ?? []).map((item) => ({ id: item.id, name: item.name }));
  const vendorOptions = (vendors ?? []).map((vendor) => ({ id: vendor.id, name: vendor.name }));
  const wasteThisMonth = (events ?? [])
    .filter((event) => event.event_type === "waste" && new Date(String(event.created_at)).getMonth() === new Date().getMonth())
    .reduce((sum, event) => sum + Math.round(Math.abs(Number(event.quantity ?? 0)) * Number(event.unit_cost_cents ?? 0)), 0);
  const receivedThisMonth = (events ?? []).filter((event) => event.event_type === "receive" && new Date(String(event.created_at)).getMonth() === new Date().getMonth()).length;

  return (
    <div className="page-stack">
      <PageHeader
        action={<div className="header-actions"><Link className="secondary-button" href="/api/exports/inventory?type=lots">Export Lots</Link><Link className="secondary-button" href="/settings/inventory">Inventory Settings</Link><Link className="primary-button" href="/inventory/purchase-orders">Purchase Orders</Link></div>}
        description="Lot-tracked, multi-location inventory with direct product cost and reorder visibility."
        title="Inventory"
      />
      <section className="metric-grid">
        <StatCard detail="On-hand lot cost" label="Inventory Value" value={formatMoney(report.summary.inventoryValueCents)} />
        <StatCard detail="At or below reorder point" label="Low Stock" value={String(report.summary.lowStockCount)} />
        <StatCard detail="No available quantity" label="Out of Stock" value={String(report.summary.outOfStockCount)} />
        <StatCard detail="Lots expiring within 90 days" label="Expiring Soon" value={String(report.summary.expiringSoonCount)} />
        <StatCard detail="Not closed, cancelled, or received" label="Open POs" value={String(report.summary.openPurchaseOrders)} />
        <StatCard detail="Receive events this month" label="Received This Month" value={String(receivedThisMonth)} />
        <StatCard detail="Waste cost this month" label="Waste This Month" value={formatMoney(wasteThisMonth)} />
        <StatCard detail="Direct usage cost this month" label="COGS This Month" value={formatMoney(report.summary.cogsThisMonth)} />
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Location Inventory</h2><span>Actual lot-cost valuation</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Item</th><th>SKU</th><th>Category</th><th>Location</th><th>Available</th><th>Reorder</th><th>Value</th><th>Expiration</th><th>Status</th></tr></thead>
            <tbody>
              {report.rows.map((row) => (
                <tr key={row.id}>
                  <td><Link className="strong-link" href={`/inventory/items/${row.inventory_item_id}`}>{row.itemName}</Link></td>
                  <td>{row.sku ?? "-"}</td>
                  <td>{row.category}</td>
                  <td>{row.locationName}</td>
                  <td>{row.quantity_available} {row.unit}</td>
                  <td>{row.reorderQuantity ? `${row.reorderQuantity} ${row.unit}` : "-"}</td>
                  <td>{formatMoney(row.valueCents)}</td>
                  <td>{formatDate(row.expiration_date)}</td>
                  <td><StatusBadge status={fromDbStatus(row.stockStatus)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="dashboard-grid">
        {hasInventoryPermission(profile, "inventory.receive") ? <section className="panel"><div className="panel-header"><h2>Direct Receiving</h2><span>Development-safe stock receipt</span></div><DirectReceiveInventoryForm items={itemOptions} locations={profile.locations} vendors={vendorOptions} /></section> : null}
        {hasInventoryPermission(profile, "inventory.adjust") ? <section className="panel"><div className="panel-header"><h2>Adjustments & Waste</h2><span>Ledger event, never silent edits</span></div><InventoryAdjustmentForm lots={lotOptions} /></section> : null}
        {hasInventoryPermission(profile, "inventory.transfer") ? <section className="panel"><div className="panel-header"><h2>Transfer Inventory</h2><span>Ship origin, receive destination</span></div><InventoryTransferForm lots={lotOptions} locations={profile.locations} /></section> : null}
        <section className="panel">
          <div className="panel-header"><h2>Transfers</h2><span>Recent movement</span></div>
          <div className="record-list">
            {(transfers ?? []).map((transfer) => {
              const from = first(transfer.from);
              const to = first(transfer.to);
              return <article key={transfer.id}><strong>{from?.name ?? "Origin"} to {to?.name ?? "Destination"}</strong><p>{formatDate(transfer.transfer_date)} - {fromDbStatus(transfer.status)}</p>{hasInventoryPermission(profile, "inventory.transfer") ? <TransferStatusForm status={transfer.status} transferId={transfer.id} /> : null}</article>;
            })}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Recent Ledger</h2><span>Immutable inventory events</span></div>
          <div className="record-list">
            {(events ?? []).map((event) => {
              const item = first(event.inventory_items);
              const lot = first(event.inventory_lots);
              const location = first(event.locations);
              const creator = first(event.creator);
              return <article key={event.id}><strong>{fromDbStatus(event.event_type)} - {item?.name ?? "Item"}</strong><p>{location?.name ?? "Location"} - {event.quantity} - {lot?.lot_number ?? "No lot"}</p><span>{formatMoney(Math.round(Math.abs(Number(event.quantity ?? 0)) * Number(event.unit_cost_cents ?? 0)))} - {creator?.full_name ?? "System"} - {event.reason ?? "No reason"}</span></article>;
            })}
          </div>
        </section>
      </section>
    </div>
  );
}
