import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentProfile } from "@/lib/auth/profile";
import { campaignInsight, campaignPerformance, variantPerformance } from "@/lib/campaigns/analytics";
import { formatMoney } from "@/lib/financial/money";
import type { AiTrace } from "./types";

export async function getCampaignIntelligenceSummary(supabase: SupabaseClient, profile: CurrentProfile, locationIds: string[], question: string) {
  const [{ data: campaigns }, { data: recipients }, { data: segments }, { data: suppression }, { data: jobs }] = await Promise.all([
    supabase.from("campaigns").select("id, name, status, campaign_type, channel").eq("organization_id", profile.organizationId).order("created_at", { ascending: false }).limit(100),
    supabase.from("campaign_recipients").select("id, campaign_id, location_id, status, eligibility_status, exclusion_reason, variant_id, revenue_cents, sent_at, delivered_at, replied_at, booked_at, sold_at").eq("organization_id", profile.organizationId).in("location_id", locationIds).order("created_at", { ascending: false }).limit(1000),
    supabase.from("segments").select("id, name, segment_type, active, segment_members(contact_id)").eq("organization_id", profile.organizationId).order("name").limit(100),
    supabase.from("suppression_lists").select("id, name, active, suppression_list_members(contact_id)").eq("organization_id", profile.organizationId).order("name").limit(100),
    supabase.from("campaign_jobs").select("id, status, attempts, last_error").eq("organization_id", profile.organizationId).order("created_at", { ascending: false }).limit(500)
  ]);

  const recipientRows = (recipients ?? []).map((recipient) => ({
    status: recipient.status,
    variantId: recipient.variant_id,
    revenueCents: Number(recipient.revenue_cents ?? 0),
    sentAt: recipient.sent_at,
    deliveredAt: recipient.delivered_at,
    repliedAt: recipient.replied_at,
    bookedAt: recipient.booked_at,
    soldAt: recipient.sold_at
  }));
  const performance = campaignPerformance(recipientRows);
  const variants = variantPerformance(recipientRows);
  const skipped = (recipients ?? []).filter((recipient) => recipient.status === "skipped").length;
  const suppressed = (recipients ?? []).filter((recipient) => recipient.eligibility_status === "suppressed").length;
  const frequencyCapped = (recipients ?? []).filter((recipient) => recipient.eligibility_status === "frequency_capped").length;
  const failedJobs = (jobs ?? []).filter((job) => job.status === "failed").length;
  const strongestVariant = variants.sort((a, b) => b.replied - a.replied || b.booked - a.booked)[0];
  const trace: AiTrace = {
    tools: [
      "getSegmentSummary",
      "getCampaignPerformance",
      "getCampaignRunPerformance",
      "getVariantPerformance",
      "getCampaignRevenue",
      "getCampaignFailures",
      "getContactFatigueSummary",
      "getSuppressionSummary"
    ],
    locations: locationIds,
    recordCounts: {
      lifecycle_campaigns: campaigns?.length ?? 0,
      campaign_recipients: recipients?.length ?? 0,
      segments: segments?.length ?? 0,
      suppression_lists: suppression?.length ?? 0,
      campaign_jobs: jobs?.length ?? 0
    },
    filters: { question }
  };

  return {
    facts: [
      `${campaigns?.length ?? 0} lifecycle campaigns are visible in this organization scope.`,
      `${segments?.length ?? 0} segments and ${suppression?.length ?? 0} suppression lists are configured.`,
      `${performance.recipients} recipient snapshots exist in the selected location scope.`,
      `${performance.sent} simulated sends generated ${performance.replied} replies, ${performance.booked} bookings, and ${performance.sold} sales.`,
      `Attributed campaign revenue is ${formatMoney(performance.revenueCents)}.`
    ],
    analysis: [
      campaignInsight({ ...performance, failedRate: performance.sent ? performance.failed / performance.sent : 0, unsubscribeRate: 0 }),
      `${skipped} recipients were skipped; ${suppressed} were suppressed and ${frequencyCapped} were frequency capped.`,
      failedJobs ? `${failedJobs} campaign jobs currently show failed status and should be reviewed before retry.` : "No failed campaign jobs were found in the sampled job queue.",
      strongestVariant ? `Variant ${strongestVariant.variantId} has the strongest sampled response by replies/bookings, but confidence is ${strongestVariant.confidence}.` : "Variant performance is not yet available."
    ],
    recommendations: [
      "Keep campaigns in draft until segment preview, suppression lists, quiet hours, and frequency caps are reviewed.",
      "Use A/B results as directional until the sample size is large enough for confident decisions.",
      "Do not bypass opt-outs, suppression lists, or location access when creating campaign audiences."
    ],
    trace
  };
}

export const getSegmentSummary = getCampaignIntelligenceSummary;
export const getCampaignRunPerformance = getCampaignIntelligenceSummary;
export const getVariantPerformance = getCampaignIntelligenceSummary;
export const getCampaignRevenue = getCampaignIntelligenceSummary;
export const getCampaignFailures = getCampaignIntelligenceSummary;
export const getContactFatigueSummary = getCampaignIntelligenceSummary;
export const getSuppressionSummary = getCampaignIntelligenceSummary;
