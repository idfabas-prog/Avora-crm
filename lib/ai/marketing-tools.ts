import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentProfile } from "@/lib/auth/profile";
import { formatMoney } from "@/lib/financial/money";
import { getMarketingDateRange } from "@/lib/marketing/date-ranges";
import { getMarketingReport } from "@/lib/marketing/reports";
import type { AiTrace } from "./types";

export async function getMarketingSummary(supabase: SupabaseClient, profile: CurrentProfile, locationIds: string[]) {
  const range = getMarketingDateRange("this_month");
  const report = await getMarketingReport(supabase, {
    organizationId: profile.organizationId,
    locationIds,
    startDate: range.start.toISOString(),
    endDate: range.end.toISOString(),
    attributionModel: "primary_attribution"
  });
  const bestCampaign = report.campaignRows[0];
  const bestSource = report.sourceRows[0];
  const trace: AiTrace = {
    tools: ["getMarketingSummary", "getCampaignPerformance", "getSourcePerformance", "getMarketingFunnel", "getCampaignLeadQuality", "getROASComparison"],
    dateRange: { start: range.start.toISOString(), end: range.end.toISOString(), label: range.label },
    locations: locationIds,
    recordCounts: {
      campaign_rows: report.campaignRows.length,
      source_rows: report.sourceRows.length,
      leads: report.summary.leads,
      sales: report.summary.sales
    }
  };
  return {
    facts: [
      `Marketing spend is ${formatMoney(report.summary.spendCents)} for ${range.label}.`,
      `Net collected revenue attributed to marketing is ${formatMoney(report.summary.netCollectedRevenueCents)}.`,
      `Net collected ROAS is ${report.summary.netCollectedRoas.toFixed(1)}x.`,
      bestCampaign ? `${bestCampaign.name} is the top campaign by net collected revenue.` : "No campaign rows were found."
    ],
    analysis: [
      `CPL is ${formatMoney(report.summary.cplCents)} and CAC is ${formatMoney(report.summary.cacCents)}.`,
      bestSource ? `${bestSource.name} is the strongest source by attributed sales/revenue in this scope.` : "No source comparison is available.",
      ...report.insights
    ],
    recommendations: [
      bestCampaign && bestCampaign.metrics.netCollectedRoas >= 3 ? `Consider reviewing budget capacity for ${bestCampaign.name}; it is above the 3.0x ROAS watch line.` : "Do not increase spend until attribution and show rates are reviewed.",
      "Treat recommendations as inference from CRM attribution and collected revenue, not an automatic budget change."
    ],
    trace
  };
}

export const getCampaignPerformance = getMarketingSummary;
export const getSourcePerformance = getMarketingSummary;
export const getMarketingFunnel = getMarketingSummary;
export const getCampaignLeadQuality = getMarketingSummary;
export const getROASComparison = getMarketingSummary;
