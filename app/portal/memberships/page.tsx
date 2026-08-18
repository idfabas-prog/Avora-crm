import { formatDate, fromDbStatus } from "@/lib/crm/constants";
import { formatMoney } from "@/lib/financial/money";
import { summarizeMembershipBenefits } from "@/lib/portal/memberships";
import { requireCurrentPatient } from "@/lib/portal/patient";
import { getPortalDashboardData } from "@/lib/portal/queries";

function planName(value: { name?: string; price_cents?: number; billing_interval?: string } | { name?: string; price_cents?: number; billing_interval?: string }[] | null) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PortalMembershipsPage() {
  const patient = await requireCurrentPatient();
  const data = await getPortalDashboardData(patient);

  return (
    <div className="portal-stack">
      <section className="portal-page-title"><p className="eyebrow">Memberships</p><h1>Your recurring benefits</h1></section>
      <section className="portal-grid">
        {data.memberships.map((membership) => {
          const plan = planName(membership.membership_plans);
          const benefits = summarizeMembershipBenefits(data.benefitEvents.filter((event) => event.patient_membership_id === membership.id));
          return (
            <article className="portal-panel" key={membership.id}>
              <h2>{plan?.name ?? "Membership"}</h2>
              <p>{formatMoney(plan?.price_cents)} · {fromDbStatus(plan?.billing_interval ?? "monthly")}</p>
              <div className="portal-metrics mini"><article><span>Status</span><strong>{fromDbStatus(membership.status)}</strong></article><article><span>Next Billing</span><strong>{membership.next_billing_date ? formatDate(membership.next_billing_date) : "Not scheduled"}</strong></article></div>
              <div className="record-list">{benefits.map((benefit) => <article key={benefit.benefitKey}><strong>{fromDbStatus(benefit.benefitKey)}</strong><p>{benefit.remaining} remaining</p></article>)}</div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
