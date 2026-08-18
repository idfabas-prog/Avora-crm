import { ReferralCodeForm, ReferralForm, ReferralRewardForm, ReferralStatusForm } from "@/components/crm/ReputationForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { formatMoney } from "@/lib/financial/money";
import { hasReputationPermission } from "@/lib/reputation/permissions";
import { getReputationReport } from "@/lib/reputation/reports";
import { createClient } from "@/lib/supabase/server";

function first<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ReferralsPage() {
  const profile = await requireCurrentProfile();
  if (!hasReputationPermission(profile, "referrals.read")) return <div className="page-stack"><PageHeader title="Referrals" description="Access denied." /></div>;
  const supabase = await createClient();
  const selectedLocationId = await getSelectedLocationId(profile);
  const locationIds = allowedLocationIds(profile, selectedLocationId);
  const report = await getReputationReport(supabase, { organizationId: profile.organizationId, locationIds });
  const { data: contacts } = await supabase.from("contacts").select("id, first_name, last_name, location_id").eq("organization_id", profile.organizationId).order("last_name").limit(500);
  const contactOptions = (contacts ?? []).map((contact) => ({ id: contact.id, name: `${contact.first_name} ${contact.last_name}`, location_id: contact.location_id }));
  const codeOptions = report.referralCodes.map((code) => ({ id: code.id, name: code.code }));
  const referralOptions = report.referrals.map((referral) => {
    const referrer = first(referral.referring);
    return { id: referral.id, name: `${referrer?.first_name ?? "Referral"} ${referrer?.last_name ?? ""} · ${referral.status}` };
  });

  return (
    <div className="page-stack">
      <PageHeader description="Referral sources, conversions, reward ledger, and revenue attribution." title="Referrals" />
      <section className="metric-grid">
        <StatCard detail="All location-scoped referral records" label="Referral Leads" value={String(report.summary.referralLeads)} />
        <StatCard detail={`${report.summary.referralConversionRate.toFixed(1)}% sold`} label="Referral Sales" value={String(report.summary.referralSales)} />
        <StatCard detail="Collected revenue on linked sales" label="Referral Revenue" value={formatMoney(report.summary.referralRevenueCents)} />
        <StatCard detail="Revenue minus ledgered reward cost" label="Net Contribution" value={formatMoney(report.summary.referralNetContributionCents)} />
      </section>
      {hasReputationPermission(profile, "referrals.manage") ? (
        <section className="dashboard-grid">
          <details className="panel"><summary className="summary-action">Generate Referral Code</summary><ReferralCodeForm contacts={contactOptions} programs={report.referralPrograms.map((program) => ({ id: program.id, name: program.name }))} /></details>
          <details className="panel"><summary className="summary-action">Create Referral</summary><ReferralForm codes={codeOptions} contacts={contactOptions} locations={profile.locations} /></details>
          {hasReputationPermission(profile, "referrals.rewards.manage") ? <details className="panel"><summary className="summary-action">Issue Demo Reward</summary><ReferralRewardForm referrals={referralOptions} /></details> : null}
        </section>
      ) : null}
      <section className="panel">
        <div className="panel-header"><h2>Referral Pipeline</h2><span>Rewards require staff approval</span></div>
        <div className="record-list">{report.referrals.map((referral) => {
          const referrer = first(referral.referring);
          const referred = first(referral.referred);
          const sale = first(referral.sales);
          return <article key={referral.id}><strong>{`${referrer?.first_name ?? ""} ${referrer?.last_name ?? ""}`}</strong><p>Referred {referred ? `${referred.first_name} ${referred.last_name}` : "unlinked lead"} · {referral.status} · {formatMoney(Number(sale?.paid_amount_cents ?? 0))}</p>{hasReputationPermission(profile, "referrals.manage") ? <ReferralStatusForm referralId={referral.id} /> : null}</article>;
        })}</div>
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Top Referrers</h2><span>Contact UUIDs are not exposed in share links</span></div>
        <div className="record-list">{report.topReferrers.map((row) => <article key={row.id}><strong>{row.contactName || row.code}</strong><p>{row.code} · {row.referrals} referral(s) · {row.sold} sold</p><span>{`/r/${row.code}`}</span></article>)}</div>
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Reward Ledger</h2><span>Ledgered only; no cash is issued automatically</span></div>
        <div className="record-list">{report.rewardEvents.map((event) => <article key={event.id}><strong>{event.event_type} · {event.reward_type}</strong><p>{formatMoney(event.amount_cents)} · {event.reason}</p></article>)}</div>
      </section>
    </div>
  );
}
