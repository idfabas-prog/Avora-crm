"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { assertReputationPermission, reputationLocationAllowed } from "@/lib/reputation/permissions";
import { createClient } from "@/lib/supabase/server";
import { emitDomainEvent } from "@/lib/workflows/server-events";

function required(value: FormDataEntryValue | null, label: string) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function optional(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

function numberValue(value: FormDataEntryValue | null, fallback = 0) {
  const number = Number(String(value ?? "").trim());
  return Number.isFinite(number) ? number : fallback;
}

function checked(value: FormDataEntryValue | null) {
  return String(value ?? "") === "on";
}

function assertLocation(profile: Awaited<ReturnType<typeof requireCurrentProfile>>, locationId: string | null) {
  if (!reputationLocationAllowed(profile, locationId)) throw new Error("Selected location is not available for this user");
}

async function audit(action: string, entityTable: string, entityId: string | null, metadata: Record<string, unknown> = {}) {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  await supabase.from("audit_logs").insert({
    organization_id: profile.organizationId,
    actor_id: profile.id,
    action,
    entity_table: entityTable,
    entity_id: entityId,
    metadata
  });
}

export async function saveReviewSource(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertReputationPermission(profile, "reputation.manage");
  const supabase = await createClient();
  const sourceId = optional(formData.get("review_source_id"));
  const payload = {
    organization_id: profile.organizationId,
    name: required(formData.get("name"), "Source name"),
    provider: required(formData.get("provider"), "Provider"),
    external_location_id: optional(formData.get("external_location_id")),
    review_url: optional(formData.get("review_url")),
    active: checked(formData.get("active"))
  };
  const query = sourceId
    ? supabase.from("review_sources").update(payload).eq("id", sourceId).eq("organization_id", profile.organizationId).select("id").single()
    : supabase.from("review_sources").insert(payload).select("id").single();
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  await audit(sourceId ? "Review Source Updated" : "Review Source Created", "review_sources", data.id);
  revalidatePath("/settings/reputation/sources");
  revalidatePath("/reputation");
}

export async function mapReviewSourceToLocation(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertReputationPermission(profile, "reputation.manage");
  const locationId = required(formData.get("location_id"), "Location");
  assertLocation(profile, locationId);
  const supabase = await createClient();
  const { error } = await supabase.from("location_review_sources").upsert({
    organization_id: profile.organizationId,
    location_id: locationId,
    review_source_id: required(formData.get("review_source_id"), "Review source"),
    is_default: checked(formData.get("is_default")),
    active: checked(formData.get("active"))
  }, { onConflict: "location_id,review_source_id" });
  if (error) throw new Error(error.message);
  await audit("Review Source Mapped", "location_review_sources", null, { location_id: locationId });
  revalidatePath("/settings/reputation/sources");
}

export async function saveReviewTemplate(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertReputationPermission(profile, "reputation.manage");
  const body = required(formData.get("body"), "Template body");
  if (/(5[ -]?star|positive review|if you had a good)/i.test(body)) throw new Error("Review templates must request honest feedback without review gating");
  const supabase = await createClient();
  const templateId = optional(formData.get("template_id"));
  const payload = {
    organization_id: profile.organizationId,
    name: required(formData.get("name"), "Template name"),
    channel: required(formData.get("channel"), "Channel"),
    body,
    active: checked(formData.get("active")),
    metadata: { manual: true, no_review_gating: true }
  };
  const query = templateId
    ? supabase.from("review_request_templates").update(payload).eq("id", templateId).eq("organization_id", profile.organizationId).select("id").single()
    : supabase.from("review_request_templates").insert(payload).select("id").single();
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  await audit(templateId ? "Review Template Updated" : "Review Template Created", "review_request_templates", data.id);
  revalidatePath("/settings/reputation");
}

export async function createReviewRequestAction(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertReputationPermission(profile, "reputation.manage");
  const locationId = required(formData.get("location_id"), "Location");
  assertLocation(profile, locationId);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_review_request", {
    target_contact_id: required(formData.get("contact_id"), "Contact"),
    target_location_id: locationId,
    target_channel: required(formData.get("request_channel"), "Channel"),
    target_review_source_id: optional(formData.get("review_source_id")),
    target_appointment_id: optional(formData.get("appointment_id")),
    target_treatment_session_id: optional(formData.get("treatment_session_id")),
    target_sale_id: optional(formData.get("sale_id"))
  });
  if (error) throw new Error(error.message);
  await audit("Review Request Created", "review_requests", data, { location_id: locationId });
  await emitDomainEvent({ organizationId: profile.organizationId, eventType: "reputation.review_request_eligible", entityType: "review_request", entityId: data, locationId, payload: { channel: formData.get("request_channel") } });
  revalidatePath("/reputation");
  revalidatePath("/reputation/reviews");
}

export async function markReviewRequestSent(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertReputationPermission(profile, "reputation.manage");
  const supabase = await createClient();
  const id = required(formData.get("review_request_id"), "Review request");
  const { data, error } = await supabase.from("review_requests").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", id).eq("organization_id", profile.organizationId).select("id, location_id").single();
  if (error) throw new Error(error.message);
  assertLocation(profile, data.location_id);
  await audit("Review Request Sent", "review_requests", id);
  await emitDomainEvent({ organizationId: profile.organizationId, eventType: "reputation.review_request_sent", entityType: "review_request", entityId: id, locationId: data.location_id, payload: {} });
  revalidatePath("/reputation/reviews");
}

export async function submitFeedbackResponse(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertReputationPermission(profile, "reputation.feedback.manage");
  const locationId = required(formData.get("location_id"), "Location");
  assertLocation(profile, locationId);
  const supabase = await createClient();
  const { data, error } = await supabase.from("feedback_responses").insert({
    organization_id: profile.organizationId,
    location_id: locationId,
    contact_id: required(formData.get("contact_id"), "Contact"),
    survey_id: required(formData.get("survey_id"), "Survey"),
    review_request_id: optional(formData.get("review_request_id")),
    treatment_session_id: optional(formData.get("treatment_session_id")),
    provider_id: optional(formData.get("provider_id")),
    service_id: optional(formData.get("service_id")),
    score: optional(formData.get("score")) ? numberValue(formData.get("score")) : null,
    rating: optional(formData.get("rating")) ? numberValue(formData.get("rating")) : null,
    response_text: optional(formData.get("response_text")),
    metadata: { manual: true }
  }).select("id, score, rating").single();
  if (error) throw new Error(error.message);
  const { data: escalationId } = await supabase.rpc("create_feedback_escalation", { target_feedback_response_id: data.id });
  await audit("Feedback Submitted", "feedback_responses", data.id, { escalation_id: escalationId });
  await emitDomainEvent({ organizationId: profile.organizationId, eventType: "reputation.review_completed", entityType: "feedback_response", entityId: data.id, locationId, payload: {} });
  if (escalationId) {
    await audit("Escalation Created", "feedback_escalations", escalationId);
    await emitDomainEvent({ organizationId: profile.organizationId, eventType: "reputation.feedback_negative", entityType: "feedback_response", entityId: data.id, locationId, payload: { escalation_id: escalationId } });
  }
  revalidatePath("/reputation");
  revalidatePath("/reputation/feedback");
}

export async function resolveFeedbackEscalation(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertReputationPermission(profile, "reputation.feedback.manage");
  const supabase = await createClient();
  const id = required(formData.get("feedback_escalation_id"), "Escalation");
  const status = required(formData.get("status"), "Status");
  const { data, error } = await supabase.from("feedback_escalations").update({
    status,
    notes: optional(formData.get("notes")),
    first_action_at: new Date().toISOString(),
    resolved_at: status === "resolved" ? new Date().toISOString() : null
  }).eq("id", id).eq("organization_id", profile.organizationId).select("id, location_id").single();
  if (error) throw new Error(error.message);
  assertLocation(profile, data.location_id);
  await audit("Escalation Resolved", "feedback_escalations", id, { status });
  if (status === "resolved") await emitDomainEvent({ organizationId: profile.organizationId, eventType: "reputation.feedback_resolved", entityType: "feedback_escalation", entityId: id, locationId: data.location_id, payload: {} });
  revalidatePath("/reputation/feedback");
}

export async function saveReferralProgram(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertReputationPermission(profile, "referrals.manage");
  const supabase = await createClient();
  const programId = optional(formData.get("referral_program_id"));
  const payload = {
    organization_id: profile.organizationId,
    name: required(formData.get("name"), "Program name"),
    description: optional(formData.get("description")),
    reward_type: required(formData.get("reward_type"), "Reward type"),
    reward_value: numberValue(formData.get("reward_value")),
    active: checked(formData.get("active")),
    start_date: optional(formData.get("start_date")),
    end_date: optional(formData.get("end_date"))
  };
  const query = programId
    ? supabase.from("referral_programs").update(payload).eq("id", programId).eq("organization_id", profile.organizationId).select("id").single()
    : supabase.from("referral_programs").insert(payload).select("id").single();
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  await audit("Referral Program Saved", "referral_programs", data.id);
  revalidatePath("/settings/referrals");
  revalidatePath("/reputation/referrals");
}

export async function generateReferralCode(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertReputationPermission(profile, "referrals.manage");
  const supabase = await createClient();
  const contactId = required(formData.get("contact_id"), "Contact");
  const code = required(formData.get("code"), "Code").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const { data, error } = await supabase.from("referral_codes").upsert({
    organization_id: profile.organizationId,
    contact_id: contactId,
    referral_program_id: optional(formData.get("referral_program_id")),
    code,
    active: true
  }, { onConflict: "organization_id,code" }).select("id").single();
  if (error) throw new Error(error.message);
  await audit("Referral Code Generated", "referral_codes", data.id, { contact_id: contactId });
  revalidatePath("/reputation/referrals");
}

export async function createReferral(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertReputationPermission(profile, "referrals.manage");
  const locationId = optional(formData.get("location_id"));
  assertLocation(profile, locationId);
  const supabase = await createClient();
  const { data, error } = await supabase.from("referrals").insert({
    organization_id: profile.organizationId,
    location_id: locationId,
    referring_contact_id: required(formData.get("referring_contact_id"), "Referring contact"),
    referred_contact_id: optional(formData.get("referred_contact_id")),
    referral_code_id: optional(formData.get("referral_code_id")),
    status: required(formData.get("status"), "Status"),
    metadata: { manual: true }
  }).select("id").single();
  if (error) throw new Error(error.message);
  await audit("Referral Created", "referrals", data.id, { location_id: locationId });
  await emitDomainEvent({ organizationId: profile.organizationId, eventType: "referral.created", entityType: "referral", entityId: data.id, locationId, payload: {} });
  revalidatePath("/reputation/referrals");
}

export async function updateReferralStatus(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertReputationPermission(profile, "referrals.manage");
  const supabase = await createClient();
  const id = required(formData.get("referral_id"), "Referral");
  const status = required(formData.get("status"), "Status");
  const { data, error } = await supabase.from("referrals").update({
    status,
    sale_id: optional(formData.get("sale_id")),
    converted_at: ["sold", "reward_pending", "reward_issued"].includes(status) ? new Date().toISOString() : null
  }).eq("id", id).eq("organization_id", profile.organizationId).select("id, location_id").single();
  if (error) throw new Error(error.message);
  assertLocation(profile, data.location_id);
  await audit("Referral Converted", "referrals", id, { status });
  const eventType = status === "booked" ? "referral.booked" : status === "sold" ? "referral.sold" : status === "reward_pending" ? "referral.reward_earned" : null;
  if (eventType) await emitDomainEvent({ organizationId: profile.organizationId, eventType, entityType: "referral", entityId: id, locationId: data.location_id, payload: { status } });
  revalidatePath("/reputation/referrals");
}

export async function issueReferralRewardAction(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertReputationPermission(profile, "referrals.rewards.manage");
  const supabase = await createClient();
  const referralId = required(formData.get("referral_id"), "Referral");
  const { data, error } = await supabase.rpc("issue_referral_reward", {
    target_referral_id: referralId,
    idempotency_key: optional(formData.get("reason")) ?? `reward-${referralId}`
  });
  if (error) throw new Error(error.message);
  await audit("Reward Issued", "referral_reward_events", data, { referral_id: referralId });
  await emitDomainEvent({ organizationId: profile.organizationId, eventType: "referral.reward_issued", entityType: "referral", entityId: referralId, payload: { reward_event_id: data } });
  revalidatePath("/reputation/referrals");
  revalidatePath("/portal/referrals");
}

export async function saveReactivationSegment(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertReputationPermission(profile, "reactivation.manage");
  const supabase = await createClient();
  const segmentId = optional(formData.get("reactivation_segment_id"));
  const payload = {
    organization_id: profile.organizationId,
    name: required(formData.get("name"), "Segment name"),
    description: optional(formData.get("description")),
    rules_json: { rule: required(formData.get("rule"), "Rule"), demo_safe: true },
    active: checked(formData.get("active"))
  };
  const query = segmentId
    ? supabase.from("reactivation_segments").update(payload).eq("id", segmentId).eq("organization_id", profile.organizationId).select("id").single()
    : supabase.from("reactivation_segments").insert(payload).select("id").single();
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  await audit("Reactivation Segment Saved", "reactivation_segments", data.id);
  revalidatePath("/reputation/reactivation");
}

export async function saveReactivationCampaign(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertReputationPermission(profile, "reactivation.manage");
  const supabase = await createClient();
  const campaignId = optional(formData.get("reactivation_campaign_id"));
  const payload = {
    organization_id: profile.organizationId,
    segment_id: optional(formData.get("segment_id")),
    workflow_id: optional(formData.get("workflow_id")),
    name: required(formData.get("name"), "Campaign name"),
    status: required(formData.get("status"), "Status"),
    contacts_targeted: numberValue(formData.get("contacts_targeted")),
    contacts_reactivated: numberValue(formData.get("contacts_reactivated")),
    bookings_generated: numberValue(formData.get("bookings_generated")),
    sales_generated: numberValue(formData.get("sales_generated")),
    collected_revenue_cents: numberValue(formData.get("collected_revenue_cents"))
  };
  const query = campaignId
    ? supabase.from("reactivation_campaigns").update(payload).eq("id", campaignId).eq("organization_id", profile.organizationId).select("id").single()
    : supabase.from("reactivation_campaigns").insert(payload).select("id").single();
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  await audit("Reactivation Campaign Saved", "reactivation_campaigns", data.id, { status: payload.status });
  if (payload.status === "active") await emitDomainEvent({ organizationId: profile.organizationId, eventType: "reactivation.enrolled", entityType: "reactivation_campaign", entityId: data.id, payload: { contacts_targeted: payload.contacts_targeted } });
  if (payload.status === "completed") await emitDomainEvent({ organizationId: profile.organizationId, eventType: "reactivation.completed", entityType: "reactivation_campaign", entityId: data.id, payload: {} });
  revalidatePath("/reputation/reactivation");
}
