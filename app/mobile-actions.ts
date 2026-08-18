"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { parseSafeRoute } from "@/lib/mobile/deep-links";

function required(value: FormDataEntryValue | null, label: string) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function optional(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

export async function markMobileNotificationRead(formData: FormData) {
  await requireCurrentProfile();
  const supabase = await createClient();
  const notificationId = required(formData.get("notification_id"), "Notification");
  const { error } = await supabase.rpc("mobile_mark_notification_read", { target_notification_id: notificationId });
  if (error) throw new Error(error.message);
  revalidatePath("/notifications");
  revalidatePath("/mobile");
}

export async function dismissMobileNotification(formData: FormData) {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const notificationId = required(formData.get("notification_id"), "Notification");
  const { error } = await supabase
    .from("mobile_notifications")
    .update({ status: "dismissed", dismissed_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("organization_id", profile.organizationId)
    .eq("user_id", profile.id);
  if (error) throw new Error(error.message);
  revalidatePath("/notifications");
  revalidatePath("/mobile");
}

export async function deactivateMobileDevice(formData: FormData) {
  await requireCurrentProfile();
  const supabase = await createClient();
  const deviceId = required(formData.get("device_id"), "Device");
  const { error } = await supabase.rpc("mobile_deactivate_device", { target_device_id: deviceId });
  if (error) throw new Error(error.message);
  revalidatePath("/settings/mobile");
}

export async function saveMobileDraft(formData: FormData) {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const draftType = required(formData.get("draft_type"), "Draft type");
  const route = parseSafeRoute(required(formData.get("route"), "Route"));
  const note = optional(formData.get("note"));
  const sensitivity = optional(formData.get("sensitivity")) ?? "standard";
  const entityTable = optional(formData.get("entity_table"));
  const entityId = optional(formData.get("entity_id"));
  const payload = {
    organization_id: profile.organizationId,
    user_id: profile.id,
    patient_account_id: null,
    draft_type: draftType,
    route,
    entity_table: entityTable,
    entity_id: entityId,
    draft_payload: { note: note ?? "", saved_from: "mobile" },
    sensitivity,
    expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString()
  };
  const existingQuery = supabase
    .from("mobile_drafts")
    .select("id")
    .eq("organization_id", profile.organizationId)
    .eq("user_id", profile.id)
    .eq("draft_type", draftType)
    .eq("route", route)
    .is("discarded_at", null)
    .limit(1);
  const { data: existing, error: existingError } = entityId ? await existingQuery.eq("entity_id", entityId).maybeSingle() : await existingQuery.is("entity_id", null).maybeSingle();
  if (existingError) throw new Error(existingError.message);
  const result = existing?.id
    ? await supabase.from("mobile_drafts").update(payload).eq("id", existing.id)
    : await supabase.from("mobile_drafts").insert(payload);
  if (result.error) throw new Error(result.error.message);
  await supabase.from("mobile_app_events").insert({
    organization_id: profile.organizationId,
    user_id: profile.id,
    event_type: "draft_saved",
    platform: "web",
    route,
    metadata_safe: { draft_type: draftType }
  });
  revalidatePath(route);
}
