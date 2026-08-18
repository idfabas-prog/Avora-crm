import type { SupabaseClient } from "@supabase/supabase-js";
import { buildFunnel, calculateMarketingMetrics, combineMetricInputs, emptyMetricInput, marketingInsights } from "./metrics";
import type { MarketingFilters, MarketingMetricInput, MarketingReport } from "./types";

type Relation<T> = T | T[] | null | undefined;

function first<T>(value: Relation<T>) {
  return Array.isArray(value) ? value[0] : value;
}

function key(value: string | null | undefined) {
  return value ?? "unattributed";
}

function inRange(value: string | null | undefined, startDate: string, endDate: string) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return time >= new Date(startDate).getTime() && time <= new Date(endDate).getTime();
}

function locationAllowed(locationId: string | null | undefined, locationIds: string[]) {
  return !locationIds.length || !locationId || locationIds.includes(locationId);
}

function addMetric(map: Map<string, MarketingMetricInput>, id: string, patch: Partial<MarketingMetricInput>) {
  const current = map.get(id) ?? emptyMetricInput();
  map.set(id, {
    spendCents: current.spendCents + (patch.spendCents ?? 0),
    impressions: current.impressions + (patch.impressions ?? 0),
    clicks: current.clicks + (patch.clicks ?? 0),
    leads: current.leads + (patch.leads ?? 0),
    booked: current.booked + (patch.booked ?? 0),
    showed: current.showed + (patch.showed ?? 0),
    sales: current.sales + (patch.sales ?? 0),
    grossRevenueCents: current.grossRevenueCents + (patch.grossRevenueCents ?? 0),
    collectedRevenueCents: current.collectedRevenueCents + (patch.collectedRevenueCents ?? 0),
    refundedCents: current.refundedCents + (patch.refundedCents ?? 0)
  });
}

export async function getMarketingReport(supabase: SupabaseClient, filters: MarketingFilters): Promise<MarketingReport> {
  const [
    { data: sources },
    { data: campaigns },
    { data: attributions },
    { data: spend },
    { data: appointments },
    { data: saleAttributions }
  ] = await Promise.all([
    supabase.from("marketing_sources").select("id, name, channel").eq("organization_id", filters.organizationId).order("name"),
    supabase.from("marketing_campaigns").select("id, name, location_id, service_category, source_id, locations(name), marketing_sources(name)").eq("organization_id", filters.organizationId).order("name"),
    supabase.from("contact_attributions").select("id, contact_id, location_id, source_id, campaign_id, attribution_type, captured_at, is_primary").eq("organization_id", filters.organizationId).gte("captured_at", filters.startDate).lte("captured_at", filters.endDate).limit(2000),
    supabase.from("marketing_spend").select("id, location_id, source_id, campaign_id, spend_cents, impressions, clicks, leads, spend_date").eq("organization_id", filters.organizationId).gte("spend_date", filters.startDate.slice(0, 10)).lte("spend_date", filters.endDate.slice(0, 10)).limit(2000),
    supabase.from("appointments").select("id, contact_id, location_id, status, start_at").eq("organization_id", filters.organizationId).gte("start_at", filters.startDate).lte("start_at", filters.endDate).limit(2000),
    supabase.from("sale_attributions").select("id, source_id, campaign_id, attribution_model, sales(id, location_id, contact_id, salesperson_id, status, total_amount_cents, paid_amount_cents, refunded_amount_cents, sale_date, user_profiles!sales_salesperson_id_fkey(full_name))").eq("organization_id", filters.organizationId).limit(2000)
  ]);

  const sourceMeta = new Map((sources ?? []).map((source) => [source.id, { name: source.name, source: source.name }]));
  const campaignMeta = new Map((campaigns ?? []).map((campaign) => {
    const location = first(campaign.locations);
    const source = first(campaign.marketing_sources);
    return [campaign.id, { name: campaign.name, location: location?.name ?? null, source: source?.name ?? null, serviceCategory: campaign.service_category ?? null }];
  }));

  const sourceInputs = new Map<string, MarketingMetricInput>();
  const campaignInputs = new Map<string, MarketingMetricInput>();
  const salespersonInputs = new Map<string, MarketingMetricInput>();
  const contactCampaign = new Map<string, { sourceId: string | null; campaignId: string | null }>();
  const countedContacts = new Set<string>();

  for (const attribution of attributions ?? []) {
    if (!locationAllowed(attribution.location_id, filters.locationIds)) continue;
    if (filters.sourceId && attribution.source_id !== filters.sourceId) continue;
    if (filters.campaignId && attribution.campaign_id !== filters.campaignId) continue;
    const model = filters.attributionModel ?? "primary_attribution";
    const qualifies = model === "primary_attribution" ? attribution.is_primary : attribution.attribution_type === model;
    if (qualifies || !contactCampaign.has(attribution.contact_id)) {
      contactCampaign.set(attribution.contact_id, { sourceId: attribution.source_id, campaignId: attribution.campaign_id });
    }
    if (!countedContacts.has(attribution.contact_id)) {
      countedContacts.add(attribution.contact_id);
      addMetric(sourceInputs, key(attribution.source_id), { leads: 1 });
      addMetric(campaignInputs, key(attribution.campaign_id), { leads: 1 });
    }
  }

  for (const row of spend ?? []) {
    if (!locationAllowed(row.location_id, filters.locationIds)) continue;
    if (filters.sourceId && row.source_id !== filters.sourceId) continue;
    if (filters.campaignId && row.campaign_id !== filters.campaignId) continue;
    const patch = {
      spendCents: row.spend_cents ?? 0,
      impressions: row.impressions ?? 0,
      clicks: row.clicks ?? 0,
      leads: row.leads ?? 0
    };
    addMetric(sourceInputs, key(row.source_id), patch);
    addMetric(campaignInputs, key(row.campaign_id), patch);
  }

  for (const appointment of appointments ?? []) {
    if (!locationAllowed(appointment.location_id, filters.locationIds)) continue;
    const attribution = contactCampaign.get(appointment.contact_id);
    if (!attribution) continue;
    if (filters.sourceId && attribution.sourceId !== filters.sourceId) continue;
    if (filters.campaignId && attribution.campaignId !== filters.campaignId) continue;
    const booked = !["cancelled"].includes(String(appointment.status));
    const showed = ["completed", "checked_in"].includes(String(appointment.status));
    addMetric(sourceInputs, key(attribution.sourceId), { booked: booked ? 1 : 0, showed: showed ? 1 : 0 });
    addMetric(campaignInputs, key(attribution.campaignId), { booked: booked ? 1 : 0, showed: showed ? 1 : 0 });
  }

  for (const attribution of saleAttributions ?? []) {
    if ((filters.attributionModel ?? "primary_attribution") !== attribution.attribution_model) continue;
    if (filters.sourceId && attribution.source_id !== filters.sourceId) continue;
    if (filters.campaignId && attribution.campaign_id !== filters.campaignId) continue;
    const sale = first(attribution.sales);
    if (!sale || !inRange(sale.sale_date, filters.startDate, filters.endDate) || !locationAllowed(sale.location_id, filters.locationIds)) continue;
    const patch = {
      sales: sale.status === "cancelled" ? 0 : 1,
      grossRevenueCents: sale.total_amount_cents ?? 0,
      collectedRevenueCents: sale.paid_amount_cents ?? 0,
      refundedCents: sale.refunded_amount_cents ?? 0
    };
    addMetric(sourceInputs, key(attribution.source_id), patch);
    addMetric(campaignInputs, key(attribution.campaign_id), patch);
    const salesperson = first(sale.user_profiles);
    addMetric(salespersonInputs, key(sale.salesperson_id), patch);
    const salespersonName = salesperson?.full_name ?? "Unassigned";
    if (!sourceMeta.has(key(sale.salesperson_id))) sourceMeta.set(key(sale.salesperson_id), { name: salespersonName, source: salespersonName });
  }

  const sourceRows = Array.from(sourceInputs.entries()).map(([id, input]) => ({
    id,
    name: sourceMeta.get(id)?.name ?? "Unattributed",
    metrics: calculateMarketingMetrics(input)
  })).sort((a, b) => b.metrics.netCollectedRevenueCents - a.metrics.netCollectedRevenueCents);
  const campaignRows = Array.from(campaignInputs.entries()).map(([id, input]) => ({
    id,
    name: campaignMeta.get(id)?.name ?? "Unattributed",
    location: campaignMeta.get(id)?.location,
    source: campaignMeta.get(id)?.source,
    serviceCategory: campaignMeta.get(id)?.serviceCategory,
    metrics: calculateMarketingMetrics(input)
  })).filter((row) => !filters.serviceCategory || row.serviceCategory === filters.serviceCategory).sort((a, b) => b.metrics.netCollectedRevenueCents - a.metrics.netCollectedRevenueCents);
  const salespersonRows = Array.from(salespersonInputs.entries()).map(([id, input]) => ({
    id,
    name: sourceMeta.get(id)?.name ?? "Unassigned",
    metrics: calculateMarketingMetrics(input)
  })).sort((a, b) => b.metrics.sales - a.metrics.sales);
  const summary = calculateMarketingMetrics(combineMetricInputs([...sourceInputs.values()]));

  return {
    summary,
    sourceRows,
    campaignRows,
    salespersonRows,
    insights: marketingInsights(sourceRows, campaignRows),
    funnel: buildFunnel(summary)
  };
}
