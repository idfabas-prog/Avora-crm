import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentProfile } from "@/lib/auth/profile";
import { formatMoney } from "@/lib/financial/money";
import { getReputationReport } from "@/lib/reputation/reports";
import type { AiTrace } from "./types";

export async function getReputationSummary(supabase: SupabaseClient, profile: CurrentProfile, locationIds: string[], question = "") {
  const report = await getReputationReport(supabase, { organizationId: profile.organizationId, locationIds });
  const bestLocation = [...report.locationRows].sort((a, b) => b.nps.score - a.nps.score || b.csat.average - a.csat.average)[0];
  const topReferrer = report.topReferrers[0];
  const bestReactivation = [...report.campaigns].sort((a, b) => Number(b.collected_revenue_cents ?? 0) - Number(a.collected_revenue_cents ?? 0))[0];
  const trace: AiTrace = {
    tools: [
      "getReputationSummary",
      "getNPSOverview",
      "getCSATOverview",
      "getNegativeFeedback",
      "getReferralPerformance",
      "getTopReferrers",
      "getReactivationPerformance",
      "getInactivePatientSummary"
    ],
    locations: locationIds,
    recordCounts: {
      review_requests: report.reviewRequests.length,
      feedback_responses: report.feedbackResponses.length,
      feedback_escalations: report.escalations.length,
      referrals: report.referrals.length,
      reactivation_campaigns: report.campaigns.length,
      loyalty_snapshots: report.loyaltyRows.length
    },
    filters: { question }
  };

  return {
    facts: [
      `NPS is ${report.summary.nps.score} from ${report.summary.nps.count} NPS responses.`,
      `CSAT average is ${report.summary.csat.average.toFixed(1)} from ${report.summary.csat.count} ratings.`,
      `${report.summary.openEscalations} negative-feedback cases are open.`,
      `Referral revenue is ${formatMoney(report.summary.referralRevenueCents)} with net contribution of ${formatMoney(report.summary.referralNetContributionCents)} after ledgered reward cost.`,
      `Reactivation revenue is ${formatMoney(report.summary.reactivationRevenueCents)}.`
    ],
    analysis: [
      bestLocation ? `${bestLocation.name} has the strongest satisfaction signal in the loaded location scope.` : "No location satisfaction comparison is available yet.",
      topReferrer ? `${topReferrer.contactName || topReferrer.code} is the leading referrer with ${topReferrer.sold} sold referral(s).` : "No referral codes have performance yet.",
      bestReactivation ? `${bestReactivation.name} is the strongest reactivation campaign by collected revenue.` : "No reactivation campaign performance is available yet.",
      "Reputation analysis is read-only; AI cannot post reviews, issue rewards, or bulk enroll campaigns."
    ],
    recommendations: [
      report.summary.openEscalations > 0 ? "Review open feedback escalations before increasing outbound review volume." : "Keep review request timing consistent and ethically neutral.",
      "Use referral reward ledger review before issuing any reward.",
      "Preview reactivation audiences and opt-outs before enrolling contacts into workflows."
    ],
    trace
  };
}

export const getNPSOverview = getReputationSummary;
export const getCSATOverview = getReputationSummary;
export const getNegativeFeedback = getReputationSummary;
export const getReferralPerformance = getReputationSummary;
export const getTopReferrers = getReputationSummary;
export const getReactivationPerformance = getReputationSummary;
export const getInactivePatientSummary = getReputationSummary;
