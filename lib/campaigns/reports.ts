import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentProfile } from "@/lib/auth/profile";
import { assertCampaignPermission } from "./permissions";
import { campaignPerformance, variantPerformance } from "./analytics";

type Relation<T> = T | T[] | null;
type CampaignRow = {
  id: string;
  name: string;
  campaign_type: string;
  status: string;
  channel: string;
  scheduled_at: string | null;
  recurrence_rule: string | null;
  segments: Relation<{ name: string | null }>;
  campaign_runs: Array<{
    id: string;
    status: string | null;
    recipients_total: number | null;
    recipients_eligible: number | null;
    sent: number | null;
    failed: number | null;
    replied: number | null;
    booked: number | null;
    sold: number | null;
    collected_revenue_cents: number | null;
  }> | null;
};
type RecipientRow = {
  id: string;
  campaign_id: string;
  campaign_run_id: string | null;
  contact_id: string;
  location_id: string | null;
  variant_id: string | null;
  status: string;
  eligibility_status: string;
  exclusion_reason: string | null;
  scheduled_send_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  failed_at: string | null;
  replied_at: string | null;
  booked_at: string | null;
  sold_at: string | null;
  revenue_cents: number | null;
  contacts: Relation<{ first_name: string | null; last_name: string | null; phone: string | null }>;
  locations: Relation<{ name: string | null }>;
  campaign_variants: Relation<{ name: string | null }>;
};
type SegmentRow = {
  id: string;
  name: string;
  description: string | null;
  segment_type: string;
  active: boolean;
  rules_json: Record<string, unknown>;
  segment_members: Array<{ contact_id: string }> | null;
};
type SuppressionRow = {
  id: string;
  name: string;
  suppression_type: string;
  active: boolean;
  suppression_list_members: Array<{ contact_id: string }> | null;
};

function first<T>(value: Relation<T> | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export async function getCampaignDashboard(supabase: SupabaseClient, profile: CurrentProfile) {
  assertCampaignPermission(profile, "campaigns.read");
  const [{ data: campaigns, error: campaignError }, { data: segments, error: segmentError }, { data: suppression, error: suppressionError }] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id, name, campaign_type, status, channel, scheduled_at, recurrence_rule, segments(name), campaign_runs(id, status, recipients_total, recipients_eligible, sent, failed, replied, booked, sold, collected_revenue_cents)")
      .eq("organization_id", profile.organizationId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("segments")
      .select("id, name, description, segment_type, active, rules_json, segment_members(contact_id)")
      .eq("organization_id", profile.organizationId)
      .order("name")
      .limit(200),
    supabase
      .from("suppression_lists")
      .select("id, name, suppression_type, active, suppression_list_members(contact_id)")
      .eq("organization_id", profile.organizationId)
      .order("name")
      .limit(200)
  ]);
  if (campaignError) throw new Error(campaignError.message);
  if (segmentError) throw new Error(segmentError.message);
  if (suppressionError) throw new Error(suppressionError.message);

  const campaignRows = (campaigns ?? []) as CampaignRow[];
  const totals = campaignRows.reduce((sum, campaign) => {
    for (const run of campaign.campaign_runs ?? []) {
      sum.recipients += Number(run.recipients_total ?? 0);
      sum.sent += Number(run.sent ?? 0);
      sum.replied += Number(run.replied ?? 0);
      sum.booked += Number(run.booked ?? 0);
      sum.sold += Number(run.sold ?? 0);
      sum.revenueCents += Number(run.collected_revenue_cents ?? 0);
    }
    return sum;
  }, { campaigns: campaignRows.length, recipients: 0, sent: 0, replied: 0, booked: 0, sold: 0, revenueCents: 0 });

  return {
    campaigns: campaignRows.map((campaign) => {
      const segment = first(campaign.segments);
      const latestRun = campaign.campaign_runs?.[0];
      return {
        ...campaign,
        segmentName: segment?.name ?? "No segment",
        recipients: Number(latestRun?.recipients_total ?? 0),
        sent: Number(latestRun?.sent ?? 0),
        replyRate: latestRun?.sent ? Number(latestRun.replied ?? 0) / Number(latestRun.sent) : 0,
        bookings: Number(latestRun?.booked ?? 0),
        sales: Number(latestRun?.sold ?? 0),
        revenueCents: Number(latestRun?.collected_revenue_cents ?? 0)
      };
    }),
    segments: (segments ?? []) as SegmentRow[],
    suppressionLists: (suppression ?? []) as SuppressionRow[],
    totals
  };
}

export async function getCampaignDetail(supabase: SupabaseClient, profile: CurrentProfile, campaignId: string) {
  assertCampaignPermission(profile, "campaigns.read");
  const [{ data: campaign, error: campaignError }, { data: recipients, error: recipientError }, { data: variants, error: variantError }, { data: jobs, error: jobsError }] = await Promise.all([
    supabase.from("campaigns").select("id, name, description, campaign_type, status, channel, message_classification, scheduled_at, recurrence_rule, metadata, segments(name), workflows(name), campaign_runs(*)").eq("organization_id", profile.organizationId).eq("id", campaignId).single(),
    supabase.from("campaign_recipients").select("id, campaign_id, campaign_run_id, contact_id, location_id, variant_id, status, eligibility_status, exclusion_reason, scheduled_send_at, sent_at, delivered_at, failed_at, replied_at, booked_at, sold_at, revenue_cents, contacts(first_name, last_name, phone), locations(name), campaign_variants(name)").eq("organization_id", profile.organizationId).eq("campaign_id", campaignId).order("created_at", { ascending: false }).limit(500),
    supabase.from("campaign_variants").select("id, name, message_body, weight_percent, active").eq("campaign_id", campaignId).order("name"),
    supabase.from("campaign_jobs").select("id, status, attempts, run_at, locked_at, completed_at, last_error, campaign_recipients!inner(campaign_id)").eq("campaign_recipients.campaign_id", campaignId).order("run_at", { ascending: false }).limit(200)
  ]);
  if (campaignError) throw new Error(campaignError.message);
  if (recipientError) throw new Error(recipientError.message);
  if (variantError) throw new Error(variantError.message);
  if (jobsError) throw new Error(jobsError.message);

  const recipientRows = (recipients ?? []) as RecipientRow[];
  const analyticsRows = recipientRows.map((recipient) => ({
    status: recipient.status,
    variantId: recipient.variant_id,
    revenueCents: Number(recipient.revenue_cents ?? 0),
    sentAt: recipient.sent_at,
    deliveredAt: recipient.delivered_at,
    repliedAt: recipient.replied_at,
    bookedAt: recipient.booked_at,
    soldAt: recipient.sold_at
  }));

  return {
    campaign,
    recipients: recipientRows.map((recipient) => {
      const contact = first(recipient.contacts);
      const location = first(recipient.locations);
      const variant = first(recipient.campaign_variants);
      return {
        ...recipient,
        contactName: `${contact?.first_name ?? ""} ${contact?.last_name ?? ""}`.trim() || "Contact",
        locationName: location?.name ?? "Unassigned",
        variantName: variant?.name ?? "Unassigned"
      };
    }),
    variants: variants ?? [],
    jobs: jobs ?? [],
    performance: campaignPerformance(analyticsRows),
    variantPerformance: variantPerformance(analyticsRows)
  };
}
