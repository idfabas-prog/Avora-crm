"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { dollarsToCents } from "@/lib/financial/money";
import { normalizeSourceAlias, parseUtmCapture } from "@/lib/marketing/attribution";
import { assertMarketingPermission } from "@/lib/marketing/permissions";
import { createClient } from "@/lib/supabase/server";

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

function allowedLocation(locationId: string | null, allowedIds: string[]) {
  if (!locationId) return null;
  if (!allowedIds.includes(locationId)) throw new Error("Selected location is not available for this user");
  return locationId;
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

export async function saveMarketingSource(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertMarketingPermission(profile, "marketing.manage");
  const supabase = await createClient();
  const sourceId = optional(formData.get("source_id"));
  const payload = {
    organization_id: profile.organizationId,
    name: required(formData.get("name"), "Source name"),
    channel: required(formData.get("channel"), "Channel"),
    provider: required(formData.get("provider"), "Provider"),
    active: formData.get("active") === "on",
    metadata: { manual: true }
  };
  const query = sourceId
    ? supabase.from("marketing_sources").update(payload).eq("id", sourceId).eq("organization_id", profile.organizationId).select("id").single()
    : supabase.from("marketing_sources").insert(payload).select("id").single();
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const aliases = String(formData.get("aliases") ?? "").split(",").map((alias) => alias.trim()).filter(Boolean);
  for (const alias of aliases) {
    await supabase.from("marketing_source_aliases").upsert({
      organization_id: profile.organizationId,
      source_id: data.id,
      alias,
      normalized_alias: normalizeSourceAlias(alias)
    }, { onConflict: "organization_id,normalized_alias" });
  }
  await audit(sourceId ? "Marketing Source Updated" : "Marketing Source Created", "marketing_sources", data.id);
  revalidatePath("/settings/marketing/sources");
  revalidatePath("/marketing");
}

export async function saveMarketingCampaign(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertMarketingPermission(profile, "marketing.manage");
  const supabase = await createClient();
  const campaignId = optional(formData.get("campaign_id"));
  const locationId = allowedLocation(optional(formData.get("location_id")), profile.locations.map((location) => location.id));
  const payload = {
    organization_id: profile.organizationId,
    location_id: locationId,
    source_id: required(formData.get("source_id"), "Source"),
    provider: optional(formData.get("provider")) ?? "manual",
    external_campaign_id: optional(formData.get("external_campaign_id")),
    name: required(formData.get("name"), "Campaign name"),
    service_category: optional(formData.get("service_category")),
    objective: optional(formData.get("objective")),
    status: required(formData.get("status"), "Status"),
    start_date: required(formData.get("start_date"), "Start date"),
    end_date: optional(formData.get("end_date")),
    budget_cents: dollarsToCents(optional(formData.get("budget"))),
    active: formData.get("active") === "on",
    metadata: { manual: true }
  };
  const query = campaignId
    ? supabase.from("marketing_campaigns").update(payload).eq("id", campaignId).eq("organization_id", profile.organizationId).select("id").single()
    : supabase.from("marketing_campaigns").insert(payload).select("id").single();
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  if (locationId) {
    await supabase.from("marketing_campaign_locations").upsert({ campaign_id: data.id, location_id: locationId });
  }
  await audit(campaignId ? "Campaign Updated" : "Campaign Created", "marketing_campaigns", data.id, { location_id: locationId });
  revalidatePath("/settings/marketing/campaigns");
  revalidatePath("/marketing");
}

export async function addMarketingSpend(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertMarketingPermission(profile, "marketing.spend.write");
  const supabase = await createClient();
  const locationId = allowedLocation(optional(formData.get("location_id")), profile.locations.map((location) => location.id));
  const campaignId = optional(formData.get("campaign_id"));
  const payload = {
    organization_id: profile.organizationId,
    location_id: locationId,
    source_id: required(formData.get("source_id"), "Source"),
    campaign_id: campaignId,
    ad_group_id: optional(formData.get("ad_group_id")),
    ad_id: optional(formData.get("ad_id")),
    spend_date: required(formData.get("spend_date"), "Spend date"),
    spend_cents: dollarsToCents(required(formData.get("spend"), "Spend")),
    impressions: numberValue(formData.get("impressions")),
    clicks: numberValue(formData.get("clicks")),
    leads: numberValue(formData.get("leads")),
    imported: false,
    provider: optional(formData.get("provider")) ?? "manual",
    metadata: { manual: true }
  };
  const { data, error } = await supabase.from("marketing_spend").insert(payload).select("id").single();
  if (error) throw new Error(error.message);
  await audit("Spend Added", "marketing_spend", data.id, { campaign_id: campaignId });
  revalidatePath("/marketing");
  revalidatePath("/settings/marketing/campaigns");
}

export async function addContactAttribution(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertMarketingPermission(profile, "marketing.attribution.manage");
  const supabase = await createClient();
  const contactId = required(formData.get("contact_id"), "Contact");
  const { data: contact } = await supabase.from("contacts").select("id, organization_id, location_id").eq("id", contactId).eq("organization_id", profile.organizationId).single();
  if (!contact) throw new Error("Contact not found");
  allowedLocation(contact.location_id, profile.locations.map((location) => location.id));
  const capture = parseUtmCapture({ url: optional(formData.get("landing_page")), referrer: optional(formData.get("referrer")) });
  const isPrimary = formData.get("is_primary") === "on";
  if (isPrimary) {
    await supabase.from("contact_attributions").update({ is_primary: false }).eq("organization_id", profile.organizationId).eq("contact_id", contact.id).eq("is_primary", true);
  }
  const { data, error } = await supabase.from("contact_attributions").insert({
    organization_id: profile.organizationId,
    location_id: contact.location_id,
    contact_id: contact.id,
    source_id: optional(formData.get("source_id")),
    campaign_id: optional(formData.get("campaign_id")),
    ad_group_id: optional(formData.get("ad_group_id")),
    ad_id: optional(formData.get("ad_id")),
    attribution_type: required(formData.get("attribution_type"), "Attribution type"),
    ...capture,
    external_click_id: optional(formData.get("external_click_id")),
    is_primary: isPrimary,
    metadata: { manual: true, reason: optional(formData.get("reason")) },
    created_by: profile.id
  }).select("id").single();
  if (error) throw new Error(error.message);
  await audit("Campaign Attribution Added", "contact_attributions", data.id, { contact_id: contact.id });
  revalidatePath(`/contacts/${contact.id}`);
  revalidatePath("/marketing");
}

export async function correctContactAttribution(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertMarketingPermission(profile, "marketing.attribution.manage");
  const supabase = await createClient();
  const oldAttributionId = required(formData.get("old_contact_attribution_id"), "Old attribution");
  const reason = required(formData.get("reason"), "Reason");
  const { data: oldAttribution } = await supabase.from("contact_attributions").select("id, contact_id, location_id").eq("id", oldAttributionId).eq("organization_id", profile.organizationId).single();
  if (!oldAttribution) throw new Error("Attribution not found");
  allowedLocation(oldAttribution.location_id, profile.locations.map((location) => location.id));
  const form = new FormData();
  form.set("contact_id", oldAttribution.contact_id);
  form.set("source_id", required(formData.get("source_id"), "Source"));
  form.set("campaign_id", optional(formData.get("campaign_id")) ?? "");
  form.set("attribution_type", "manual");
  form.set("is_primary", "on");
  form.set("reason", reason);
  await addContactAttribution(form);
  const { data: newest } = await supabase.from("contact_attributions").select("id").eq("organization_id", profile.organizationId).eq("contact_id", oldAttribution.contact_id).eq("is_primary", true).order("created_at", { ascending: false }).limit(1).single();
  await supabase.from("marketing_attribution_corrections").insert({
    organization_id: profile.organizationId,
    contact_id: oldAttribution.contact_id,
    old_contact_attribution_id: oldAttribution.id,
    new_contact_attribution_id: newest?.id ?? null,
    reason,
    corrected_by: profile.id
  });
  await audit("Attribution Changed", "marketing_attribution_corrections", newest?.id ?? null, { old_contact_attribution_id: oldAttribution.id, reason });
  revalidatePath(`/contacts/${oldAttribution.contact_id}`);
  revalidatePath("/marketing");
}
