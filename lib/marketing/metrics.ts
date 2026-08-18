import type { MarketingMetricInput, MarketingMetrics, PerformanceRow } from "./types";

export function safeDivide(numerator: number, denominator: number) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return numerator / denominator;
}

export function rate(numerator: number, denominator: number) {
  return Math.round(safeDivide(numerator, denominator) * 1000) / 10;
}

export function calculateMarketingMetrics(input: MarketingMetricInput): MarketingMetrics {
  const netCollectedRevenueCents = Math.max(input.collectedRevenueCents - input.refundedCents, 0);
  const cplCents = Math.round(safeDivide(input.spendCents, input.leads));
  const cacCents = Math.round(safeDivide(input.spendCents, input.sales));
  const grossRoas = Math.round(safeDivide(input.grossRevenueCents, input.spendCents) * 100) / 100;
  const netCollectedRoas = Math.round(safeDivide(netCollectedRevenueCents, input.spendCents) * 100) / 100;
  const leadToBookingRate = rate(input.booked, input.leads);
  const bookingToShowRate = rate(input.showed, input.booked);
  const showToSaleRate = rate(input.sales, input.showed);
  const leadToSaleRate = rate(input.sales, input.leads);
  const healthScore = campaignHealthScore({ cplCents, leadToBookingRate, bookingToShowRate, showToSaleRate, netCollectedRoas, leads: input.leads });

  return {
    ...input,
    netCollectedRevenueCents,
    cpcCents: Math.round(safeDivide(input.spendCents, input.clicks)),
    cplCents,
    costPerBookedCents: Math.round(safeDivide(input.spendCents, input.booked)),
    costPerShowCents: Math.round(safeDivide(input.spendCents, input.showed)),
    cacCents,
    leadToBookingRate,
    bookingToShowRate,
    showToSaleRate,
    leadToSaleRate,
    averageTicketCents: Math.round(safeDivide(input.grossRevenueCents, input.sales)),
    grossRoas,
    netCollectedRoas,
    healthScore,
    qualityFlags: campaignQualityFlags({ ...input, netCollectedRoas, leadToBookingRate, bookingToShowRate, showToSaleRate })
  };
}

export function emptyMetricInput(): MarketingMetricInput {
  return {
    spendCents: 0,
    impressions: 0,
    clicks: 0,
    leads: 0,
    booked: 0,
    showed: 0,
    sales: 0,
    grossRevenueCents: 0,
    collectedRevenueCents: 0,
    refundedCents: 0
  };
}

export function combineMetricInputs(rows: MarketingMetricInput[]) {
  return rows.reduce((total, row) => ({
    spendCents: total.spendCents + row.spendCents,
    impressions: total.impressions + row.impressions,
    clicks: total.clicks + row.clicks,
    leads: total.leads + row.leads,
    booked: total.booked + row.booked,
    showed: total.showed + row.showed,
    sales: total.sales + row.sales,
    grossRevenueCents: total.grossRevenueCents + row.grossRevenueCents,
    collectedRevenueCents: total.collectedRevenueCents + row.collectedRevenueCents,
    refundedCents: total.refundedCents + row.refundedCents
  }), emptyMetricInput());
}

export function campaignQualityFlags(input: MarketingMetricInput & { netCollectedRoas: number; leadToBookingRate: number; bookingToShowRate: number; showToSaleRate: number }) {
  const flags: string[] = [];
  if (input.leads >= 25 && input.leadToBookingRate < 20) flags.push("High lead volume but low booking rate");
  if (input.booked >= 10 && input.bookingToShowRate < 70) flags.push("Booked consults are not showing consistently");
  if (input.showed >= 5 && input.showToSaleRate < 25) flags.push("Consults show but close rate is weak");
  if (input.spendCents > 0 && input.leads === 0) flags.push("Spend exists with no attributed leads");
  if (input.netCollectedRoas > 4 && input.sales < 3) flags.push("Strong ROAS, but low volume");
  return flags;
}

export function campaignHealthScore(input: { cplCents: number; leadToBookingRate: number; bookingToShowRate: number; showToSaleRate: number; netCollectedRoas: number; leads: number }) {
  let score = 50;
  if (input.leads >= 25) score += 8;
  if (input.cplCents > 0 && input.cplCents <= 15000) score += 12;
  if (input.leadToBookingRate >= 35) score += 10;
  if (input.bookingToShowRate >= 75) score += 10;
  if (input.showToSaleRate >= 30) score += 10;
  if (input.netCollectedRoas >= 3) score += 15;
  if (input.netCollectedRoas < 1 && input.cplCents > 0) score -= 15;
  return Math.max(0, Math.min(100, score));
}

export function buildFunnel(metrics: MarketingMetrics) {
  return [
    { label: "Leads", value: metrics.leads, rateFromPrevious: 100 },
    { label: "Booked Consults", value: metrics.booked, rateFromPrevious: metrics.leadToBookingRate },
    { label: "Showed", value: metrics.showed, rateFromPrevious: metrics.bookingToShowRate },
    { label: "Sold", value: metrics.sales, rateFromPrevious: metrics.showToSaleRate },
    { label: "Collected Revenue", value: metrics.netCollectedRevenueCents, rateFromPrevious: metrics.netCollectedRoas }
  ];
}

export function marketingInsights(sourceRows: PerformanceRow[], campaignRows: PerformanceRow[]) {
  const insights: string[] = [];
  const bestRoas = [...campaignRows].filter((row) => row.metrics.spendCents > 0).sort((a, b) => b.metrics.netCollectedRoas - a.metrics.netCollectedRoas)[0];
  const lowQuality = campaignRows.find((row) => row.metrics.qualityFlags.length > 0);
  const sourceLeader = [...sourceRows].sort((a, b) => b.metrics.sales - a.metrics.sales)[0];
  if (bestRoas) insights.push(`${bestRoas.name} has the strongest net collected ROAS at ${bestRoas.metrics.netCollectedRoas.toFixed(1)}x.`);
  if (lowQuality) insights.push(`${lowQuality.name}: ${lowQuality.metrics.qualityFlags[0]}.`);
  if (sourceLeader) insights.push(`${sourceLeader.name} produced the most attributed sales in this period.`);
  if (!insights.length) insights.push("No marketing performance signals are available for the selected filters yet.");
  return insights;
}
