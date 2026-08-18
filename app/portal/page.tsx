import Link from "next/link";
import { NotificationStatusForm, PortalPaymentForm } from "@/components/portal/PortalForms";
import { APP_DISPLAY_NAME } from "@/lib/config/branding";
import { formatDate, formatDateTime, fromDbStatus } from "@/lib/crm/constants";
import { formatMoney } from "@/lib/financial/money";
import { requireCurrentPatient } from "@/lib/portal/patient";
import { getPortalDashboardData } from "@/lib/portal/queries";

export default async function PortalHomePage() {
  const patient = await requireCurrentPatient();
  const data = await getPortalDashboardData(patient);
  const nextAppointment = data.upcomingAppointments[0];
  const recentPayment = data.payments[0];
  const pendingConsent = data.consentRecords.find((consent) => consent.status === "pending" || consent.status === "required");
  const totalBalance = data.sales.reduce((sum, sale) => sum + sale.balance_due_cents, 0);
  const remainingPackages = data.entitlements.reduce((sum, entitlement) => sum + entitlement.remaining_quantity, 0);
  const activeMembership = data.memberships.find((membership) => ["trial", "active", "past_due"].includes(membership.status));

  return (
    <div className="portal-stack">
      <section className="portal-hero">
        <div>
          <p className="eyebrow">{patient.locationName ?? patient.organizationName}</p>
          <h1>Hello, {patient.firstName}</h1>
          <p>Your appointments, balances, packages, consents, and membership details are gathered here.</p>
        </div>
        {patient.settings.developmentMode ? <span className="portal-pill">Simulated billing mode</span> : null}
      </section>
      <section className="portal-metrics">
        <article><span>Next Appointment</span><strong>{nextAppointment ? formatDateTime(nextAppointment.start_at) : "None scheduled"}</strong><p>{nextAppointment ? fromDbStatus(nextAppointment.status) : `Book through ${APP_DISPLAY_NAME} staff`}</p></article>
        <article><span>Balance Due</span><strong>{formatMoney(totalBalance)}</strong><p>{patient.settings.allowBalancePayments ? "Payment simulation available" : "Payments unavailable"}</p></article>
        <article><span>Packages Remaining</span><strong>{remainingPackages}</strong><p>Sessions or credits remaining</p></article>
        <article><span>Membership</span><strong>{activeMembership ? fromDbStatus(activeMembership.status) : "None"}</strong><p>{activeMembership ? "Active portal membership" : "No active membership"}</p></article>
      </section>
      <section className="portal-grid">
        <article className="portal-panel">
          <h2>Quick Actions</h2>
          <div className="portal-actions">
            <Link href="/portal/appointments">View Appointments</Link>
            <Link href="/portal/payments">View Payments</Link>
            <Link href="/portal/packages">View Packages</Link>
            <Link href="/portal/referrals">View Referrals</Link>
            <Link href="/portal/documents">View Documents</Link>
          </div>
        </article>
        <article className="portal-panel">
          <h2>Recent Activity</h2>
          <div className="record-list">
            <article><strong>Recent Payment</strong><p>{recentPayment ? `${formatMoney(recentPayment.amount_cents)} · ${formatDate(recentPayment.received_at)}` : "No payment history yet"}</p></article>
            <article><strong>Pending Consent</strong><p>{pendingConsent ? "A consent is ready for signature" : "No pending consents"}</p></article>
          </div>
        </article>
      </section>
      <section className="portal-panel">
        <div className="panel-header"><h2>Notifications</h2><span>{data.notifications.filter((item) => item.status === "unread").length} unread</span></div>
        <div className="record-list">
          {data.notifications.map((notification) => (
            <article key={notification.id}>
              <strong>{notification.title}</strong>
              <p>{notification.body}</p>
              <span>{fromDbStatus(notification.status)} · {formatDateTime(notification.created_at)}</span>
              {notification.status === "unread" ? <NotificationStatusForm notificationId={notification.id} status="read" /> : null}
            </article>
          ))}
        </div>
      </section>
      {patient.settings.allowBalancePayments && totalBalance > 0 ? (
        <section className="portal-panel">
          <h2>Simulated Payment</h2>
          <p className="quiet-text">Development mode uses simulated payments only. No live card is charged.</p>
          {data.sales.filter((sale) => sale.balance_due_cents > 0).slice(0, 1).map((sale) => <PortalPaymentForm key={sale.id} balanceCents={sale.balance_due_cents} saleId={sale.id} />)}
        </section>
      ) : null}
    </div>
  );
}
