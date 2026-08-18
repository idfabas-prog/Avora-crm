import { notFound } from "next/navigation";
import Link from "next/link";
import { InventoryItemForm } from "@/components/crm/InventoryForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { formatDate, formatDateTime, fromDbStatus } from "@/lib/crm/constants";
import { formatMoney } from "@/lib/financial/money";
import { hasInventoryPermission } from "@/lib/inventory/permissions";
import { inventoryValueCents } from "@/lib/inventory/metrics";
import { createClient } from "@/lib/supabase/server";

type Relation<T> = T | T[] | null;

function first<T>(value: Relation<T> | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function InventoryItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireCurrentProfile();
  if (!hasInventoryPermission(profile, "inventory.read")) notFound();

  const supabase = await createClient();
  const selectedLocationId = await getSelectedLocationId(profile);
  const locationIds = allowedLocationIds(profile, selectedLocationId);
  const { data: item, error } = await supabase
    .from("inventory_items")
    .select("id, name, sku, category, description, unit_of_measure, default_cost_cents, track_lot, track_expiration, active")
    .eq("id", id)
    .eq("organization_id", profile.organizationId)
    .single();
  if (error || !item) notFound();

  const lotsQuery = supabase.from("inventory_lots").select("id, lot_number, expiration_date, received_date, cost_per_unit_cents, quantity_received, quantity_available, status, locations(name), vendors(name)").eq("organization_id", profile.organizationId).eq("inventory_item_id", id).order("expiration_date", { ascending: true });
  const usageQuery = supabase.from("treatment_inventory_usage").select("id, quantity_used, unit_cost_cents, total_cost_cents, created_at, locations(name), treatment_sessions(id, services(name), provider:user_profiles!treatment_sessions_provider_id_fkey(full_name))").eq("organization_id", profile.organizationId).eq("inventory_item_id", id).order("created_at", { ascending: false }).limit(50);
  const eventsQuery = supabase.from("inventory_events").select("id, event_type, quantity, unit_cost_cents, reason, created_at, locations(name), inventory_lots(lot_number), creator:user_profiles!inventory_events_created_by_fkey(full_name)").eq("organization_id", profile.organizationId).eq("inventory_item_id", id).order("created_at", { ascending: false }).limit(50);
  const poItemsQuery = supabase.from("purchase_order_items").select("id, quantity_ordered, quantity_received, unit_cost_cents, line_total_cents, purchase_orders(po_number, status, order_date, locations(name), vendors(name))").eq("inventory_item_id", id).order("created_at", { ascending: false }).limit(50);
  const transferItemsQuery = supabase.from("inventory_transfer_items").select("id, quantity, inventory_lots(lot_number), inventory_transfers(status, transfer_date, from:locations!inventory_transfers_from_location_id_fkey(name), to:locations!inventory_transfers_to_location_id_fkey(name))").eq("inventory_item_id", id).order("created_at", { ascending: false }).limit(50);

  if (locationIds.length > 0) {
    lotsQuery.in("location_id", locationIds);
    usageQuery.in("location_id", locationIds);
    eventsQuery.in("location_id", locationIds);
  }

  const [{ data: lots }, { data: usage }, { data: events }, { data: poItems }, { data: transferItems }, { data: audits }] = await Promise.all([
    lotsQuery,
    usageQuery,
    eventsQuery,
    poItemsQuery,
    transferItemsQuery,
    supabase.from("audit_logs").select("id, action, created_at, actor:user_profiles!audit_logs_actor_id_fkey(full_name)").eq("organization_id", profile.organizationId).eq("entity_table", "inventory_items").eq("entity_id", id).order("created_at", { ascending: false }).limit(20)
  ]);

  const totalAvailable = (lots ?? []).reduce((sum, lot) => sum + Number(lot.quantity_available ?? 0), 0);
  const valueCents = inventoryValueCents((lots ?? []).map((lot) => ({ quantity_available: Number(lot.quantity_available ?? 0), cost_per_unit_cents: Number(lot.cost_per_unit_cents ?? 0), status: lot.status ?? "active" })));
  const usageCostCents = (usage ?? []).reduce((sum, row) => sum + Number(row.total_cost_cents ?? 0), 0);
  const wasteCostCents = (events ?? []).filter((event) => event.event_type === "waste").reduce((sum, event) => sum + Math.round(Math.abs(Number(event.quantity ?? 0)) * Number(event.unit_cost_cents ?? 0)), 0);

  return (
    <div className="page-stack">
      <PageHeader
        action={<div className="header-actions"><Link className="secondary-button" href="/settings/inventory/items">Manage Items</Link><Link className="primary-button" href="/inventory">Inventory</Link></div>}
        description={`${item.category} - ${item.unit_of_measure}`}
        title={item.name}
      />
      <section className="metric-grid">
        <StatCard detail="Allowed locations" label="Available" value={`${totalAvailable} ${item.unit_of_measure}`} />
        <StatCard detail="Actual lot cost" label="On-Hand Value" value={formatMoney(valueCents)} />
        <StatCard detail="Recorded treatment usage" label="COGS" value={formatMoney(usageCostCents)} />
        <StatCard detail="Waste ledger events" label="Waste Cost" value={formatMoney(wasteCostCents)} />
      </section>
      <section className="dashboard-grid">
        {hasInventoryPermission(profile, "inventory.write") ? <section className="panel"><div className="panel-header"><h2>Item Setup</h2><span>Catalog details</span></div><InventoryItemForm item={item} /></section> : null}
        <section className="panel">
          <div className="panel-header"><h2>Lots</h2><span>FEFO selection source</span></div>
          <div className="record-list">
            {(lots ?? []).map((lot) => {
              const location = first(lot.locations);
              const vendor = first(lot.vendors);
              return <article key={lot.id}><strong>{lot.lot_number ?? "No lot"} - {location?.name ?? "Location"}</strong><p>{lot.quantity_available}/{lot.quantity_received} {item.unit_of_measure} - {formatMoney(lot.cost_per_unit_cents)} each</p><span>Received {formatDate(lot.received_date)} - expires {formatDate(lot.expiration_date)} - {vendor?.name ?? "No vendor"}</span><StatusBadge status={fromDbStatus(lot.status)} /></article>;
            })}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Treatment Usage</h2><span>Provider/product cost history</span></div>
          <div className="record-list">
            {(usage ?? []).map((row) => {
              const location = first(row.locations);
              const session = first(row.treatment_sessions);
              const service = first(session?.services);
              const provider = first(session?.provider);
              return <article key={row.id}><strong>{service?.name ?? "Treatment"} - {formatMoney(row.total_cost_cents)}</strong><p>{row.quantity_used} {item.unit_of_measure} at {formatMoney(row.unit_cost_cents)} - {location?.name ?? "Location"}</p><span>{provider?.full_name ?? "Provider"} - {formatDateTime(row.created_at)}</span></article>;
            })}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Purchases</h2><span>PO lines for this item</span></div>
          <div className="record-list">
            {(poItems ?? []).map((row) => {
              const po = first(row.purchase_orders);
              const vendor = first(po?.vendors);
              const location = first(po?.locations);
              return <article key={row.id}><strong>{po?.po_number ?? "PO"} - {vendor?.name ?? "Vendor"}</strong><p>{location?.name ?? "Location"} - {row.quantity_received}/{row.quantity_ordered} received - {formatMoney(row.line_total_cents)}</p><span>{formatDate(po?.order_date)} - {fromDbStatus(po?.status)}</span></article>;
            })}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Transfers</h2><span>Movement history</span></div>
          <div className="record-list">
            {(transferItems ?? []).map((row) => {
              const transfer = first(row.inventory_transfers);
              const from = first(transfer?.from);
              const to = first(transfer?.to);
              const lot = first(row.inventory_lots);
              return <article key={row.id}><strong>{from?.name ?? "Origin"} to {to?.name ?? "Destination"}</strong><p>{row.quantity} {item.unit_of_measure} - lot {lot?.lot_number ?? "No lot"}</p><span>{formatDate(transfer?.transfer_date)} - {fromDbStatus(transfer?.status)}</span></article>;
            })}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Adjustments & Audit</h2><span>Inventory events and user audit</span></div>
          <div className="record-list">
            {(events ?? []).map((event) => {
              const location = first(event.locations);
              const lot = first(event.inventory_lots);
              const creator = first(event.creator);
              return <article key={event.id}><strong>{fromDbStatus(event.event_type)} - {event.quantity}</strong><p>{location?.name ?? "Location"} - lot {lot?.lot_number ?? "No lot"}</p><span>{creator?.full_name ?? "System"} - {event.reason ?? "No reason"} - {formatDateTime(event.created_at)}</span></article>;
            })}
            {(audits ?? []).map((audit) => {
              const actor = first(audit.actor);
              return <article key={audit.id}><strong>{audit.action}</strong><p>{actor?.full_name ?? "System"}</p><span>{formatDateTime(audit.created_at)}</span></article>;
            })}
          </div>
        </section>
      </section>
    </div>
  );
}
