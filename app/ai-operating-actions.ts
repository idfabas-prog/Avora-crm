"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { assertAiPermission } from "@/lib/ai/permissions";
import { assertAdvisoryOnlyAction } from "@/lib/ai/operating-rules";
import { APP_DISPLAY_NAME } from "@/lib/config/branding";
import { createClient } from "@/lib/supabase/server";

function required(value: FormDataEntryValue | null, label: string) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

export async function refreshOperatingBriefAction() {
  const profile = await requireCurrentProfile();
  assertAiPermission(profile, "ai.proactive_insights");
  assertAdvisoryOnlyAction("refresh advisory operating brief");
  const supabase = await createClient();
  const { error } = await supabase.from("ai_operating_briefs").upsert({
    organization_id: profile.organizationId,
    audience_user_id: profile.id,
    brief_key: `phase16:generated:${profile.id}:daily`,
    brief_type: profile.role === "salesperson" ? "sales_daily" : profile.role === "provider" ? "provider_daily" : profile.role === "manager" ? "manager_daily" : "executive_daily",
    brief_date: new Date().toISOString().slice(0, 10),
    audience_type: profile.role,
    title: "Generated Daily Operating Brief",
    summary: `Generated from visible ${APP_DISPLAY_NAME} CRM records. This is advisory-only and does not take action.`,
    sections_json: [
      { heading: "Scope", body: `${profile.locations.length} allowed location(s) are available to this user.` },
      { heading: "Safety", body: "No messages, calls, charges, workflow publishing, inventory, payroll, or clinical actions were performed." }
    ],
    top_priorities_json: ["Review active insights", "Review open recommendations", "Use normal CRM controls for any approved action"],
    limitations_json: ["Generated in development mode", "Uses CRM records visible through RLS"],
    confidence: 0.62,
    status: "ready",
    generated_by: profile.id,
    model_version: "deterministic-operating-v1",
    rules_version: "phase-16-v1"
  }, { onConflict: "organization_id,brief_key" });
  if (error) throw new Error(error.message);
  revalidatePath("/executive/brief");
  revalidatePath("/ai/operating-system");
}

export async function updateRecommendationStatusAction(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertAiPermission(profile, "ai.recommendations.manage");
  const id = required(formData.get("recommendation_id"), "Recommendation");
  const status = required(formData.get("status"), "Status");
  if (!["accepted", "deferred", "dismissed", "completed"].includes(status)) {
    throw new Error("Unsupported recommendation status");
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("ai_recommendations")
    .update({ status, acted_at: new Date().toISOString(), acted_by: profile.id })
    .eq("id", id)
    .eq("organization_id", profile.organizationId);
  if (error) throw new Error(error.message);
  revalidatePath("/ai/operating-system");
  revalidatePath("/ai/revenue-opportunities");
  revalidatePath("/ai/collections");
}

export async function acknowledgeInsightAction(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertAiPermission(profile, "ai.proactive_insights");
  const id = required(formData.get("insight_id"), "Insight");
  const supabase = await createClient();
  const { error } = await supabase
    .from("ai_insights")
    .update({ status: "acknowledged", acknowledged_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", profile.organizationId);
  if (error) throw new Error(error.message);
  revalidatePath("/ai/insights");
  revalidatePath("/ai/operating-system");
}
