import Link from "next/link";
import { CampaignStatusForm, CampaignVariantForm, LaunchSimulationForm } from "@/components/crm/CampaignForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { hasCampaignPermission } from "@/lib/campaigns/permissions";
import { getCampaignDetail } from "@/lib/campaigns/reports";
import { formatDateTime, fromDbStatus } from "@/lib/crm/constants";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { formatMoney } from "@/lib/financial/money";
import { getMarketingDateRange } from "@/lib/marketing/date-ranges";
import { hasMarketingPermission } from "@/lib/marketing/permissions";
import { getMarketingReport } from "@/lib/marketing/reports";
import { createClient } from "@/lib/supabase/server";

function rel<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  if (hasCampaignPermission(profile, "campaigns.read")) {
    const { data: lifecycleCampaign } = await supabase.from("campaigns").select("id").eq("id", id).eq("organization_id", profile.organizationId).maybeSingle();
    if (lifecycleCampaign) {
      const detail = await getCampaignDetail(supabase, profile, id);
      const campaign = detail.campaign as { id: string; name: string; description: string | null; campaign_type: string; status: string; channel: string; message_classification: string; scheduled_at: string | null; recurrence_rule: string | null; metadata?: Record<string, unknown> };
      return (
        <div className="page-stack">
          <PageHeader
            action={
              <div className="header-actions">
                <Link className="secondary-button" href="/marketing/campaigns">Campaigns</Link>
                <Link className="secondary-button" href="/api/exports/campaigns?type=recipients">Export Recipients</Link>
                {hasCampaignPermission(profile, "campaigns.launch") ? <LaunchSimulationForm campaignId={campaign.id} /> : null}
                {hasCampaignPermission(profile, "campaigns.pause") ? <CampaignStatusForm action="pause" campaignId={campaign.id} label="Pause" /> : null}
                {hasCampaignPermission(profile, "campaigns.cancel") ? <CampaignStatusForm action="cancel" campaignId={campaign.id} label="Cancel" /> : null}
              </div>
            }
            description={`${campaign.campaign_type} · ${campaign.channel} · ${campaign.message_classification}. Phase 14 sends are simulated in development.`}
            title={campaign.name}
          />
          <section className="metric-grid">
            <StatCard detail="Snapshot recipients" label="Recipients" value={String(detail.performance.recipients)} />
            <StatCard detail={`${detail.performance.delivered} delivered`} label="Sent" value={String(detail.performance.sent)} />
            <StatCard detail="Replies / sent" label="Reply Rate" value={`${(detail.performance.replyRate * 100).toFixed(1)}%`} />
            <StatCard detail="Net collected attribution" label="Revenue" value={formatMoney(detail.performance.revenueCents)} />
          </section>
          <section className="dashboard-grid">
            <section className="panel">
              <div className="panel-header"><h2>Overview</h2><StatusBadge status={campaign.status} /></div>
              <dl className="settings-list">
                <div><dt>Scheduled</dt><dd>{campaign.scheduled_at ? formatDateTime(campaign.scheduled_at) : "Not scheduled"}</dd></div>
                <div><dt>Recurrence</dt><dd>{campaign.recurrence_rule ?? "One-time"}</dd></div>
                <div><dt>Bookings</dt><dd>{detail.performance.booked}</dd></div>
                <div><dt>Sales</dt><dd>{detail.performance.sold}</dd></div>
                <div><dt>Skipped</dt><dd>{detail.performance.skipped}</dd></div>
                <div><dt>Failed</dt><dd>{detail.performance.failed}</dd></div>
              </dl>
            </section>
            <section className="panel">
              <div className="panel-header"><h2>Variant Analytics</h2><span>Limited confidence until sample size is large</span></div>
              <div className="record-list">
                {detail.variantPerformance.map((variant) => (
                  <article key={variant.variantId}>
                    <strong>{variant.variantId}</strong>
                    <p>Sent {variant.sent} · Replies {variant.replied} · Bookings {variant.booked} · Revenue {formatMoney(variant.revenueCents)}</p>
                    <span>{variant.confidence}</span>
                  </article>
                ))}
              </div>
            </section>
          </section>
          <section className="panel">
            <div className="panel-header"><h2>Recipients</h2><span>Paginated server query</span></div>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Contact</th><th>Location</th><th>Variant</th><th>Status</th><th>Eligibility</th><th>Sent</th><th>Reply</th><th>Booking</th><th>Sale</th><th>Revenue</th></tr></thead>
                <tbody>
                  {detail.recipients.map((recipient) => (
                    <tr key={recipient.id}>
                      <td><Link href={`/contacts/${recipient.contact_id}`}>{recipient.contactName}</Link></td>
                      <td>{recipient.locationName}</td>
                      <td>{recipient.variantName}</td>
                      <td><StatusBadge status={recipient.status} /></td>
                      <td>{recipient.eligibility_status}{recipient.exclusion_reason ? ` · ${recipient.exclusion_reason}` : ""}</td>
                      <td>{recipient.sent_at ? formatDateTime(recipient.sent_at) : "-"}</td>
                      <td>{recipient.replied_at ? "Yes" : "No"}</td>
                      <td>{recipient.booked_at ? "Yes" : "No"}</td>
                      <td>{recipient.sold_at ? "Yes" : "No"}</td>
                      <td>{formatMoney(recipient.revenue_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="dashboard-grid">
            <section className="panel">
              <div className="panel-header"><h2>Variants</h2><span>A/B testing</span></div>
              <div className="record-list">
                {(detail.variants as Array<{ id: string; name: string; message_body: string | null; weight_percent: number; active: boolean }>).map((variant) => (
                  <article key={variant.id}><strong>{variant.name} · {variant.weight_percent}%</strong><p>{variant.message_body}</p><span>{variant.active ? "Active" : "Inactive"}</span></article>
                ))}
              </div>
              {hasCampaignPermission(profile, "campaigns.edit") ? <CampaignVariantForm campaignId={campaign.id} /> : null}
            </section>
            <section className="panel">
              <div className="panel-header"><h2>Failures & Jobs</h2><span>Retry only safe failures</span></div>
              <div className="record-list">
                {(detail.jobs as Array<{ id: string; status: string; attempts: number; run_at: string; last_error: string | null }>).map((job) => (
                  <article key={job.id}><strong>{job.status} · {job.attempts} attempt(s)</strong><p>{formatDateTime(job.run_at)}</p><span>{job.last_error ?? "No error"}</span></article>
                ))}
              </div>
            </section>
          </section>
        </div>
      );
    }
  }
  if (!hasMarketingPermission(profile, "marketing.reports.read")) {
    return <div className="page-stack"><PageHeader description="Your role does not include campaign reporting access." title="Campaign" /></div>;
  }
  const { data: campaign } = await supabase.from("marketing_campaigns").select("id, name, location_id, service_category, objective, status, start_date, end_date, budget_cents, marketing_sources(name), locations(name)").eq("id", id).eq("organization_id", profile.organizationId).single();
  if (!campaign) return <div className="page-stack"><PageHeader description="Campaign not found." title="Campaign" /></div>;
  const selectedLocationId = await getSelectedLocationId(profile);
  const locationIds = allowedLocationIds(profile, selectedLocationId);
  const range = getMarketingDateRange("this_month");
  const [{ data: attributions }, { data: spend }, { data: ads }] = await Promise.all([
    supabase.from("contact_attributions").select("id, captured_at, attribution_type, utm_source, utm_campaign, landing_page, contacts(id, first_name, last_name, status, created_at, assigned:user_profiles!contacts_assigned_to_fkey(full_name))").eq("organization_id", profile.organizationId).eq("campaign_id", id).order("captured_at", { ascending: false }).limit(100),
    supabase.from("marketing_spend").select("spend_date, spend_cents, impressions, clicks, leads").eq("organization_id", profile.organizationId).eq("campaign_id", id).order("spend_date", { ascending: false }).limit(60),
    supabase.from("marketing_ads").select("id, name, creative_name, status, landing_page_url, marketing_ad_groups(name)").eq("organization_id", profile.organizationId).eq("campaign_id", id).order("name")
  ]);
  const report = await getMarketingReport(supabase, { organizationId: profile.organizationId, locationIds, startDate: range.start.toISOString(), endDate: range.end.toISOString(), campaignId: id, attributionModel: "primary_attribution" });
  const row = report.campaignRows[0];
  const source = rel(campaign.marketing_sources);
  const location = rel(campaign.locations);

  return (
    <div className="page-stack">
      <PageHeader action={<Link className="secondary-button" href="/marketing">Marketing Dashboard</Link>} description={`${source?.name ?? "Source"} · ${location?.name ?? "Organization-wide"} · ${campaign.service_category ?? "Other"}`} title={campaign.name} />
      <section className="profile-hero">
        <div><StatusBadge status={fromDbStatus(campaign.status)} /><h2>{campaign.objective ?? "Marketing Campaign"}</h2><p>Budget {formatMoney(campaign.budget_cents)} · Started {campaign.start_date}</p></div>
        <dl>
          <div><dt>Spend</dt><dd>{formatMoney(row?.metrics.spendCents ?? 0)}</dd></div>
          <div><dt>Leads</dt><dd>{row?.metrics.leads ?? 0}</dd></div>
          <div><dt>Sales</dt><dd>{row?.metrics.sales ?? 0}</dd></div>
          <div><dt>Net ROAS</dt><dd>{(row?.metrics.netCollectedRoas ?? 0).toFixed(1)}x</dd></div>
        </dl>
      </section>
      <section className="dashboard-grid">
        <section className="panel"><div className="panel-header"><h2>Funnel</h2><span>This month</span></div><div className="funnel-report">{report.funnel.map((step) => <article key={step.label}><strong>{step.label === "Collected Revenue" ? formatMoney(step.value) : step.value}</strong><span>{step.label}</span><small>{step.label === "Leads" ? "Start" : `${step.rateFromPrevious}${step.label === "Collected Revenue" ? "x" : "%"}`}</small></article>)}</div></section>
        <section className="panel"><div className="panel-header"><h2>Quality</h2><span>Deterministic</span></div><div className="record-list">{(row?.metrics.qualityFlags.length ? row.metrics.qualityFlags : ["No major quality warning detected."]).map((flag) => <article key={flag}><strong>{flag}</strong><p>Health score {row?.metrics.healthScore ?? 0}/100</p></article>)}</div></section>
      </section>
      <section className="panel"><div className="panel-header"><h2>Attributed Leads</h2><span>Contacts captured from this campaign</span></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Contact</th><th>Created</th><th>Status</th><th>Attribution</th><th>Salesperson</th><th>Landing Page</th></tr></thead><tbody>{(attributions ?? []).map((item) => { const contact = rel(item.contacts); const assigned = rel(contact?.assigned); return <tr key={item.id}><td>{contact ? <Link className="strong-link" href={`/contacts/${contact.id}`}>{contact.first_name} {contact.last_name}</Link> : "Unknown"}</td><td>{formatDateTime(contact?.created_at)}</td><td>{fromDbStatus(contact?.status)}</td><td>{fromDbStatus(item.attribution_type)}</td><td>{assigned?.full_name ?? "Unassigned"}</td><td>{item.landing_page ?? "Not captured"}</td></tr>; })}</tbody></table></div></section>
      <section className="dashboard-grid">
        <section className="panel"><div className="panel-header"><h2>Spend</h2><span>Manual and imported rows</span></div><div className="record-list">{(spend ?? []).map((item) => <article key={`${item.spend_date}-${item.spend_cents}`}><strong>{formatMoney(item.spend_cents)}</strong><p>{item.spend_date} · {item.impressions ?? 0} impressions · {item.clicks ?? 0} clicks · {item.leads ?? 0} imported leads</p></article>)}</div></section>
        <section className="panel"><div className="panel-header"><h2>Ads</h2><span>Future Meta/Google compatible</span></div><div className="record-list">{(ads ?? []).map((ad) => { const group = rel(ad.marketing_ad_groups); return <article key={ad.id}><strong>{ad.name}</strong><p>{group?.name ?? "No ad group"} · {fromDbStatus(ad.status)}</p><span>{ad.creative_name ?? "No creative name"} · {ad.landing_page_url ?? "No landing page"}</span></article>; })}</div></section>
      </section>
    </div>
  );
}
