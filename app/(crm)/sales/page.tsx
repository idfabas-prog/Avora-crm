import Link from "next/link";
import { NewSaleForm, AddPaymentForm } from "@/components/crm/FinancialForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { formatDate, formatDateTime, fromDbStatus } from "@/lib/crm/constants";
import { formatMoney } from "@/lib/financial/money";
import { getFinancialSummary } from "@/lib/financial/queries";

export default async function SalesPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const selectedLocationId = await getSelectedLocationId(profile);
  const locationIds = allowedLocationIds(profile, selectedLocationId);
  const summary = await getFinancialSummary(supabase, { organizationId: profile.organizationId, locationIds });

  function withLocation<T extends { in: (column: string, values: string[]) => T }>(query: T) {
    return locationIds.length > 0 ? query.in("location_id", locationIds) : query;
  }

  const [
    { data: sales },
    { data: contacts },
    { data: opportunities },
    { data: users },
    { data: services },
    { data: packages }
  ] = await Promise.all([
    withLocation(supabase.from("sales").select("id, sale_date, status, total_amount_cents, paid_amount_cents, balance_due_cents, currency, contacts(first_name, last_name, phone, email), locations(name), salesperson:user_profiles!sales_salesperson_id_fkey(full_name), sale_items(description)").eq("organization_id", profile.organizationId).order("sale_date", { ascending: false }).limit(50)),
    supabase.from("contacts").select("id, first_name, last_name").eq("organization_id", profile.organizationId).order("last_name"),
    supabase.from("opportunities").select("id, name").eq("organization_id", profile.organizationId).order("name"),
    supabase.from("user_profiles").select("id, full_name").eq("organization_id", profile.organizationId).order("full_name"),
    supabase.from("services").select("id, name, default_price_cents").eq("organization_id", profile.organizationId).eq("active", true).order("name"),
    supabase.from("packages").select("id, name, package_price_cents").eq("organization_id", profile.organizationId).eq("active", true).order("name")
  ]);

  const saleOptions = (sales ?? []).map((sale) => {
    const contact = Array.isArray(sale.contacts) ? sale.contacts[0] : sale.contacts;
    return { id: sale.id, name: `${contact?.first_name ?? "Contact"} ${contact?.last_name ?? ""} - ${formatMoney(sale.balance_due_cents, sale.currency)}` };
  });
  const catalog = [
    ...(services ?? []).map((service) => ({ id: service.id, name: service.name, price_cents: service.default_price_cents, type: "service" as const })),
    ...(packages ?? []).map((pack) => ({ id: pack.id, name: pack.name, price_cents: pack.package_price_cents, type: "package" as const }))
  ];

  return (
    <div className="page-stack">
      <PageHeader
        action={<Link className="primary-button" href="/sales/commissions">Commissions</Link>}
        description="Live sales, collected cash, balances, and service/package attribution from Supabase."
        title="Sales"
      />
      <section className="metric-grid">
        <StatCard detail="Non-cancelled booked sales" label="Gross Sales" value={formatMoney(summary.grossSalesCents)} />
        <StatCard detail="Succeeded payments" label="Collected" value={formatMoney(summary.collectedCents)} />
        <StatCard detail="Collected minus refunds" label="Net Collected" value={formatMoney(summary.netCollectedCents)} />
        <StatCard detail="Remaining balances" label="Outstanding" value={formatMoney(summary.outstandingCents)} />
        <StatCard detail="Gross sales / sales count" label="Average Ticket" value={formatMoney(summary.averageTicketCents)} />
        <StatCard detail={`${summary.paidSaleCount} paid, ${summary.partialSaleCount} partial`} label="Sales" value={String(summary.saleCount)} />
      </section>
      <section className="dashboard-grid">
        <details className="panel">
          <summary className="summary-action">New Sale</summary>
          <NewSaleForm
            catalog={catalog}
            contacts={(contacts ?? []).map((contact) => ({ id: contact.id, name: `${contact.first_name} ${contact.last_name}` }))}
            locations={profile.locations}
            opportunities={(opportunities ?? []).map((opportunity) => ({ id: opportunity.id, name: opportunity.name }))}
            salespeople={(users ?? []).map((user) => ({ id: user.id, name: user.full_name }))}
          />
        </details>
        <details className="panel">
          <summary className="summary-action">Add Payment</summary>
          <AddPaymentForm sales={saleOptions} />
        </details>
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Sales Register</h2><span>Server-side location filtering</span></div>
        <table className="data-table">
          <thead><tr><th>Date</th><th>Contact</th><th>Location</th><th>Items</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead>
          <tbody>
            {(sales ?? []).map((sale) => {
              const contact = Array.isArray(sale.contacts) ? sale.contacts[0] : sale.contacts;
              const location = Array.isArray(sale.locations) ? sale.locations[0] : sale.locations;
              const salesperson = Array.isArray(sale.salesperson) ? sale.salesperson[0] : sale.salesperson;
              const itemNames = (sale.sale_items ?? []).map((item) => item.description).join(", ");
              return (
                <tr key={sale.id}>
                  <td>{formatDate(sale.sale_date)}</td>
                  <td><strong>{contact?.first_name} {contact?.last_name}</strong><span>{salesperson?.full_name ?? "Unassigned"}</span></td>
                  <td>{location?.name ?? "Unassigned"}</td>
                  <td>{itemNames || "No items"}</td>
                  <td>{formatMoney(sale.total_amount_cents, sale.currency)}</td>
                  <td>{formatMoney(sale.paid_amount_cents, sale.currency)}</td>
                  <td>{formatMoney(sale.balance_due_cents, sale.currency)}</td>
                  <td><StatusBadge status={fromDbStatus(sale.status)} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="quiet-text">Last updated {formatDateTime(new Date().toISOString())}</p>
      </section>
    </div>
  );
}
