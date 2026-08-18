import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateCsat, calculateNps, referralConversionRate, referralNetContribution, reactivationPriority, reviewResponseRate } from "./metrics";

type Relation<T> = T | T[] | null | undefined;
type LocationMetricRow = { id: string; name: string; requests: number; completed: number; feedback: number; npsScores: number[]; ratings: number[]; openEscalations: number };
type ProviderMetricRow = { id: string; name: string; feedback: number; npsScores: number[]; ratings: number[] };

function first<T>(value: Relation<T>) {
  return Array.isArray(value) ? value[0] : value;
}

function locationAllowed(locationId: string | null | undefined, locationIds: string[]) {
  return !locationIds.length || !locationId || locationIds.includes(locationId);
}

export async function getReputationReport(supabase: SupabaseClient, filters: { organizationId: string; locationIds: string[] }) {
  const [
    { data: reviewRequests },
    { data: feedbackResponses },
    { data: escalations },
    { data: externalReviews },
    { data: referralPrograms },
    { data: referralCodes },
    { data: referrals },
    { data: rewardEvents },
    { data: credits },
    { data: loyalty },
    { data: segments },
    { data: campaigns },
    { data: sources },
    { data: surveys }
  ] = await Promise.all([
    supabase.from("review_requests").select("id, location_id, contact_id, request_channel, status, sent_at, completed_at, clicked_at, eligibility_reason, contacts(first_name, last_name), locations(name), review_sources(name, provider)").eq("organization_id", filters.organizationId).order("created_at", { ascending: false }).limit(1000),
    supabase.from("feedback_responses").select("id, location_id, contact_id, provider_id, service_id, score, rating, nps_category, response_text, submitted_at, contacts(first_name, last_name), locations(name), provider:user_profiles!feedback_responses_provider_id_fkey(full_name), services(name)").eq("organization_id", filters.organizationId).order("submitted_at", { ascending: false }).limit(1000),
    supabase.from("feedback_escalations").select("id, location_id, contact_id, feedback_response_id, severity, status, notes, first_action_at, resolved_at, created_at, contacts(first_name, last_name), locations(name), assigned:user_profiles!feedback_escalations_assigned_user_id_fkey(full_name)").eq("organization_id", filters.organizationId).order("created_at", { ascending: false }).limit(1000),
    supabase.from("external_reviews").select("id, location_id, review_source_id, rating, review_text, review_date, author_display_name, response_text, responded_at, locations(name), review_sources(name, provider)").eq("organization_id", filters.organizationId).order("review_date", { ascending: false }).limit(1000),
    supabase.from("referral_programs").select("id, name, reward_type, reward_value, active").eq("organization_id", filters.organizationId).order("name"),
    supabase.from("referral_codes").select("id, code, active, contact_id, contacts(first_name, last_name)").eq("organization_id", filters.organizationId).order("created_at", { ascending: false }).limit(1000),
    supabase.from("referrals").select("id, location_id, referring_contact_id, referred_contact_id, referral_code_id, status, sale_id, converted_at, lead_created_at, locations(name), referring:contacts!referrals_referring_contact_id_fkey(first_name, last_name), referred:contacts!referrals_referred_contact_id_fkey(first_name, last_name), sales(paid_amount_cents, total_amount_cents)").eq("organization_id", filters.organizationId).order("lead_created_at", { ascending: false }).limit(1000),
    supabase.from("referral_reward_events").select("id, referring_contact_id, referral_id, event_type, reward_type, amount_cents, reward_value, reason, created_at, contacts(first_name, last_name)").eq("organization_id", filters.organizationId).order("created_at", { ascending: false }).limit(1000),
    supabase.from("patient_credit_events").select("id, contact_id, event_type, amount_cents, reason, created_at, contacts(first_name, last_name)").eq("organization_id", filters.organizationId).order("created_at", { ascending: false }).limit(1000),
    supabase.from("patient_loyalty_snapshots").select("id, contact_id, location_id, total_visits, completed_treatments, lifetime_collected_revenue_cents, months_since_last_visit, referral_count, membership_status, package_utilization_percent, loyalty_status, contacts(first_name, last_name), locations(name)").eq("organization_id", filters.organizationId).order("lifetime_collected_revenue_cents", { ascending: false }).limit(1000),
    supabase.from("reactivation_segments").select("id, name, description, rules_json, active").eq("organization_id", filters.organizationId).order("name"),
    supabase.from("reactivation_campaigns").select("id, segment_id, name, status, contacts_targeted, contacts_reactivated, bookings_generated, sales_generated, collected_revenue_cents, reactivation_segments(name)").eq("organization_id", filters.organizationId).order("created_at", { ascending: false }).limit(1000),
    supabase.from("review_sources").select("id, name, provider, review_url, active").eq("organization_id", filters.organizationId).order("name"),
    supabase.from("feedback_surveys").select("id, name, survey_type, active").eq("organization_id", filters.organizationId).order("name")
  ]);

  const scopedRequests = (reviewRequests ?? []).filter((row) => locationAllowed(row.location_id, filters.locationIds));
  const scopedFeedback = (feedbackResponses ?? []).filter((row) => locationAllowed(row.location_id, filters.locationIds));
  const scopedEscalations = (escalations ?? []).filter((row) => locationAllowed(row.location_id, filters.locationIds));
  const scopedExternalReviews = (externalReviews ?? []).filter((row) => locationAllowed(row.location_id, filters.locationIds));
  const scopedReferrals = (referrals ?? []).filter((row) => locationAllowed(row.location_id, filters.locationIds));
  const scopedLoyalty = (loyalty ?? []).filter((row) => locationAllowed(row.location_id, filters.locationIds));
  const nps = calculateNps(scopedFeedback.map((row) => row.score).filter((score): score is number => score != null));
  const csat = calculateCsat(scopedFeedback.map((row) => row.rating).filter((rating): rating is number => rating != null));
  const sentRequests = scopedRequests.filter((row) => ["sent", "opened", "clicked", "completed"].includes(row.status)).length;
  const completedRequests = scopedRequests.filter((row) => row.status === "completed").length;
  const referralRevenueCents = scopedReferrals.reduce((sum, row) => sum + Number(first(row.sales)?.paid_amount_cents ?? 0), 0);
  const referralRewardCostCents = (rewardEvents ?? []).filter((row) => ["issued", "earned"].includes(row.event_type)).reduce((sum, row) => sum + Number(row.amount_cents ?? 0), 0);

  const locationRows = new Map<string, LocationMetricRow>();
  for (const row of [...scopedRequests, ...scopedFeedback, ...scopedEscalations]) {
    const location = first(row.locations);
    if (!row.location_id) continue;
    const current: LocationMetricRow = locationRows.get(row.location_id) ?? { id: row.location_id, name: location?.name ?? "Unknown", requests: 0, completed: 0, feedback: 0, npsScores: [], ratings: [], openEscalations: 0 };
    locationRows.set(row.location_id, current);
  }
  for (const row of scopedRequests) {
    const current = locationRows.get(row.location_id);
    if (current) {
      if (["sent", "opened", "clicked", "completed"].includes(row.status)) current.requests += 1;
      if (row.status === "completed") current.completed += 1;
    }
  }
  for (const row of scopedFeedback) {
    const current = locationRows.get(row.location_id);
    if (current) {
      current.feedback += 1;
      if (row.score != null) current.npsScores.push(row.score);
      if (row.rating != null) current.ratings.push(row.rating);
    }
  }
  for (const row of scopedEscalations) {
    const current = locationRows.get(row.location_id);
    if (current && row.status !== "resolved" && row.status !== "dismissed") current.openEscalations += 1;
  }

  const providerRows = new Map<string, ProviderMetricRow>();
  for (const row of scopedFeedback) {
    const provider = first(row.provider);
    const id = row.provider_id ?? "unassigned";
    const current: ProviderMetricRow = providerRows.get(id) ?? { id, name: provider?.full_name ?? "Unassigned", feedback: 0, npsScores: [], ratings: [] };
    current.feedback += 1;
    if (row.score != null) current.npsScores.push(row.score);
    if (row.rating != null) current.ratings.push(row.rating);
    providerRows.set(id, current);
  }

  return {
    summary: {
      sentRequests,
      completedRequests,
      responseRate: reviewResponseRate(sentRequests, completedRequests),
      feedbackResponses: scopedFeedback.length,
      nps,
      csat,
      openEscalations: scopedEscalations.filter((row) => row.status !== "resolved" && row.status !== "dismissed").length,
      referralLeads: scopedReferrals.length,
      referralSales: scopedReferrals.filter((row) => ["sold", "reward_pending", "reward_issued"].includes(row.status)).length,
      referralRevenueCents,
      referralRewardCostCents,
      referralNetContributionCents: referralNetContribution(referralRevenueCents, referralRewardCostCents),
      referralConversionRate: referralConversionRate(scopedReferrals),
      reactivationRevenueCents: (campaigns ?? []).reduce((sum, row) => sum + Number(row.collected_revenue_cents ?? 0), 0)
    },
    locationRows: Array.from(locationRows.values()).map((row) => ({ ...row, responseRate: reviewResponseRate(row.requests, row.completed), nps: calculateNps(row.npsScores), csat: calculateCsat(row.ratings) })),
    providerRows: Array.from(providerRows.values()).map((row) => ({ ...row, nps: calculateNps(row.npsScores), csat: calculateCsat(row.ratings) })),
    topReferrers: (referralCodes ?? []).map((code) => {
      const contact = first(code.contacts);
      const related = scopedReferrals.filter((referral) => referral.referral_code_id === code.id);
      return { ...code, contactName: `${contact?.first_name ?? ""} ${contact?.last_name ?? ""}`.trim(), referrals: related.length, sold: related.filter((referral) => ["sold", "reward_pending", "reward_issued"].includes(referral.status)).length };
    }).sort((a, b) => b.sold - a.sold || b.referrals - a.referrals),
    loyaltyRows: scopedLoyalty.map((row) => ({ ...row, contactName: `${first(row.contacts)?.first_name ?? ""} ${first(row.contacts)?.last_name ?? ""}`.trim(), locationName: first(row.locations)?.name ?? "Org-wide", priority: reactivationPriority({ lifetimeRevenueCents: row.lifetime_collected_revenue_cents ?? 0, monthsSinceLastVisit: row.months_since_last_visit, packageUtilizationPercent: row.package_utilization_percent, referralCount: row.referral_count }) })),
    reviewRequests: scopedRequests,
    feedbackResponses: scopedFeedback,
    escalations: scopedEscalations,
    externalReviews: scopedExternalReviews,
    referralPrograms: referralPrograms ?? [],
    referralCodes: referralCodes ?? [],
    referrals: scopedReferrals,
    rewardEvents: rewardEvents ?? [],
    credits: credits ?? [],
    segments: segments ?? [],
    campaigns: campaigns ?? [],
    sources: sources ?? [],
    surveys: surveys ?? []
  };
}
