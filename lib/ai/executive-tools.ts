import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentProfile } from "@/lib/auth/profile";
import { AI_ASSISTANT_DISPLAY_NAME } from "@/lib/config/branding";
import { formatMoney } from "@/lib/financial/money";
import { getExecutiveReport } from "@/lib/executive/reports";
import type { AiTrace } from "./types";

function pct(value: number | null) {
  if (value === null) return "N/A";
  return `${(value * 100).toFixed(1)}%`;
}

export async function getExecutiveSummary(supabase: SupabaseClient, profile: CurrentProfile, locationIds: string[], question: string) {
  const report = await getExecutiveReport(supabase, profile, { period: "this_month" });
  const bestContribution = [...report.locationScorecards].sort((a, b) => b.kpis.contributionMarginPercent - a.kpis.contributionMarginPercent)[0];
  const bestRoas = [...report.locationScorecards].sort((a, b) => b.kpis.roas - a.kpis.roas)[0];
  const needsAttention = [...report.locationScorecards].sort((a, b) => a.score - b.score)[0];
  const forecast = report.forecasts.find((item) => item.metricKey === "net_collected_revenue_cents");
  const trace: AiTrace = {
    tools: [
      "getExecutiveSummary",
      "getLocationScorecards",
      "getContributionSummary",
      "getTargetPerformance",
      "getExecutiveAlerts",
      "getForecastSummary",
      "getLocationBenchmark",
      "getExpansionReadiness",
      "getCompanyTrendSummary"
    ],
    dateRange: { start: report.range.start, end: report.range.end, label: report.range.label },
    locations: locationIds,
    recordCounts: {
      location_scorecards: report.locationScorecards.length,
      executive_alerts: report.alerts.length,
      executive_targets: report.targets.length,
      forecasts: report.forecasts.length
    },
    filters: { question }
  };

  return {
    facts: [
      `Company net collected revenue is ${formatMoney(report.company.netCollectedRevenueCents)} for ${report.range.label}.`,
      `Contribution before overhead is ${formatMoney(report.company.contributionBeforeOverheadCents)} with a ${pct(report.company.contributionMarginPercent)} contribution margin.`,
      `Marketing spend is ${formatMoney(report.company.marketingSpendCents)} with ${report.company.roas.toFixed(1)}x collected ROAS.`,
      `Company close rate is ${pct(report.company.closeRatePercent)} and labor cost is ${pct(report.company.directLaborCostCents / Math.max(1, report.company.netCollectedRevenueCents))} of net collected revenue.`,
      `NPS is ${report.company.nps ?? "N/A"}, referral revenue is ${formatMoney(report.company.referralRevenueCents)}, and reactivation revenue is ${formatMoney(report.company.reactivationRevenueCents)}.`
    ],
    analysis: [
      needsAttention ? `${needsAttention.locationName} needs the most attention by deterministic score at ${needsAttention.score}/100.` : "No location scorecards were available.",
      bestContribution ? `${bestContribution.locationName} has the strongest contribution margin at ${pct(bestContribution.kpis.contributionMarginPercent)}.` : "Contribution comparison is unavailable.",
      bestRoas ? `${bestRoas.locationName} has the strongest collected ROAS at ${bestRoas.kpis.roas.toFixed(1)}x.` : "Marketing ROAS comparison is unavailable.",
      forecast ? `${forecast.label}: actual ${formatMoney(forecast.actualValue)}, forecast ${formatMoney(forecast.forecastValue)}, confidence ${forecast.confidence}.` : "Revenue forecast is unavailable."
    ],
    recommendations: [
      report.alerts.length ? `Review the top ${Math.min(5, report.alerts.length)} executive alert(s) before changing operating plans.` : "No executive alerts are active in the current scope.",
      needsAttention ? `Use ${needsAttention.locationName}'s scorecard to inspect target gaps, inventory risk, and conversion metrics.` : "Keep reviewing target coverage before relying on trend interpretation.",
      `${AI_ASSISTANT_DISPLAY_NAME} executive answers are read-only; they cannot change targets, inventory, schedules, PTO, campaigns, refunds, or clinical records.`
    ],
    trace
  };
}
