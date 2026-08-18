import { ReactivationCampaignForm, ReactivationSegmentForm } from "@/components/crm/ReputationForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { formatMoney } from "@/lib/financial/money";
import { hasReputationPermission } from "@/lib/reputation/permissions";
import { getReputationReport } from "@/lib/reputation/reports";
import { createClient } from "@/lib/supabase/server";

export default async function ReactivationPage() {
  const profile = await requireCurrentProfile();
  if (!hasReputationPermission(profile, "reactivation.read")) return <div className="page-stack"><PageHeader title="Reactivation" description="Access denied." /></div>;
  const supabase = await createClient();
  const selectedLocationId = await getSelectedLocationId(profile);
  const locationIds = allowedLocationIds(profile, selectedLocationId);
  const [report, { data: workflows }] = await Promise.all([
    getReputationReport(supabase, { organizationId: profile.organizationId, locationIds }),
    supabase.from("workflows").select("id, name").eq("organization_id", profile.organizationId).eq("status", "draft").order("name")
  ]);

  return (
    <div className="page-stack">
      <PageHeader description="Draft lifecycle campaigns for inactive patients, consult no-sale recovery, and unused package reminders." title="Reactivation" />
      <section className="metric-grid">
        <StatCard detail="Across draft and active campaigns" label="Contacts Targeted" value={String(report.campaigns.reduce((sum, row) => sum + Number(row.contacts_targeted ?? 0), 0))} />
        <StatCard detail="Booked or sold via lifecycle attribution" label="Reactivated" value={String(report.campaigns.reduce((sum, row) => sum + Number(row.contacts_reactivated ?? 0), 0))} />
        <StatCard detail="Linked booking events" label="Bookings" value={String(report.campaigns.reduce((sum, row) => sum + Number(row.bookings_generated ?? 0), 0))} />
        <StatCard detail="Collected revenue attributed to reactivation" label="Revenue" value={formatMoney(report.summary.reactivationRevenueCents)} />
      </section>
      {hasReputationPermission(profile, "reactivation.manage") ? (
        <section className="dashboard-grid">
          <details className="panel"><summary className="summary-action">Create Segment</summary><ReactivationSegmentForm /></details>
          <details className="panel"><summary className="summary-action">Create Campaign</summary><ReactivationCampaignForm segments={report.segments.map((segment) => ({ id: segment.id, name: segment.name }))} workflows={(workflows ?? []).map((workflow) => ({ id: workflow.id, name: workflow.name }))} /></details>
        </section>
      ) : null}
      <section className="panel">
        <div className="panel-header"><h2>Segments</h2><span>Transparent deterministic rules</span></div>
        <div className="record-list">{report.segments.map((segment) => <article key={segment.id}><strong>{segment.name}</strong><p>{segment.description}</p><span>{JSON.stringify(segment.rules_json)}</span></article>)}</div>
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Win-Back Campaigns</h2><span>Bulk enrollment still requires explicit workflow action</span></div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Campaign</th><th>Status</th><th>Targeted</th><th>Reactivated</th><th>Booked</th><th>Sold</th><th>Revenue</th></tr></thead><tbody>{report.campaigns.map((campaign) => <tr key={campaign.id}><td>{campaign.name}</td><td>{campaign.status}</td><td>{campaign.contacts_targeted}</td><td>{campaign.contacts_reactivated}</td><td>{campaign.bookings_generated}</td><td>{campaign.sales_generated}</td><td>{formatMoney(campaign.collected_revenue_cents)}</td></tr>)}</tbody></table></div>
      </section>
    </div>
  );
}
