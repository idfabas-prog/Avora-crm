import { formatDate, fromDbStatus } from "@/lib/crm/constants";
import { requireCurrentPatient } from "@/lib/portal/patient";
import { getPortalDashboardData } from "@/lib/portal/queries";

function relationName(value: { name?: string } | { name?: string }[] | null) {
  const item = Array.isArray(value) ? value[0] : value;
  return item?.name ?? "Package";
}

export default async function PortalPackagesPage() {
  const patient = await requireCurrentPatient();
  const data = await getPortalDashboardData(patient);

  return (
    <div className="portal-stack">
      <section className="portal-page-title"><p className="eyebrow">Packages</p><h1>Sessions and treatment history</h1></section>
      <section className="portal-grid">
        <article className="portal-panel"><h2>Package Balances</h2><div className="record-list">{data.entitlements.map((entitlement) => <article key={entitlement.id}><strong>{relationName(entitlement.packages) || relationName(entitlement.services)}</strong><p>{entitlement.remaining_quantity} remaining of {entitlement.total_quantity}</p><span>{fromDbStatus(entitlement.status)} · Purchased {entitlement.purchased_at ? formatDate(entitlement.purchased_at) : "not recorded"}</span></article>)}</div></article>
        <article className="portal-panel"><h2>Treatment Summary</h2><div className="record-list">{data.treatmentSessions.map((session) => <article key={session.id}><strong>{relationName(session.services)}</strong><p>{session.clinical_summary ?? "Treatment summary not yet available."}</p><span>{fromDbStatus(session.status)} · {session.completed_at ? formatDate(session.completed_at) : session.scheduled_at ? formatDate(session.scheduled_at) : "Date pending"}</span></article>)}</div></article>
      </section>
    </div>
  );
}
