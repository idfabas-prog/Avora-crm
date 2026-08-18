import Link from "next/link";
import { MarketingCampaignForm, MarketingSpendForm } from "@/components/crm/MarketingForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { fromDbStatus } from "@/lib/crm/constants";
import { formatMoney } from "@/lib/financial/money";
import { hasMarketingPermission } from "@/lib/marketing/permissions";
import { createClient } from "@/lib/supabase/server";

function rel<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function MarketingCampaignSettingsPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const canManage = hasMarketingPermission(profile, "marketing.manage");
  const canSpend = hasMarketingPermission(profile, "marketing.spend.write");
  const [{ data: sources }, { data: campaigns }] = await Promise.all([
    supabase.from("marketing_sources").select("id, name").eq("organization_id", profile.organizationId).order("name"),
    supabase.from("marketing_campaigns").select("id, name, source_id, location_id, provider, external_campaign_id, service_category, objective, status, start_date, end_date, budget_cents, active, marketing_sources(name), locations(name)").eq("organization_id", profile.organizationId).order("name")
  ]);
  const sourceOptions = (sources ?? []).map((source) => ({ id: source.id, name: source.name }));
  const campaignOptions = (campaigns ?? []).map((campaign) => ({ id: campaign.id, name: campaign.name }));

  return (
    <div className="page-stack">
      <PageHeader description="Manual campaign setup with future-safe external IDs for Meta and Google imports." title="Marketing Campaigns" />
      <section className="dashboard-grid">
        {canManage ? <details className="panel"><summary className="summary-action">Create Campaign</summary><MarketingCampaignForm locations={profile.locations} sources={sourceOptions} /></details> : null}
        {canSpend ? <details className="panel"><summary className="summary-action">Enter Spend</summary><MarketingSpendForm campaigns={campaignOptions} locations={profile.locations} sources={sourceOptions} /></details> : null}
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Campaigns</h2><span>Do not delete campaigns with historical attribution</span></div>
        <div className="record-list">
          {(campaigns ?? []).map((campaign) => {
            const source = rel(campaign.marketing_sources);
            const location = rel(campaign.locations);
            return (
              <article key={campaign.id}>
                <strong><Link className="strong-link" href={`/marketing/campaigns/${campaign.id}`}>{campaign.name}</Link></strong>
                <p>{source?.name ?? "Source"} · {location?.name ?? "Organization-wide"} · {campaign.service_category ?? "Other"} · Budget {formatMoney(campaign.budget_cents)}</p>
                <span>{campaign.external_campaign_id ?? "Manual campaign"} · {fromDbStatus(campaign.status)}</span>
                <StatusBadge status={campaign.active ? "Active" : "Inactive"} />
                {canManage ? <details><summary className="summary-action">Edit</summary><MarketingCampaignForm campaign={{
                  id: campaign.id,
                  name: campaign.name,
                  source_id: campaign.source_id,
                  location_id: campaign.location_id,
                  provider: campaign.provider,
                  external_campaign_id: campaign.external_campaign_id,
                  service_category: campaign.service_category,
                  objective: campaign.objective,
                  status: campaign.status,
                  start_date: campaign.start_date,
                  end_date: campaign.end_date,
                  budget_cents: campaign.budget_cents,
                  active: campaign.active
                }} locations={profile.locations} sources={sourceOptions} /></details> : null}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
