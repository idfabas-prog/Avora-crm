import Link from "next/link";
import { MarketingSpendForm } from "@/components/crm/MarketingForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { formatMoney } from "@/lib/financial/money";
import { getMarketingDateRange, type MarketingPeriod } from "@/lib/marketing/date-ranges";
import { hasMarketingPermission } from "@/lib/marketing/permissions";
import { getMarketingReport } from "@/lib/marketing/reports";
import { createClient } from "@/lib/supabase/server";

function metric(value: number, suffix = "") {
  return `${value.toFixed(value % 1 ? 1 : 0)}${suffix}`;
}

export default async function MarketingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const profile = await requireCurrentProfile();
  const params = await searchParams;
  const supabase = await createClient();
  if (!hasMarketingPermission(profile, "marketing.reports.read")) {
    return <div className="page-stack"><PageHeader description="Your current role does not include marketing reports access." title="Marketing" /></div>;
  }

  const selectedLocationId = await getSelectedLocationId(profile);
  const locationIds = allowedLocationIds(profile, selectedLocationId);
  const range = getMarketingDateRange((params.period as MarketingPeriod) ?? "this_month", new Date(), params.start, params.end);
  const [{ data: sources }, { data: campaigns }] = await Promise.all([
    supabase.from("marketing_sources").select("id, name").eq("organization_id", profile.organizationId).order("name"),
    supabase.from("marketing_campaigns").select("id, name").eq("organization_id", profile.organizationId).order("name")
  ]);
  const report = await getMarketingReport(supabase, {
    organizationId: profile.organizationId,
    locationIds,
    startDate: range.start.toISOString(),
    endDate: range.end.toISOString(),
    sourceId: params.source || null,
    campaignId: params.campaign || null,
    serviceCategory: params.service || null,
    attributionModel: (params.model as never) || "primary_attribution"
  });
  const sourceOptions = (sources ?? []).map((source) => ({ id: source.id, name: source.name }));
  const campaignOptions = (campaigns ?? []).map((campaign) => ({ id: campaign.id, name: campaign.name }));

  return (
    <div className="page-stack">
      <PageHeader
        action={<div className="header-actions"><Link className="secondary-button" href="/settings/marketing/sources">Sources</Link><Link className="secondary-button" href="/marketing/segments">Segments</Link><Link className="primary-button" href="/marketing/campaigns">Lifecycle Campaigns</Link></div>}
        description="Collected-revenue attribution across sources, campaigns, locations, services, and sales execution."
        title="Marketing"
      />
      <form className="query-toolbar">
        <label><span>Date Range</span><select name="period" defaultValue={params.period ?? "this_month"}><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="this_week">This Week</option><option value="last_week">Last Week</option><option value="this_month">This Month</option><option value="last_month">Last Month</option><option value="quarter">Quarter</option><option value="year_to_date">Year to Date</option></select></label>
        <label><span>Source</span><select name="source" defaultValue={params.source ?? ""}><option value="">All sources</option>{sourceOptions.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label>
        <label><span>Campaign</span><select name="campaign" defaultValue={params.campaign ?? ""}><option value="">All campaigns</option>{campaignOptions.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label>
        <label><span>Model</span><select name="model" defaultValue={params.model ?? "primary_attribution"}><option value="primary_attribution">Primary Attribution</option><option value="first_touch">First Touch</option><option value="last_touch">Last Touch</option><option value="lead_creation">Lead Creation</option></select></label>
        <button type="submit">Apply</button>
      </form>
      <section className="metric-grid">
        <StatCard detail="Manual + imported media spend" label="Spend" value={formatMoney(report.summary.spendCents)} />
        <StatCard detail="Unique attributed CRM leads plus imported lead counts" label="Leads" value={String(report.summary.leads)} />
        <StatCard detail="Non-cancelled consultations" label="Booked Consults" value={String(report.summary.booked)} />
        <StatCard detail="Completed or checked-in consults" label="Shows" value={String(report.summary.showed)} />
        <StatCard detail="Attributed sales snapshots" label="Sales" value={String(report.summary.sales)} />
        <StatCard detail="Payments minus refunds" label="Net Collected" value={formatMoney(report.summary.netCollectedRevenueCents)} />
        <StatCard detail="Spend divided by leads" label="CPL" value={formatMoney(report.summary.cplCents)} />
        <StatCard detail="Net collected revenue divided by spend" label="ROAS" value={`${report.summary.netCollectedRoas.toFixed(1)}x`} />
      </section>
      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Marketing Funnel</h2><span>{range.label}</span></div>
          <div className="funnel-report">{report.funnel.map((step) => <article key={step.label}><strong>{step.label === "Collected Revenue" ? formatMoney(step.value) : step.value}</strong><span>{step.label}</span><small>{step.label === "Leads" ? "Start" : `${metric(step.rateFromPrevious, step.label === "Collected Revenue" ? "x ROAS" : "%")}`}</small></article>)}</div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Insight Cards</h2><span>Deterministic signals</span></div>
          <div className="record-list">{report.insights.map((insight) => <article key={insight}><strong>{insight}</strong></article>)}</div>
        </section>
      </section>
      {hasMarketingPermission(profile, "marketing.spend.write") ? (
        <details className="panel">
          <summary className="summary-action">Enter Manual Spend</summary>
          <MarketingSpendForm campaigns={campaignOptions} locations={profile.locations} sources={sourceOptions} />
        </details>
      ) : null}
      <section className="panel">
        <div className="panel-header"><h2>Source Performance</h2><span>Spend, funnel, revenue, CPL, CAC, ROAS</span></div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Source</th><th>Spend</th><th>Leads</th><th>Booked</th><th>Showed</th><th>Sold</th><th>Net Collected</th><th>CPL</th><th>CAC</th><th>ROAS</th></tr></thead><tbody>{report.sourceRows.map((row) => <tr key={row.id}><td>{row.name}</td><td>{formatMoney(row.metrics.spendCents)}</td><td>{row.metrics.leads}</td><td>{row.metrics.booked}</td><td>{row.metrics.showed}</td><td>{row.metrics.sales}</td><td>{formatMoney(row.metrics.netCollectedRevenueCents)}</td><td>{formatMoney(row.metrics.cplCents)}</td><td>{formatMoney(row.metrics.cacCents)}</td><td>{row.metrics.netCollectedRoas.toFixed(1)}x</td></tr>)}</tbody></table></div>
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Campaign Performance</h2><span>Click a campaign for leads, appointments, sales, ads, and attribution</span></div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Campaign</th><th>Location</th><th>Service</th><th>Spend</th><th>Leads</th><th>Booked</th><th>Shows</th><th>Sales</th><th>Collected</th><th>CPL</th><th>Cost/Booked</th><th>CAC</th><th>ROAS</th><th>Health</th></tr></thead><tbody>{report.campaignRows.map((row) => <tr key={row.id}><td><Link className="strong-link" href={`/marketing/campaigns/${row.id}`}>{row.name}</Link></td><td>{row.location ?? "Org-wide"}</td><td>{row.serviceCategory ?? "Other"}</td><td>{formatMoney(row.metrics.spendCents)}</td><td>{row.metrics.leads}</td><td>{row.metrics.booked}</td><td>{row.metrics.showed}</td><td>{row.metrics.sales}</td><td>{formatMoney(row.metrics.netCollectedRevenueCents)}</td><td>{formatMoney(row.metrics.cplCents)}</td><td>{formatMoney(row.metrics.costPerBookedCents)}</td><td>{formatMoney(row.metrics.cacCents)}</td><td>{row.metrics.netCollectedRoas.toFixed(1)}x</td><td>{row.metrics.healthScore}</td></tr>)}</tbody></table></div>
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Salesperson + Source</h2><span>Attributed sales execution context</span></div>
        <div className="record-list">{report.salespersonRows.map((row) => <article key={row.id}><strong>{row.name}</strong><p>{row.metrics.sales} attributed sales · {formatMoney(row.metrics.netCollectedRevenueCents)} net collected · average ticket {formatMoney(row.metrics.averageTicketCents)}</p></article>)}</div>
      </section>
    </div>
  );
}
