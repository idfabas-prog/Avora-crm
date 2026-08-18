import Link from "next/link";
import { LifecycleCampaignForm } from "@/components/crm/CampaignForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { formatMoney } from "@/lib/financial/money";
import { hasCampaignPermission } from "@/lib/campaigns/permissions";
import { getCampaignDashboard } from "@/lib/campaigns/reports";
import { createClient } from "@/lib/supabase/server";

export default async function LifecycleCampaignsPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  if (!hasCampaignPermission(profile, "campaigns.read")) {
    return <div className="page-stack"><PageHeader description="Your role cannot access lifecycle campaigns." title="Campaigns" /></div>;
  }
  const [dashboard, { data: workflows }] = await Promise.all([
    getCampaignDashboard(supabase, profile),
    supabase.from("workflows").select("id, name").eq("organization_id", profile.organizationId).in("status", ["active", "draft"]).order("name")
  ]);

  return (
    <div className="page-stack">
      <PageHeader
        action={<div className="header-actions"><Link className="secondary-button" href="/marketing/segments">Segments</Link><Link className="secondary-button" href="/settings/campaigns">Campaign Settings</Link><Link className="secondary-button" href="/api/exports/campaigns?type=results">Export Results</Link></div>}
        description="Lifecycle campaigns, bulk SMS simulations, workflow-enrollment campaigns, and A/B performance. Seeded campaigns are not active by default."
        title="Lifecycle Campaigns"
      />
      <section className="metric-grid">
        <StatCard detail="Lifecycle campaigns" label="Campaigns" value={String(dashboard.totals.campaigns)} />
        <StatCard detail="Snapshot recipients" label="Recipients" value={String(dashboard.totals.recipients)} />
        <StatCard detail="Simulated sends" label="Sent" value={String(dashboard.totals.sent)} />
        <StatCard detail="Net collected attribution" label="Revenue" value={formatMoney(dashboard.totals.revenueCents)} />
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Campaigns</h2><span>Draft / Scheduled / Running / Completed</span></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Type</th><th>Status</th><th>Segment</th><th>Recipients</th><th>Sent</th><th>Reply Rate</th><th>Bookings</th><th>Sales</th><th>Revenue</th></tr></thead>
            <tbody>
              {dashboard.campaigns.map((campaign) => (
                <tr key={campaign.id}>
                  <td><Link href={`/marketing/campaigns/${campaign.id}`}>{campaign.name}</Link></td>
                  <td>{campaign.campaign_type}</td>
                  <td><StatusBadge status={campaign.status} /></td>
                  <td>{campaign.segmentName}</td>
                  <td>{campaign.recipients}</td>
                  <td>{campaign.sent}</td>
                  <td>{(campaign.replyRate * 100).toFixed(1)}%</td>
                  <td>{campaign.bookings}</td>
                  <td>{campaign.sales}</td>
                  <td>{formatMoney(campaign.revenueCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {hasCampaignPermission(profile, "campaigns.create") ? (
        <section className="panel">
          <div className="panel-header"><h2>Create Draft Campaign</h2><span>Simulation-safe</span></div>
          <LifecycleCampaignForm segments={dashboard.segments.map((segment) => ({ id: segment.id, name: segment.name }))} workflows={(workflows ?? []).map((workflow) => ({ id: workflow.id, name: workflow.name }))} />
        </section>
      ) : null}
    </div>
  );
}
