import { PortalPaymentForm } from "@/components/portal/PortalForms";
import { formatDate, fromDbStatus } from "@/lib/crm/constants";
import { formatMoney } from "@/lib/financial/money";
import { requireCurrentPatient } from "@/lib/portal/patient";
import { getPortalDashboardData } from "@/lib/portal/queries";

export default async function PortalPaymentsPage() {
  const patient = await requireCurrentPatient();
  const data = await getPortalDashboardData(patient);
  const totalBalance = data.sales.reduce((sum, sale) => sum + sale.balance_due_cents, 0);

  return (
    <div className="portal-stack">
      <section className="portal-page-title"><p className="eyebrow">Payments</p><h1>Balances and history</h1></section>
      <section className="portal-metrics"><article><span>Total Balance Due</span><strong>{formatMoney(totalBalance)}</strong><p>Outstanding open balances</p></article><article><span>Payments</span><strong>{data.payments.length}</strong><p>Recorded payment history</p></article><article><span>Refunds</span><strong>{data.refunds.length}</strong><p>Refund history</p></article></section>
      <section className="portal-grid">
        <article className="portal-panel"><h2>Outstanding Balances</h2><div className="record-list">{data.sales.filter((sale) => sale.balance_due_cents > 0).map((sale) => <article key={sale.id}><strong>{formatMoney(sale.balance_due_cents)}</strong><p>Original {formatMoney(sale.total_amount_cents)} · Paid {formatMoney(sale.paid_amount_cents)}</p><span>{fromDbStatus(sale.status)} · {formatDate(sale.sale_date)}</span>{patient.settings.allowBalancePayments ? <PortalPaymentForm balanceCents={sale.balance_due_cents} saleId={sale.id} /> : null}</article>)}</div></article>
        <article className="portal-panel"><h2>Payment History</h2><div className="record-list">{data.payments.map((payment) => <article key={payment.id}><strong>{formatMoney(payment.amount_cents)}</strong><p>{fromDbStatus(payment.payment_method)} · {fromDbStatus(payment.status)}</p><span>{formatDate(payment.received_at)}{payment.simulated ? " · simulated" : ""}</span></article>)}</div></article>
      </section>
    </div>
  );
}
