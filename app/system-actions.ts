"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { APP_DISPLAY_NAME } from "@/lib/config/branding";
import { createClient } from "@/lib/supabase/server";
import { assertSystemAccess } from "@/lib/system/audits";

export async function updateSystemMode(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertSystemAccess(profile);
  const supabase = await createClient();
  const maintenanceMode = formData.get("maintenance_mode") === "on";
  const readOnlyMode = formData.get("read_only_mode") === "on";
  const supportMessage = String(formData.get("support_message") ?? `${APP_DISPLAY_NAME} is operating normally.`).slice(0, 500);

  await supabase.from("system_settings").upsert({
    organization_id: profile.organizationId,
    maintenance_mode: maintenanceMode,
    read_only_mode: readOnlyMode,
    support_message: supportMessage,
    updated_by: profile.id
  }, { onConflict: "organization_id" });

  revalidatePath("/settings/system");
}

export async function updateFeatureGate(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertSystemAccess(profile);
  const supabase = await createClient();
  const featureKey = String(formData.get("feature_key") ?? "");
  const liveEnabled = formData.get("live_enabled") === "on";
  const allowed = ["live_payments", "live_telephony", "live_campaigns", "live_accounting", "live_push", "live_ai_provider"];
  if (!allowed.includes(featureKey)) throw new Error("Unknown feature gate");

  await supabase.from("system_feature_flags").upsert({
    organization_id: profile.organizationId,
    feature_key: featureKey,
    live_enabled: liveEnabled,
    status: liveEnabled ? "live_enabled" : "disabled",
    updated_by: profile.id,
    metadata_safe: { changed_from_ui: true }
  }, { onConflict: "organization_id,feature_key" });

  revalidatePath("/settings/system/features");
}
