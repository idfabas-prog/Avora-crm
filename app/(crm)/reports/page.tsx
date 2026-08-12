import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { formatMoney } from "@/lib/financial/money";
import { getFinancialSummary } from "@/lib/financial/queries";

type Relation<T> = T | T[] | null;
type LocationRelation = Relation<{ name: string | null }>;
type ServiceRelation = Relation<{ category: string | null; name: string | null }>;
type PackageRelation = Relation<{ name: string | null }>;
type UserRelation = Relation<{ full_name: string | null }>;
type LocationSalesRow = { location_id: string | null; total_amount_cents: number | null; paid_amount_cents: number | null; refunded_amount_cents: number | null; balance_due_cents: number | null; locations: LocationRelation };
type ServiceSalesRow = { line_total_cents: number | null; quantity: number | null; services: ServiceRelation; packages: PackageRelation };
type SalespersonRow = { salesperson_id: string | null; total_amount_cents: number | null; paid_amount_cents: number | null; user_profiles: UserRelation };
type RoyaltyRow = { basis_amount_cents: number | null; royalty_amount_cents: number | null; status: string | null; locations: LocationRelation };
type QueryResult = { data: unknown[] | null; error: { message: string } | null };
type LooseQuery = PromiseLike<QueryResult> & {
  eq: (column: string, value: string) => LooseQuery;
  in: (column: string, values: string[]) => LooseQuery;
};
type LooseSupabase = {
  from: (table: string) => {
    select: (columns: string) => LooseQuery;
  };
};

function firstRelation<T>(value: Relation<T>) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ReportsPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const db = supabase as unknown as LooseSupabase;
  const selectedLocationId = await getSelectedLocationId(profile);
  const locationIds = allowedLocationIds(profile, selectedLocationId);
  const summary = await getFinancialSummary(supabase, { organizationId: profile.organizationId, locationIds });

  function withLocation<T extends { in: (column: string, values: string[]) => T }>(query: T) {
    return locationIds.length > 0 ? query.in("location_id", locationIds) : query;
  }

  const [{ data: byLocation }, { data: byService }, { data: salespersonRows }, { data: royalties }] = await Promise.all([
    withLocation(db.from("sales").select("location_id, total_amount_cents, paid_amount_cents, refunded_amount_cents, balance_due_cents, locations(name)").eq("organization_id", profile.organizationId)),
    db.from("sale_items").select("line_total_cents, quantity, services(category, name), packages(name), sales!inner(organization_id, location_id, status)").eq("sales.organization_id", profile.organizationId),
    withLocation(db.from("sales").select("salesperson_id, total_amount_cents, paid_amount_cents, user_profiles!sales_salesperson_id_fkey(full_name)").eq("organization_id", profile.organizationId)),
    withLocation(db.from("royalties").select("basis_amount_cents, royalty_amount_cents, status, locations(name), sales(sale_date)").eq("organization_id", profile.organizationId))
  ]);

  const locationMap = new Map<string, { name: string; gross: number; collected: number; refunded: number; outstanding: number }>();
  for (const row of (byLocation ?? []) as LocationSalesRow[]) {
    const location = firstRelation(row.locations);
    const key = row.location_id ?? "unassigned";
    const current = locationMap.get(key) ?? { name: location?.name ?? "Unassigned", gross: 0, collected: 0, refunded: 0, outstanding: 0 };
    current.gross += row.total_amount_cents ?? 0;
    current.collected += row.paid_amount_cents ?? 0;
    current.refunded += row.refunded_amount_cents ?? 0;
    current.outstanding += row.balance_due_cents ?? 0;
    locationMap.set(key, current);
  }

  const serviceMap = new Map<string, { gross: number; units: number }>();
  for (const item of (byService ?? []) as ServiceSalesRow[]) {
    const service = firstRelation(item.services);
    const pack = firstRelation(item.packages);
    const label = service?.category ?? pack?.name ?? "Other";
    const current = serviceMap.get(label) ?? { gross: 0, units: 0 };
    current.gross += item.line_total_cents ?? 0;
    current.units += item.quantity ?? 0;
    serviceMap.set(label, current);
  }

  const salespersonMap = new Map<string, { name: string; gross: number; collected: number; count: number }>();
  for (const row of (salespersonRows ?? []) as SalespersonRow[]) {
    const user = firstRelation(row.user_profiles);
    const key = row.salesperson_id ?? "unassigned";
    const current = salespersonMap.get(key) ?? { name: user?.full_name ?? "Unassigned", gross: 0, collected: 0, count: 0 };
    current.gross += row.total_amount_cents ?? 0;
    current.collected += row.paid_amount_cents ?? 0;
    current.count += 1;
    salespersonMap.set(key, current);
  }

  return (
    <div className="page-stack">
      <PageHeader
        action={
          <div className="header-actions">
            <Link className="secondary-button" href="/api/exports/financial?type=sales">Export Sales</Link>
            <Link className="secondary-button" href="/api/exports/financial?type=payments">Export Payments</Link>
            <Link className="primary-button" href="/sales/commissions">Commission Report</Link>
          </div>
        }
        description="Operational financial reporting. This is not a formal accounting ledger."
        title="Reports"
      />
      <section className="metric-grid">
        <StatCard detail="Booked non-cancelled sales" label="Gross Sales" value={formatMoney(summary.grossSalesCents)} />
        <StatCard detail="Payments received" label="Collected" value={formatMoney(summary.collectedCents)} />
        <StatCard detail="After refunds" label="Net Collected" value={formatMoney(summary.netCollectedCents)} />
        <StatCard detail="Balances still due" label="Outstanding" value={formatMoney(summary.outstandingCents)} />
      </section>
      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Revenue by Location</h2><span>Gross / collected / refunds / outstanding</span></div>
          <div className="record-list">{Array.from(locationMap.values()).map((row) => <article key={row.name}><strong>{row.name}</strong><p>Gross {formatMoney(row.gross)} · Collected {formatMoney(row.collected)} · Refunds {formatMoney(row.refunded)} · Outstanding {formatMoney(row.outstanding)}</p></article>)}</div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Revenue by Service</h2><span>Service/category performance</span></div>
          <div className="record-list">{Array.from(serviceMap.entries()).map(([name, row]) => <article key={name}><strong>{name}</strong><p>Gross {formatMoney(row.gross)} · Units {row.units} · Average {formatMoney(row.units ? Math.round(row.gross / row.units) : 0)}</p></article>)}</div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Salesperson Performance</h2><span>Operational CRM attribution</span></div>
          <div className="record-list">{Array.from(salespersonMap.values()).map((row) => <article key={row.name}><strong>{row.name}</strong><p>Sales {row.count} · Gross {formatMoney(row.gross)} · Collected {formatMoney(row.collected)} · Average {formatMoney(row.count ? Math.round(row.gross / row.count) : 0)}</p></article>)}</div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Royalty Snapshot</h2><span>Pending and reversed ledger rows</span></div>
          <div className="record-list">{((royalties ?? []) as RoyaltyRow[]).map((row, index) => {
            const location = firstRelation(row.locations);
            return <article key={index}><strong>{location?.name ?? "Unassigned"} · {formatMoney(row.royalty_amount_cents)}</strong><p>Basis {formatMoney(row.basis_amount_cents)} · {row.status}</p></article>;
          })}</div>
        </section>
      </section>
    </div>
  );
}
