import { AddPaymentForm, RefundForm } from "@/components/crm/FinancialForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { formatDateTime, fromDbStatus } from "@/lib/crm/constants";
import { formatMoney } from "@/lib/financial/money";
import { getFinancialSummary } from "@/lib/financial/queries";

export default async function PaymentsPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const selectedLocationId = await getSelectedLocationId(profile);
  const locationIds = allowedLocationIds(profile, selectedLocationId);
  const summary = await getFinancialSummary(supabase, { organizationId: profile.organizationId, locationIds });

  function withLocation<T extends { in: (column: string, values: string[]) => T }>(query: T) {
    return locationIds.length > 0 ? query.in("location_id", locationIds) : query;
  }

  const [{ data: payments }, { data: refunds }, { data: sales }] = await Promise.all([
    withLocation(supabase.from("payments").select("id, amount_cents, currency, payment_method, payment_provider, payment_purpose, status, received_at, simulated, external_reference, contacts(first_name, last_name), locations(name), sales(id)").eq("organization_id", profile.organizationId).order("received_at", { ascending: false }).limit(50)),
    withLocation(supabase.from("refunds").select("id, amount_cents, status, reason, refunded_at, contacts(first_name, last_name), locations(name), payments(id)").eq("organization_id", profile.organizationId).order("refunded_at", { ascending: false }).limit(20)),
    withLocation(supabase.from("sales").select("id, balance_due_cents, currency, contacts(first_name, last_name)").eq("organization_id", profile.organizationId).order("sale_date", { ascending: false }).limit(50))
  ]);

  const saleOptions = (sales ?? []).map((sale) => {
    const contact = Array.isArray(sale.contacts) ? sale.contacts[0] : sale.contacts;
    return { id: sale.id, name: `${contact?.first_name ?? "Contact"} ${contact?.last_name ?? ""} - balance ${formatMoney(sale.balance_due_cents, sale.currency)}` };
  });
  const paymentOptions = (payments ?? []).map((payment) => {
    const contact = Array.isArray(payment.contacts) ? payment.contacts[0] : payment.contacts;
    return { id: payment.id, name: `${contact?.first_name ?? "Contact"} ${contact?.last_name ?? ""} - ${formatMoney(payment.amount_cents, payment.currency)}` };
  });

  return (
    <div className="page-stack">
      <PageHeader description="Operational payment records, refunds, and simulated/live provider distinction." title="Payments" />
      <section className="metric-grid">
        <StatCard detail="Succeeded payments" label="Gross Collected" value={formatMoney(summary.collectedCents)} />
        <StatCard detail="Succeeded refunds" label="Refunds" value={formatMoney(summary.refundedCents)} />
        <StatCard detail="Collected minus refunds" label="Net Collected" value={formatMoney(summary.netCollectedCents)} />
        <StatCard detail="Open balances" label="Outstanding" value={formatMoney(summary.outstandingCents)} />
      </section>
      <section className="dashboard-grid">
        <details className="panel"><summary className="summary-action">Record Manual/Simulated Payment</summary><AddPaymentForm sales={saleOptions} /></details>
        <details className="panel"><summary className="summary-action">Create Refund</summary><RefundForm payments={paymentOptions} /></details>
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Payments</h2><span>Manual records and provider events</span></div>
        <table className="data-table">
          <thead><tr><th>Date</th><th>Contact</th><th>Location</th><th>Amount</th><th>Method</th><th>Provider</th><th>Status</th><th>Source</th></tr></thead>
          <tbody>
            {(payments ?? []).map((payment) => {
              const contact = Array.isArray(payment.contacts) ? payment.contacts[0] : payment.contacts;
              const location = Array.isArray(payment.locations) ? payment.locations[0] : payment.locations;
              return (
                <tr key={payment.id}>
                  <td>{formatDateTime(payment.received_at)}</td>
                  <td>{contact?.first_name} {contact?.last_name}</td>
                  <td>{location?.name ?? "Unassigned"}</td>
                  <td>{formatMoney(payment.amount_cents, payment.currency)}</td>
                  <td>{fromDbStatus(payment.payment_method)}</td>
                  <td>{payment.payment_provider}</td>
                  <td><StatusBadge status={fromDbStatus(payment.status)} /></td>
                  <td>{payment.simulated ? "Simulated" : "Live"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Refunds</h2><span>Original payments are preserved</span></div>
        <div className="record-list">
          {(refunds ?? []).map((refund) => {
            const contact = Array.isArray(refund.contacts) ? refund.contacts[0] : refund.contacts;
            const location = Array.isArray(refund.locations) ? refund.locations[0] : refund.locations;
            return <article key={refund.id}><strong>{formatMoney(refund.amount_cents)} refunded</strong><p>{contact?.first_name} {contact?.last_name} · {location?.name ?? "Unassigned"} · {formatDateTime(refund.refunded_at)}</p><StatusBadge status={fromDbStatus(refund.status)} /><span>{refund.reason}</span></article>;
          })}
        </div>
      </section>
    </div>
  );
}
