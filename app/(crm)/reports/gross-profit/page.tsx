import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { formatMoney } from "@/lib/financial/money";
import { grossProfit } from "@/lib/inventory/metrics";
import { hasInventoryPermission } from "@/lib/inventory/permissions";
import { createClient } from "@/lib/supabase/server";

type Relation<T> = T | T[] | null;

function first<T>(value: Relation<T> | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function margin(revenue: number, cogs: number) {
  return `${Math.round(grossProfit(revenue, cogs).margin * 100)}%`;
}

export default async function GrossProfitReportPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const selectedLocationId = await getSelectedLocationId(profile);
  const locationIds = allowedLocationIds(profile, selectedLocationId);

  if (!hasInventoryPermission(profile, "inventory.cogs.read")) {
    return (
      <div className="page-stack">
        <PageHeader description="Your current role does not include direct COGS access." title="Gross Profit" />
      </div>
    );
  }

  const saleItemsQuery = supabase
    .from("sale_items")
    .select("id, line_total_cents, services(name, category), packages(name), sales!inner(organization_id, location_id, total_amount_cents, paid_amount_cents, locations(name), salesperson:user_profiles!sales_salesperson_id_fkey(full_name))")
    .eq("sales.organization_id", profile.organizationId);
  const usageQuery = supabase
    .from("treatment_inventory_usage")
    .select("id, quantity_used, total_cost_cents, created_at, locations(name), inventory_items(name, category, unit_of_measure), treatment_sessions(service_id, services(name, category), provider:user_profiles!treatment_sessions_provider_id_fkey(full_name))")
    .eq("organization_id", profile.organizationId);

  if (locationIds.length > 0) {
    saleItemsQuery.in("sales.location_id", locationIds);
    usageQuery.in("location_id", locationIds);
  }

  const [{ data: saleItems }, { data: usage }] = await Promise.all([saleItemsQuery, usageQuery]);
  const serviceMap = new Map<string, { revenue: number; cogs: number; sessions: number }>();
  const locationMap = new Map<string, { revenue: number; cogs: number }>();
  const providerMap = new Map<string, { treatments: Set<string>; units: number; cogs: number }>();
  let collectedRevenueCents = 0;
  let directCogsCents = 0;

  for (const row of saleItems ?? []) {
    const sale = first(row.sales);
    const service = first(row.services);
    const pack = first(row.packages);
    const location = first(sale?.locations);
    const saleTotal = Number(sale?.total_amount_cents ?? 0);
    const lineTotal = Number(row.line_total_cents ?? 0);
    const allocatedRevenue = saleTotal > 0 ? Math.round(lineTotal / saleTotal * Number(sale?.paid_amount_cents ?? 0)) : 0;
    const serviceKey = service?.name ?? pack?.name ?? "Other";
    const locationKey = location?.name ?? "Unassigned";
    const serviceRow = serviceMap.get(serviceKey) ?? { revenue: 0, cogs: 0, sessions: 0 };
    const locationRow = locationMap.get(locationKey) ?? { revenue: 0, cogs: 0 };
    serviceRow.revenue += allocatedRevenue;
    locationRow.revenue += allocatedRevenue;
    serviceMap.set(serviceKey, serviceRow);
    locationMap.set(locationKey, locationRow);
    collectedRevenueCents += allocatedRevenue;
  }

  for (const row of usage ?? []) {
    const session = first(row.treatment_sessions);
    const service = first(session?.services);
    const provider = first(session?.provider);
    const location = first(row.locations);
    const serviceKey = service?.name ?? "Other";
    const locationKey = location?.name ?? "Unassigned";
    const providerKey = provider?.full_name ?? "Unassigned";
    const cogs = Number(row.total_cost_cents ?? 0);
    const serviceRow = serviceMap.get(serviceKey) ?? { revenue: 0, cogs: 0, sessions: 0 };
    const locationRow = locationMap.get(locationKey) ?? { revenue: 0, cogs: 0 };
    const providerRow = providerMap.get(providerKey) ?? { treatments: new Set<string>(), units: 0, cogs: 0 };
    serviceRow.cogs += cogs;
    serviceRow.sessions += 1;
    locationRow.cogs += cogs;
    providerRow.treatments.add(session?.service_id ?? row.id);
    providerRow.units += Number(row.quantity_used ?? 0);
    providerRow.cogs += cogs;
    serviceMap.set(serviceKey, serviceRow);
    locationMap.set(locationKey, locationRow);
    providerMap.set(providerKey, providerRow);
    directCogsCents += cogs;
  }

  return (
    <div className="page-stack">
      <PageHeader
        action={<div className="header-actions"><Link className="secondary-button" href="/api/exports/inventory?type=cogs">Export COGS</Link><Link className="primary-button" href="/inventory">Inventory</Link></div>}
        description="Collected revenue less realized direct inventory cost. Labor, overhead, and GL accounting are not included."
        title="Gross Profit"
      />
      <section className="metric-grid">
        <StatCard detail="Allocated from collected sales" label="Collected Revenue" value={formatMoney(collectedRevenueCents)} />
        <StatCard detail="Treatment inventory usage" label="Direct Inventory COGS" value={formatMoney(directCogsCents)} />
        <StatCard detail="Before labor and overhead" label="Gross Profit" value={formatMoney(grossProfit(collectedRevenueCents, directCogsCents).profitCents)} />
        <StatCard detail="Direct product margin only" label="Gross Margin" value={margin(collectedRevenueCents, directCogsCents)} />
      </section>
      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Service Profitability</h2><span>Revenue, COGS, gross margin</span></div>
          <div className="record-list">{Array.from(serviceMap.entries()).map(([name, row]) => <article key={name}><strong>{name}</strong><p>Revenue {formatMoney(row.revenue)} - COGS {formatMoney(row.cogs)} - Gross profit {formatMoney(grossProfit(row.revenue, row.cogs).profitCents)}</p><span>{row.sessions} usage records - margin {margin(row.revenue, row.cogs)}</span></article>)}</div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Location Profitability</h2><span>Allowed locations only</span></div>
          <div className="record-list">{Array.from(locationMap.entries()).map(([name, row]) => <article key={name}><strong>{name}</strong><p>Revenue {formatMoney(row.revenue)} - COGS {formatMoney(row.cogs)} - Gross profit {formatMoney(grossProfit(row.revenue, row.cogs).profitCents)}</p><span>Margin {margin(row.revenue, row.cogs)}</span></article>)}</div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Provider Usage</h2><span>Not a clinical quality metric</span></div>
          <div className="record-list">{Array.from(providerMap.entries()).map(([name, row]) => <article key={name}><strong>{name}</strong><p>{row.treatments.size} treatments - inventory cost {formatMoney(row.cogs)}</p><span>{row.units} units used - average COGS {formatMoney(row.treatments.size ? Math.round(row.cogs / row.treatments.size) : 0)}</span></article>)}</div>
        </section>
      </section>
    </div>
  );
}
