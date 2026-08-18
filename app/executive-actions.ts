"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { assertExecutivePermission } from "@/lib/executive/permissions";

function value(formData: FormData, key: string) {
  const item = formData.get(key);
  return typeof item === "string" ? item.trim() : "";
}

function nullableLocationId(raw: string) {
  return raw && raw !== "company" ? raw : null;
}

export async function saveExecutiveTarget(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertExecutivePermission(profile, "executive.targets.manage");
  const supabase = await createClient();
  const locationId = nullableLocationId(value(formData, "location_id"));
  if (locationId && !profile.locations.some((location) => location.id === locationId)) {
    throw new Error("Selected location is not available for this user");
  }
  const payload = {
    organization_id: profile.organizationId,
    location_id: locationId,
    metric_key: value(formData, "metric_key"),
    period_type: value(formData, "period_type"),
    target_value: Number(value(formData, "target_value")),
    warning_threshold: value(formData, "warning_threshold") ? Number(value(formData, "warning_threshold")) : null,
    critical_threshold: value(formData, "critical_threshold") ? Number(value(formData, "critical_threshold")) : null,
    effective_start: value(formData, "effective_start"),
    effective_end: value(formData, "effective_end") || null,
    active: true,
    created_by: profile.id
  };
  if (!payload.metric_key || !payload.period_type || !payload.effective_start || !Number.isFinite(payload.target_value)) {
    throw new Error("Target requires metric, period, value, and effective start");
  }
  const { error } = await supabase.from("executive_targets").insert(payload);
  if (error) throw new Error(error.message);
  await supabase.from("audit_logs").insert({
    organization_id: profile.organizationId,
    actor_id: profile.id,
    action: "executive_target_created",
    entity_table: "executive_targets",
    entity_id: null,
    metadata: { metric_key: payload.metric_key, location_id: payload.location_id, period_type: payload.period_type }
  });
  revalidatePath("/executive");
  revalidatePath("/settings/executive/targets");
}

export async function acknowledgeExecutiveAlert(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertExecutivePermission(profile, "executive.alerts.manage");
  const supabase = await createClient();
  const alertId = value(formData, "alert_id");
  const { error } = await supabase.rpc("acknowledge_executive_alert", { target_alert_id: alertId });
  if (error) throw new Error(error.message);
  await supabase.from("audit_logs").insert({
    organization_id: profile.organizationId,
    actor_id: profile.id,
    action: "executive_alert_acknowledged",
    entity_table: "executive_alerts",
    entity_id: alertId,
    metadata: {}
  });
  revalidatePath("/executive");
  revalidatePath("/executive/alerts");
}

export async function resolveExecutiveAlert(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertExecutivePermission(profile, "executive.alerts.manage");
  const supabase = await createClient();
  const alertId = value(formData, "alert_id");
  const { error } = await supabase.rpc("resolve_executive_alert", { target_alert_id: alertId });
  if (error) throw new Error(error.message);
  await supabase.from("audit_logs").insert({
    organization_id: profile.organizationId,
    actor_id: profile.id,
    action: "executive_alert_resolved",
    entity_table: "executive_alerts",
    entity_id: alertId,
    metadata: {}
  });
  revalidatePath("/executive");
  revalidatePath("/executive/alerts");
}
