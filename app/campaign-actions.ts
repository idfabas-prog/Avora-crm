"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { assertCampaignPermission } from "@/lib/campaigns/permissions";
import { assignVariant, campaignSendIdempotencyKey, contactFatigueScore, evaluateCampaignEligibility, nextAllowedSendTime, validateVariantWeights } from "@/lib/campaigns/safety";
import type { CampaignSettings, CampaignVariant } from "@/lib/campaigns/types";
import { validateSegmentRules } from "@/lib/segments/evaluator";
import type { SegmentRuleGroup } from "@/lib/segments/types";
import { assertSegmentPermission } from "@/lib/segments/permissions";

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
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  return JSON.parse(raw) as T;
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

export async function saveSegment(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertSegmentPermission(profile, "segments.manage");
  const supabase = await createClient();
  const segmentId = optional(formData.get("segment_id"));
  const rules = parseJson<SegmentRuleGroup>(optional(formData.get("rules_json")), { logic: "and", conditions: [] });
  if (!validateSegmentRules(rules)) throw new Error("Segment rules include unsupported fields or operators");
  const payload = {
    organization_id: profile.organizationId,
    name: required(formData.get("name"), "Segment name"),
    description: optional(formData.get("description")),
    segment_type: required(formData.get("segment_type"), "Segment type"),
    rules_json: rules,
    location_scope: parseJson(optional(formData.get("location_scope")), { mode: "all_allowed", location_ids: [] }),
    active: formData.get("active") !== "off",
    created_by: profile.id
  };
  const query = segmentId
    ? supabase.from("segments").update(payload).eq("organization_id", profile.organizationId).eq("id", segmentId).select("id").single()
    : supabase.from("segments").insert(payload).select("id").single();
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  await audit(segmentId ? "Segment Changed" : "Segment Created", "segments", data.id, { segment_type: payload.segment_type });
  revalidatePath("/marketing/segments");
}

export async function saveSuppressionMember(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertCampaignPermission(profile, "suppression.manage");
  const supabase = await createClient();
  const suppressionListId = required(formData.get("suppression_list_id"), "Suppression list");
  const contactId = required(formData.get("contact_id"), "Contact");
  const reason = required(formData.get("reason"), "Reason");
  const { error } = await supabase.from("suppression_list_members").upsert({
    suppression_list_id: suppressionListId,
    contact_id: contactId,
    reason,
    added_by: profile.id
  });
  if (error) throw new Error(error.message);
  await audit("Suppression Added", "suppression_list_members", null, { suppression_list_id: suppressionListId, contact_id: contactId, reason });
  revalidatePath("/settings/campaigns");
  revalidatePath("/marketing/segments");
}

export async function saveLifecycleCampaign(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertCampaignPermission(profile, "campaigns.create");
  const supabase = await createClient();
  const campaignId = optional(formData.get("campaign_id"));
  const payload = {
    organization_id: profile.organizationId,
    name: required(formData.get("name"), "Campaign name"),
    description: optional(formData.get("description")),
    campaign_type: required(formData.get("campaign_type"), "Campaign type"),
    status: optional(formData.get("status")) ?? "draft",
    segment_id: optional(formData.get("segment_id")),
    workflow_id: optional(formData.get("workflow_id")),
    channel: required(formData.get("channel"), "Channel"),
    message_classification: required(formData.get("message_classification"), "Message classification"),
    scheduled_at: optional(formData.get("scheduled_at")),
    recurrence_rule: optional(formData.get("recurrence_rule")),
    location_scope: parseJson(optional(formData.get("location_scope")), { mode: "all_allowed", location_ids: [] }),
    created_by: profile.id,
    metadata: { manual: true, simulation: true }
  };
  const query = campaignId
    ? supabase.from("campaigns").update(payload).eq("organization_id", profile.organizationId).eq("id", campaignId).select("id").single()
    : supabase.from("campaigns").insert(payload).select("id").single();
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  await audit(campaignId ? "Campaign Changed" : "Campaign Created", "campaigns", data.id, { status: payload.status });
  revalidatePath("/marketing/campaigns");
}

export async function saveCampaignVariant(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertCampaignPermission(profile, "campaigns.edit");
  const supabase = await createClient();
  const variantId = optional(formData.get("variant_id"));
  const campaignId = required(formData.get("campaign_id"), "Campaign");
  const payload = {
    campaign_id: campaignId,
    name: required(formData.get("name"), "Variant name"),
    message_body: required(formData.get("message_body"), "Message body"),
    weight_percent: numberValue(formData.get("weight_percent"), 100),
    active: formData.get("active") !== "off"
  };
  const query = variantId
    ? supabase.from("campaign_variants").update(payload).eq("id", variantId).select("id").single()
    : supabase.from("campaign_variants").insert(payload).select("id").single();
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  await audit("Campaign Variant Changed", "campaign_variants", data.id, { campaign_id: campaignId });
  revalidatePath(`/marketing/campaigns/${campaignId}`);
}

export async function saveCampaignSettings(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertCampaignPermission(profile, "campaigns.settings.manage");
  const supabase = await createClient();
  const payload = {
    organization_id: profile.organizationId,
    max_sms_per_minute: numberValue(formData.get("max_sms_per_minute"), 25),
    max_sms_per_hour: numberValue(formData.get("max_sms_per_hour"), 250),
    daily_contact_frequency_cap: numberValue(formData.get("daily_contact_frequency_cap"), 2),
    weekly_contact_frequency_cap: numberValue(formData.get("weekly_contact_frequency_cap"), 5),
    quiet_hours_enabled: formData.get("quiet_hours_enabled") === "on",
    quiet_hours_start: required(formData.get("quiet_hours_start"), "Quiet hours start"),
    quiet_hours_end: required(formData.get("quiet_hours_end"), "Quiet hours end"),
    weekends_enabled: formData.get("weekends_enabled") === "on",
    booking_attribution_window_days: numberValue(formData.get("booking_attribution_window_days"), 7),
    sale_attribution_window_days: numberValue(formData.get("sale_attribution_window_days"), 30),
    approval_required: formData.get("approval_required") === "on",
    max_recipients_per_campaign: numberValue(formData.get("max_recipients_per_campaign"), 500),
    simulation_mode: true
  };
  const { error } = await supabase.from("campaign_settings").upsert(payload, { onConflict: "organization_id" });
  if (error) throw new Error(error.message);
  await audit("Frequency Settings Changed", "campaign_settings", null, { simulation_mode: true });
  revalidatePath("/settings/campaigns");
}

export async function updateCampaignStatus(formData: FormData) {
  const profile = await requireCurrentProfile();
  const action = required(formData.get("action"), "Action");
  const permission = action === "pause" ? "campaigns.pause" : action === "cancel" ? "campaigns.cancel" : "campaigns.edit";
  assertCampaignPermission(profile, permission);
  const supabase = await createClient();
  const campaignId = required(formData.get("campaign_id"), "Campaign");
  const status = action === "pause" ? "paused" : action === "cancel" ? "cancelled" : "draft";
  const { error } = await supabase.from("campaigns").update({ status }).eq("organization_id", profile.organizationId).eq("id", campaignId);
  if (error) throw new Error(error.message);
  if (status === "cancelled") {
    const { data: recipients } = await supabase.from("campaign_recipients").select("id").eq("organization_id", profile.organizationId).eq("campaign_id", campaignId);
    const recipientIds = (recipients ?? []).map((recipient) => recipient.id);
    if (recipientIds.length) {
      await supabase
        .from("campaign_jobs")
        .update({ status: "cancelled" })
        .eq("organization_id", profile.organizationId)
        .neq("status", "completed")
        .in("campaign_recipient_id", recipientIds);
    }
  }
  await audit(`Campaign ${status}`, "campaigns", campaignId);
  revalidatePath("/marketing/campaigns");
  revalidatePath(`/marketing/campaigns/${campaignId}`);
}

export async function launchSimulatedCampaign(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertCampaignPermission(profile, "campaigns.launch");
  const supabase = await createClient();
  const campaignId = required(formData.get("campaign_id"), "Campaign");
  const { data: campaign, error: campaignError } = await supabase.from("campaigns").select("id, organization_id, name, status, segment_id").eq("organization_id", profile.organizationId).eq("id", campaignId).single();
  if (campaignError || !campaign) throw new Error(campaignError?.message ?? "Campaign not found");
  const { data: variants, error: variantError } = await supabase.from("campaign_variants").select("id, name, weight_percent, active").eq("campaign_id", campaignId);
  if (variantError) throw new Error(variantError.message);
  const variantRows = (variants ?? []).map((variant) => ({ id: variant.id, name: variant.name, weightPercent: variant.weight_percent, active: variant.active })) satisfies CampaignVariant[];
  const variantValidation = validateVariantWeights(variantRows);
  if (!variantValidation.valid) throw new Error("Active campaign variant weights must total 100");
  const { data: settingsRow } = await supabase.from("campaign_settings").select("*").eq("organization_id", profile.organizationId).single();
  const settings: CampaignSettings = {
    maxSmsPerMinute: settingsRow?.max_sms_per_minute ?? 25,
    maxSmsPerHour: settingsRow?.max_sms_per_hour ?? 250,
    dailyContactFrequencyCap: settingsRow?.daily_contact_frequency_cap ?? 2,
    weeklyContactFrequencyCap: settingsRow?.weekly_contact_frequency_cap ?? 5,
    quietHoursEnabled: settingsRow?.quiet_hours_enabled ?? true,
    quietHoursStart: settingsRow?.quiet_hours_start ?? "20:00",
    quietHoursEnd: settingsRow?.quiet_hours_end ?? "09:00",
    weekendsEnabled: settingsRow?.weekends_enabled ?? true,
    bookingAttributionWindowDays: settingsRow?.booking_attribution_window_days ?? 7,
    saleAttributionWindowDays: settingsRow?.sale_attribution_window_days ?? 30,
    simulationMode: settingsRow?.simulation_mode ?? true
  };
  if (!settings.simulationMode) throw new Error("Phase 14 launch is development-safe only; simulation mode must remain enabled");
  const { count } = await supabase.from("campaign_runs").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId);
  const runNumber = (count ?? 0) + 1;
  const { data: run, error: runError } = await supabase.from("campaign_runs").insert({
    organization_id: profile.organizationId,
    campaign_id: campaignId,
    run_number: runNumber,
    status: "running",
    started_at: new Date().toISOString(),
    metadata: { simulation: true }
  }).select("id").single();
  if (runError) throw new Error(runError.message);

  const { data: contacts, error: contactsError } = await supabase.from("contacts").select("id, location_id, first_name, phone").eq("organization_id", profile.organizationId).in("location_id", profile.locations.map((location) => location.id)).limit(Math.min(settingsRow?.max_recipients_per_campaign ?? 500, 500));
  if (contactsError) throw new Error(contactsError.message);
  const contactIds = (contacts ?? []).map((contact) => contact.id);
  const [{ data: preferences }, { data: suppressed }, { data: recentRecipients }] = await Promise.all([
    supabase.from("contact_communication_preferences").select("contact_id, allowed, opted_out").eq("organization_id", profile.organizationId).eq("channel", "sms").in("contact_id", contactIds),
    supabase.from("suppression_list_members").select("contact_id, suppression_lists!inner(organization_id, active)").eq("suppression_lists.organization_id", profile.organizationId).eq("suppression_lists.active", true).in("contact_id", contactIds),
    supabase.from("campaign_recipients").select("contact_id, sent_at").eq("organization_id", profile.organizationId).gte("sent_at", new Date(Date.now() - 7 * 86400000).toISOString()).in("contact_id", contactIds)
  ]);
  const preferenceMap = new Map((preferences ?? []).map((preference) => [preference.contact_id, preference]));
  const suppressedSet = new Set((suppressed ?? []).map((item) => item.contact_id));
  const allowedLocationIds = profile.locations.map((location) => location.id);
  const recipientRows = [];
  const jobRows = [];
  for (const contact of contacts ?? []) {
    const variant = assignVariant(contact.id, variantRows);
    const pref = preferenceMap.get(contact.id);
    const recent = (recentRecipients ?? []).filter((recipient) => recipient.contact_id === contact.id);
    const today = new Date().toISOString().slice(0, 10);
    const outboundToday = recent.filter((recipient) => String(recipient.sent_at ?? "").startsWith(today)).length;
    const fatigue = contactFatigueScore({ outboundMarketing7d: recent.length, workflowMessages7d: 0, reviewRequests30d: 0, reactivationMessages30d: 0 });
    const eligibility = evaluateCampaignEligibility({
      contactId: contact.id,
      locationId: contact.location_id,
      phone: contact.phone,
      optedOut: Boolean(pref?.opted_out || pref?.allowed === false),
      suppressed: suppressedSet.has(contact.id),
      outboundToday,
      outboundThisWeek: recent.length,
      allowedLocationIds,
      campaignStatus: "running",
      fatigueScore: fatigue
    }, settings);
    const scheduledSendAt = eligibility.eligible ? nextAllowedSendTime(new Date(), settings).toISOString() : null;
    const idempotencyKey = campaignSendIdempotencyKey(run.id, contact.id, variant?.id ?? null);
    recipientRows.push({
      organization_id: profile.organizationId,
      campaign_id: campaignId,
      campaign_run_id: run.id,
      contact_id: contact.id,
      location_id: contact.location_id,
      variant_id: variant?.id ?? null,
      status: eligibility.eligible ? "scheduled" : "skipped",
      eligibility_status: eligibility.status,
      exclusion_reason: eligibility.reason ?? null,
      scheduled_send_at: scheduledSendAt,
      idempotency_key: idempotencyKey
    });
    if (eligibility.eligible && scheduledSendAt) {
      jobRows.push({
        organization_id: profile.organizationId,
        campaign_run_id: run.id,
        campaign_recipient_id: "",
        run_at: scheduledSendAt,
        status: "scheduled",
        idempotency_key: `job:${idempotencyKey}`
      });
    }
  }
  const { data: insertedRecipients, error: recipientError } = await supabase.from("campaign_recipients").upsert(recipientRows, { onConflict: "organization_id,idempotency_key" }).select("id, idempotency_key");
  if (recipientError) throw new Error(recipientError.message);
  const recipientIdByKey = new Map((insertedRecipients ?? []).map((recipient) => [recipient.idempotency_key, recipient.id]));
  const hydratedJobs = jobRows.map((job) => ({ ...job, campaign_recipient_id: recipientIdByKey.get(job.idempotency_key.replace("job:", "")) })).filter((job) => Boolean(job.campaign_recipient_id));
  if (hydratedJobs.length) {
    const { error: jobError } = await supabase.from("campaign_jobs").upsert(hydratedJobs, { onConflict: "organization_id,idempotency_key" });
    if (jobError) throw new Error(jobError.message);
  }
  await supabase.from("campaign_runs").update({
    recipients_total: recipientRows.length,
    recipients_eligible: recipientRows.filter((row) => row.eligibility_status === "eligible").length,
    recipients_skipped: recipientRows.filter((row) => row.status === "skipped").length
  }).eq("id", run.id);
  await supabase.from("campaigns").update({ status: "running", launched_at: new Date().toISOString() }).eq("id", campaignId);
  await audit("Campaign Launched", "campaigns", campaignId, { simulation: true, run_id: run.id });
  revalidatePath("/marketing/campaigns");
  revalidatePath(`/marketing/campaigns/${campaignId}`);
}
