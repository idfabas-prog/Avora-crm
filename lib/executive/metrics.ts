import type { ExecutiveDateRange, ExecutiveKpis, ExecutiveStatus, LocationScorecard, TargetRow, TrendDirection } from "./types";

const dayMs = 24 * 60 * 60 * 1000;

export const emptyKpis: ExecutiveKpis = {
  grossSalesCents: 0,
  collectedRevenueCents: 0,
  netCollectedRevenueCents: 0,
  refundsCents: 0,
  outstandingBalanceCents: 0,
  inventoryCogsCents: 0,
  directLaborCostCents: 0,
  contributionBeforeOverheadCents: 0,
  contributionMarginPercent: 0,
  marketingSpendCents: 0,
  roas: 0,
  closeRatePercent: 0,
  averageTicketCents: 0,
  showRatePercent: 0,
  noShowRatePercent: 0,
  referralRevenueCents: 0,
  reactivationRevenueCents: 0,
  nps: null,
  activeMemberships: 0,
  bookedConsults: 0,
  showedConsults: 0,
  noShowConsults: 0,
  soldCount: 0,
  paidSalesCount: 0,
  leads: 0,
  treatmentCompleted: 0,
  providerUtilizationPercent: 0,
  followUpsDue: 0,
  unsignedNotes: 0,
  missingConsents: 0,
  staffScheduledToday: 0,
  clockedInNow: 0,
  lateToday: 0,
  openAttendanceExceptions: 0,
  overtimeRiskCount: 0,
  ptoToday: 0,
  revenuePerLaborHourCents: 0,
  inventoryValueCents: 0,
  lowStockItems: 0,
  outOfStockItems: 0,
  expiringSoonItems: 0,
  wasteCostCents: 0,
  openPurchaseOrders: 0,
  reviewRequests: 0,
  completedReviews: 0,
  openNegativeFeedback: 0,
  averageExternalRating: null,
  referralLeads: 0,
  referralSales: 0,
  inactivePatients: 0,
  activeReactivationCampaigns: 0,
  reactivationBookingsRecovered: 0,
  membershipRevenueCents: 0,
  pastDueMemberships: 0,
  cancelledMembershipsThisMonth: 0
};

export function safeDivide(numerator: number, denominator: number) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return 0;
  }
  return numerator / denominator;
}

export function percent(numerator: number, denominator: number) {
  return safeDivide(numerator, denominator);
}

export function contributionBeforeOverhead(netCollectedRevenueCents: number, inventoryCogsCents: number, directLaborCostCents: number) {
  const contributionCents = netCollectedRevenueCents - inventoryCogsCents - directLaborCostCents;
  return {
    contributionCents,
    marginPercent: percent(contributionCents, netCollectedRevenueCents)
  };
}

export function calculateTrend(current: number, previous: number) {
  const absoluteChange = current - previous;
  let direction: TrendDirection = "flat";
  if (absoluteChange > 0) direction = "up";
  if (absoluteChange < 0) direction = "down";
  return {
    absoluteChange,
    percentChange: previous === 0 ? null : absoluteChange / previous,
    direction
  };
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function rangeFromDates(start: Date, end: Date, label: string, period: ExecutiveDateRange["period"]): ExecutiveDateRange {
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / dayMs) + 1);
  const priorEnd = new Date(start.getTime() - dayMs);
  const priorStart = new Date(priorEnd.getTime() - (days - 1) * dayMs);
  return {
    start: isoDate(start),
    end: isoDate(end),
    label,
    priorStart: isoDate(priorStart),
    priorEnd: isoDate(priorEnd),
    priorLabel: `Prior ${label.toLowerCase()}`,
    period
  };
}

export function executiveDateRange(period: ExecutiveDateRange["period"], now = new Date()): ExecutiveDateRange {
  const today = startOfDay(now);
  if (period === "yesterday") {
    const yesterday = new Date(today.getTime() - dayMs);
    return rangeFromDates(yesterday, yesterday, "Yesterday", period);
  }
  if (period === "today") return rangeFromDates(today, today, "Today", period);
  if (period === "this_week") {
    const day = today.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    return rangeFromDates(new Date(today.getTime() + mondayOffset * dayMs), today, "This Week", period);
  }
  if (period === "this_quarter") {
    const quarterStartMonth = Math.floor(today.getMonth() / 3) * 3;
    return rangeFromDates(new Date(today.getFullYear(), quarterStartMonth, 1), today, "This Quarter", period);
  }
  if (period === "year_to_date") {
    return rangeFromDates(new Date(today.getFullYear(), 0, 1), today, "Year to Date", period);
  }
  return rangeFromDates(new Date(today.getFullYear(), today.getMonth(), 1), today, "This Month", "this_month");
}

export function scoreTarget(metricValue: number, target: TargetRow | undefined, lowerIsBetter = false): ExecutiveStatus {
  if (!target) return "On Target";
  const targetValue = Number(target.target_value);
  const warning = target.warning_threshold === null ? null : Number(target.warning_threshold);
  const critical = target.critical_threshold === null ? null : Number(target.critical_threshold);
  if (lowerIsBetter) {
    if (metricValue <= targetValue) return "Above Target";
    if (critical !== null && metricValue >= critical) return "Below Target";
    if (warning !== null && metricValue >= warning) return "Watch";
    return "On Target";
  }
  if (metricValue >= targetValue) return "Above Target";
  if (critical !== null && metricValue <= critical) return "Below Target";
  if (warning !== null && metricValue <= warning) return "Watch";
  return "On Target";
}

export function runRateForecast(actualValue: number, range: ExecutiveDateRange, monthDays = 30) {
  const start = new Date(`${range.start}T00:00:00`);
  const end = new Date(`${range.end}T00:00:00`);
  const elapsedDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / dayMs) + 1);
  return Math.round(safeDivide(actualValue, elapsedDays) * monthDays);
}

export function forecastConfidence(range: ExecutiveDateRange, monthDays = 30) {
  const start = new Date(`${range.start}T00:00:00`);
  const end = new Date(`${range.end}T00:00:00`);
  const elapsedDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / dayMs) + 1);
  const completion = elapsedDays / monthDays;
  if (completion < 0.33) return "Early Estimate" as const;
  if (completion < 0.66) return "Moderate Confidence" as const;
  return "Higher Confidence" as const;
}

export function scoreComponent(actual: number, target: number, lowerIsBetter = false) {
  if (target <= 0) return 75;
  const ratio = lowerIsBetter ? safeDivide(target, actual || target) : safeDivide(actual, target);
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
}

export function executiveScore(components: Record<string, number>, weights: Record<string, number>) {
  const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0) || 1;
  return Math.round(
    Object.entries(components).reduce((sum, [category, value]) => sum + value * (weights[category] ?? 0), 0) / totalWeight
  );
}

export function expansionReadiness(scorecard: Pick<LocationScorecard, "score" | "components" | "kpis">) {
  const factors: string[] = [];
  if (scorecard.components.financial >= 80) factors.push("Revenue and contribution are stable.");
  if (scorecard.components.marketing >= 80) factors.push("Marketing efficiency is strong.");
  if (scorecard.components.operations >= 80) factors.push("Operational coverage is healthy.");
  if (scorecard.kpis.lowStockItems + scorecard.kpis.outOfStockItems === 0) factors.push("Inventory stability is strong.");
  if (scorecard.kpis.nps !== null && scorecard.kpis.nps >= 60) factors.push("Patient sentiment supports growth.");
  if (factors.length === 0) factors.push("Build more consistency before treating expansion as likely.");
  if (scorecard.score >= 85) return { label: "Strong" as const, score: scorecard.score, factors };
  if (scorecard.score >= 72) return { label: "Ready Soon" as const, score: scorecard.score, factors };
  return { label: "Building" as const, score: scorecard.score, factors };
}

export function aggregateKpis(rows: ExecutiveKpis[]) {
  const aggregate = { ...emptyKpis };
  let npsWeightedTotal = 0;
  let npsCount = 0;
  let ratingWeightedTotal = 0;
  let ratingCount = 0;
  for (const row of rows) {
    for (const key of Object.keys(aggregate) as Array<keyof ExecutiveKpis>) {
      if (key === "nps" || key === "averageExternalRating") continue;
      aggregate[key] = (Number(aggregate[key]) + Number(row[key])) as never;
    }
    if (row.nps !== null) {
      npsWeightedTotal += row.nps;
      npsCount += 1;
    }
    if (row.averageExternalRating !== null) {
      ratingWeightedTotal += row.averageExternalRating;
      ratingCount += 1;
    }
  }
  aggregate.nps = npsCount ? Math.round(npsWeightedTotal / npsCount) : null;
  aggregate.averageExternalRating = ratingCount ? Math.round((ratingWeightedTotal / ratingCount) * 10) / 10 : null;
  aggregate.netCollectedRevenueCents = aggregate.collectedRevenueCents - aggregate.refundsCents;
  const contribution = contributionBeforeOverhead(aggregate.netCollectedRevenueCents, aggregate.inventoryCogsCents, aggregate.directLaborCostCents);
  aggregate.contributionBeforeOverheadCents = contribution.contributionCents;
  aggregate.contributionMarginPercent = contribution.marginPercent;
  aggregate.roas = safeDivide(aggregate.netCollectedRevenueCents, aggregate.marketingSpendCents);
  aggregate.closeRatePercent = percent(aggregate.soldCount, aggregate.showedConsults);
  aggregate.showRatePercent = percent(aggregate.showedConsults, aggregate.bookedConsults);
  aggregate.noShowRatePercent = percent(aggregate.noShowConsults, aggregate.bookedConsults);
  aggregate.averageTicketCents = Math.round(safeDivide(aggregate.grossSalesCents, aggregate.soldCount));
  aggregate.providerUtilizationPercent = percent(aggregate.treatmentCompleted, Math.max(aggregate.treatmentCompleted, aggregate.bookedConsults));
  aggregate.revenuePerLaborHourCents = Math.round(safeDivide(aggregate.netCollectedRevenueCents, aggregate.directLaborCostCents ? aggregate.directLaborCostCents / 3500 : 0));
  return aggregate;
}

export function buildBenchmarks(location: ExecutiveKpis, company: ExecutiveKpis) {
  return {
    revenue: `Company average ${Math.round(safeDivide(company.netCollectedRevenueCents, 1))}`,
    closeRate: `Company ${(company.closeRatePercent * 100).toFixed(1)}%`,
    roas: `Company ${company.roas.toFixed(1)}x`,
    contribution: `Company ${(company.contributionMarginPercent * 100).toFixed(1)}%`,
    nps: location.nps === null ? "No NPS yet" : `Company ${company.nps ?? 0}`
  };
}
