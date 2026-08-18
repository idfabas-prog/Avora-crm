import Link from "next/link";
import { ReviewRequestForm } from "@/components/crm/ReputationForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { formatMoney } from "@/lib/financial/money";
import { hasReputationPermission } from "@/lib/reputation/permissions";
import { getReputationReport } from "@/lib/reputation/reports";
import { createClient } from "@/lib/supabase/server";

function pct(value: number) {
  return `${value.toFixed(value % 1 ? 1 : 0)}%`;
}

export default async function ReputationPage() {
  const profile = await requireCurrentProfile();
  if (!hasReputationPermission(profile, "reputation.read")) {
    return <div className="page-stack"><PageHeader description="Your current role does not include reputation access." title="Reputation" /></div>;
  }
  const supabase = await createClient();
  const selectedLocationId = await getSelectedLocationId(profile);
  const locationIds = allowedLocationIds(profile, selectedLocationId);
  const report = await getReputationReport(supabase, { organizationId: profile.organizationId, locationIds });
  const [{ data: contacts }, { data: sources }] = await Promise.all([
    supabase.from("contacts").select("id, first_name, last_name, location_id").eq("organization_id", profile.organizationId).order("last_name").limit(500),
    supabase.from("review_sources").select("id, name").eq("organization_id", profile.organizationId).eq("active", true).order("name")
  ]);
  const contactOptions = (contacts ?? [])
    .filter((contact) => !locationIds.length || locationIds.includes(contact.location_id))
    .map((contact) => ({ id: contact.id, name: `${contact.first_name} ${contact.last_name}`, location_id: contact.location_id }));

  return (
    <div className="page-stack">
      <PageHeader
        action={<div className="header-actions"><Link className="secondary-button" href="/settings/reputation">Settings</Link><Link className="primary-button" href="/reputation/referrals">Referrals</Link></div>}
        description="Ethical review requests, internal feedback, referral growth, loyalty, and reactivation reporting."
        title="Reputation"
      />
      <section className="metric-grid">
        <StatCard detail={`Response rate ${pct(report.summary.responseRate)}`} label="Review Requests Sent" value={String(report.summary.sentRequests)} />
        <StatCard detail="Externally confirmed or manually completed" label="Completed Reviews" value={String(report.summary.completedRequests)} />
        <StatCard detail={`${report.summary.nps.promoters} promoters, ${report.summary.nps.detractors} detractors`} label="NPS" value={String(report.summary.nps.score)} />
        <StatCard detail={`${pct(report.summary.csat.positivePercent)} positive`} label="CSAT" value={report.summary.csat.average.toFixed(1)} />
        <StatCard detail="Manager follow-up queue" label="Negative Feedback Open" value={String(report.summary.openEscalations)} />
        <StatCard detail={`${report.summary.referralSales} sold`} label="Referral Leads" value={String(report.summary.referralLeads)} />
        <StatCard detail="Collected revenue from referred contacts" label="Referral Revenue" value={formatMoney(report.summary.referralRevenueCents)} />
        <StatCard detail="Lifecycle attribution, not acquisition source" label="Reactivation Revenue" value={formatMoney(report.summary.reactivationRevenueCents)} />
      </section>
      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Location Performance</h2><span>Operational satisfaction signals</span></div>
          <div className="table-wrap"><table className="data-table"><thead><tr><th>Location</th><th>Requests</th><th>Completed</th><th>Rate</th><th>NPS</th><th>CSAT</th><th>Open Cases</th></tr></thead><tbody>{report.locationRows.map((row) => <tr key={row.id}><td>{row.name}</td><td>{row.requests}</td><td>{row.completed}</td><td>{pct(row.responseRate)}</td><td>{row.nps.score}</td><td>{row.csat.average.toFixed(1)}</td><td>{row.openEscalations}</td></tr>)}</tbody></table></div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Provider Feedback</h2><span>Not a clinical quality score</span></div>
          <div className="record-list">{report.providerRows.map((row) => <article key={row.id}><strong>{row.name}</strong><p>{row.feedback} response(s) · NPS {row.nps.score} · CSAT {row.csat.average.toFixed(1)}</p></article>)}</div>
        </section>
      </section>
      {hasReputationPermission(profile, "reputation.manage") ? (
        <details className="panel">
          <summary className="summary-action">Create Ethical Review Request</summary>
          <ReviewRequestForm contacts={contactOptions} locations={profile.locations} sources={(sources ?? []).map((source) => ({ id: source.id, name: source.name }))} />
        </details>
      ) : null}
      <section className="panel">
        <div className="panel-header"><h2>Reports</h2><span>CSV exports respect RLS and selected location scope</span></div>
        <div className="settings-nav">
          <Link href="/reputation/reviews">Review Requests</Link>
          <Link href="/reputation/feedback">Feedback</Link>
          <Link href="/reputation/referrals">Referral Performance</Link>
          <Link href="/reputation/reactivation">Win-Back Revenue</Link>
          <Link href="/reputation/loyalty">Patient Loyalty</Link>
          <Link href="/api/exports/reputation?type=feedback">Export Feedback</Link>
        </div>
      </section>
    </div>
  );
}
