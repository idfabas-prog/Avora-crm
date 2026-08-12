"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { askAvora } from "@/lib/ai/service";
import { assertAiPermission } from "@/lib/ai/permissions";
import { calculateLeadScore } from "@/lib/ai/lead-scoring";
import { detectMetricInsight } from "@/lib/ai/insights";
import { buildConversationSummary, suggestedReply } from "@/lib/ai/summaries";
import { logAiRequest } from "@/lib/ai/audit";
import type { AiAnswer } from "@/lib/ai/types";

function required(value: FormDataEntryValue | null, label: string) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

export async function askAvoraAction(formData: FormData): Promise<AiAnswer> {
  const profile = await requireCurrentProfile();
  return askAvora(profile, required(formData.get("question"), "Question"));
}

export async function submitAiFeedback(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertAiPermission(profile, "ai.use");
  const supabase = await createClient();
  const { error } = await supabase.from("ai_feedback").insert({
    organization_id: profile.organizationId,
    user_id: profile.id,
    ai_request_id: required(formData.get("ai_request_id"), "AI request"),
    rating: required(formData.get("rating"), "Rating"),
    reason: String(formData.get("reason") ?? "").trim() || null
  });
  if (error) throw new Error(error.message);
  revalidatePath("/ai");
}

export async function summarizeConversationAction(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertAiPermission(profile, "ai.conversation_summary");
  const supabase = await createClient();
  const conversationId = required(formData.get("conversation_id"), "Conversation");
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, organization_id, location_id, contact_id")
    .eq("id", conversationId)
    .eq("organization_id", profile.organizationId)
    .single();
  if (!conversation) throw new Error("Conversation not found");
  if (conversation.location_id && !profile.locations.some((location) => location.id === conversation.location_id)) {
    throw new Error("Conversation location is not available for this user");
  }
  const { data: messages } = await supabase
    .from("messages")
    .select("id, direction, body, created_at, is_internal_note")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: true })
    .limit(100);
  const summary = buildConversationSummary(messages ?? []);
  const requestId = await logAiRequest(supabase, profile, {
    feature: "conversation_summary",
    prompt: "Summarize conversation",
    status: "completed",
    trace: { tools: ["buildConversationSummary"], recordCounts: { messages: messages?.length ?? 0 } }
  });
  await supabase.from("ai_cached_summaries").upsert({
    organization_id: profile.organizationId,
    location_id: conversation.location_id,
    entity_type: "conversation",
    entity_id: conversation.id,
    summary_type: "conversation_summary",
    content_json: { ...summary, request_id: requestId },
    source_fingerprint: JSON.stringify((messages ?? []).map((message) => message.id)),
    generated_by: profile.id
  }, { onConflict: "organization_id,entity_type,entity_id,summary_type" });
  revalidatePath("/conversations");
}

export async function suggestReplyAction(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertAiPermission(profile, "ai.suggest_reply");
  const supabase = await createClient();
  const conversationId = required(formData.get("conversation_id"), "Conversation");
  const style = required(formData.get("style"), "Reply style");
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, organization_id, location_id, contact_id, contacts(first_name), locations(name)")
    .eq("id", conversationId)
    .eq("organization_id", profile.organizationId)
    .single();
  if (!conversation) throw new Error("Conversation not found");
  const contact = Array.isArray(conversation.contacts) ? conversation.contacts[0] : conversation.contacts;
  const location = Array.isArray(conversation.locations) ? conversation.locations[0] : conversation.locations;
  const reply = suggestedReply(style, { first_name: contact?.first_name, location_name: location?.name });
  await logAiRequest(supabase, profile, {
    feature: "suggest_reply",
    prompt: `Suggest ${style} reply`,
    status: "completed",
    trace: { tools: ["suggestedReply"], recordCounts: { conversations: 1 } }
  });
  await supabase.from("ai_cached_summaries").upsert({
    organization_id: profile.organizationId,
    location_id: conversation.location_id,
    entity_type: "conversation",
    entity_id: conversation.id,
    summary_type: "suggested_reply",
    content_json: { reply, style, safety: "User must review before sending. No SMS sent automatically." },
    source_fingerprint: `${conversation.id}:${style}:${new Date().toISOString().slice(0, 13)}`,
    generated_by: profile.id
  }, { onConflict: "organization_id,entity_type,entity_id,summary_type" });
  revalidatePath("/conversations");
}

export async function summarizeContactAction(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertAiPermission(profile, "ai.conversation_summary");
  const supabase = await createClient();
  const contactId = required(formData.get("contact_id"), "Contact");
  const [
    { data: contact },
    { data: opportunities },
    { data: appointments },
    { data: messages },
    { data: tasks },
    { data: sales },
    { data: payments }
  ] = await Promise.all([
    supabase.from("contacts").select("id, organization_id, location_id, first_name, last_name, lead_source, status, lifetime_value_cents, last_activity_at").eq("id", contactId).eq("organization_id", profile.organizationId).single(),
    supabase.from("opportunities").select("id, name, status, value_cents, pipeline_stages(name)").eq("contact_id", contactId).order("updated_at", { ascending: false }).limit(5),
    supabase.from("appointments").select("id, status, start_at, appointment_types(name)").eq("contact_id", contactId).order("start_at", { ascending: false }).limit(5),
    supabase.from("messages").select("id, direction, body, status, is_internal_note, created_at").eq("contact_id", contactId).order("created_at", { ascending: false }).limit(20),
    supabase.from("tasks").select("id, title, status, due_at").eq("contact_id", contactId).in("status", ["open", "in_progress"]).order("due_at", { ascending: true }).limit(10),
    supabase.from("sales").select("id, status, total_amount_cents, balance_due_cents, sale_date").eq("contact_id", contactId).order("sale_date", { ascending: false }).limit(5),
    supabase.from("payments").select("id, status, amount_cents, received_at").eq("contact_id", contactId).order("received_at", { ascending: false }).limit(5)
  ]);
  if (!contact) throw new Error("Contact not found");
  if (contact.location_id && !profile.locations.some((location) => location.id === contact.location_id)) {
    throw new Error("Contact location is not available for this user");
  }

  const inboundMessages = (messages ?? []).filter((message) => message.direction === "inbound" && !message.is_internal_note);
  const latestOpportunity = opportunities?.[0];
  const latestAppointment = appointments?.[0];
  const openTasks = tasks ?? [];
  const requestId = await logAiRequest(supabase, profile, {
    feature: "contact_summary",
    prompt: "Summarize contact",
    status: "completed",
    trace: {
      tools: ["summarizeContactAction"],
      recordCounts: {
        contacts: 1,
        opportunities: opportunities?.length ?? 0,
        appointments: appointments?.length ?? 0,
        messages: messages?.length ?? 0,
        tasks: openTasks.length,
        sales: sales?.length ?? 0,
        payments: payments?.length ?? 0
      }
    }
  });
  await supabase.from("ai_cached_summaries").upsert({
    organization_id: profile.organizationId,
    location_id: contact.location_id,
    entity_type: "contact",
    entity_id: contact.id,
    summary_type: "contact_summary",
    content_json: {
      lead_source: contact.lead_source ?? "Not captured",
      current_status: contact.status,
      opportunity_history: latestOpportunity ? `${latestOpportunity.name} is ${latestOpportunity.status}` : "No opportunity found",
      appointment_history: latestAppointment ? `Latest appointment is ${latestAppointment.status}` : "No appointment found",
      communication_history: `${messages?.length ?? 0} recent messages reviewed; ${inboundMessages.length} were inbound.`,
      sales_payment_history: `${sales?.length ?? 0} recent sales and ${payments?.length ?? 0} recent payments reviewed.`,
      open_tasks: openTasks.map((task) => task.title),
      likely_next_action: openTasks[0]?.title ?? (inboundMessages.length ? "Reply to the latest inbound interest." : "Review status before taking action."),
      safety: "Summary is generated from CRM records only and does not include clinical recommendations.",
      request_id: requestId
    },
    source_fingerprint: JSON.stringify([
      contact.last_activity_at,
      ...(opportunities ?? []).map((item) => item.id),
      ...(appointments ?? []).map((item) => item.id),
      ...(messages ?? []).map((item) => item.id),
      ...(tasks ?? []).map((item) => item.id),
      ...(sales ?? []).map((item) => item.id),
      ...(payments ?? []).map((item) => item.id)
    ]),
    generated_by: profile.id
  }, { onConflict: "organization_id,entity_type,entity_id,summary_type" });
  revalidatePath(`/contacts/${contactId}`);
}

export async function recalculateLeadScoreAction(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertAiPermission(profile, "ai.lead_scoring");
  const supabase = await createClient();
  const contactId = required(formData.get("contact_id"), "Contact");
  const [{ data: contact }, { data: opportunities }, { data: appointments }, { data: messages }, { data: tasks }] = await Promise.all([
    supabase.from("contacts").select("id, organization_id, location_id, lead_source, status, lifetime_value_cents, last_activity_at").eq("id", contactId).eq("organization_id", profile.organizationId).single(),
    supabase.from("opportunities").select("id, value_cents, status").eq("contact_id", contactId).order("updated_at", { ascending: false }).limit(1),
    supabase.from("appointments").select("status").eq("contact_id", contactId).order("start_at", { ascending: false }).limit(5),
    supabase.from("messages").select("direction").eq("contact_id", contactId).limit(100),
    supabase.from("tasks").select("status, due_at").eq("contact_id", contactId).in("status", ["open", "in_progress"])
  ]);
  if (!contact) throw new Error("Contact not found");
  if (contact.location_id && !profile.locations.some((location) => location.id === contact.location_id)) {
    throw new Error("Contact location is not available for this user");
  }
  const opportunity = opportunities?.[0];
  const latestAppointment = appointments?.[0];
  const now = new Date();
  const score = calculateLeadScore({
    leadSource: contact.lead_source,
    status: contact.status,
    lifetimeValueCents: contact.lifetime_value_cents,
    lastActivityAt: contact.last_activity_at,
    opportunityValueCents: opportunity?.value_cents,
    opportunityStatus: opportunity?.status,
    appointmentStatus: latestAppointment?.status,
    messageCount: messages?.length ?? 0,
    inboundCount: messages?.filter((message) => message.direction === "inbound").length ?? 0,
    openTaskCount: tasks?.length ?? 0,
    overdueTaskCount: tasks?.filter((task) => task.due_at && new Date(task.due_at) < now).length ?? 0,
    noShowCount: appointments?.filter((appointment) => appointment.status === "no_show").length ?? 0
  }, now);
  const leadScorePayload = {
    organization_id: profile.organizationId,
    location_id: contact.location_id,
    contact_id: contact.id,
    opportunity_id: opportunity?.id ?? null,
    score: score.score,
    label: score.label,
    factors_json: score.factors,
    calculated_at: now.toISOString(),
    model_version: "deterministic-v1"
  };
  let existingScoreQuery = supabase
    .from("lead_scores")
    .select("id")
    .eq("organization_id", profile.organizationId)
    .eq("contact_id", contact.id);
  existingScoreQuery = opportunity?.id
    ? existingScoreQuery.eq("opportunity_id", opportunity.id)
    : existingScoreQuery.is("opportunity_id", null);
  const { data: existingScore } = await existingScoreQuery.maybeSingle();
  const { error: scoreError } = existingScore
    ? await supabase.from("lead_scores").update(leadScorePayload).eq("id", existingScore.id)
    : await supabase.from("lead_scores").insert(leadScorePayload);
  if (scoreError) throw new Error(scoreError.message);
  await logAiRequest(supabase, profile, {
    feature: "lead_scoring",
    prompt: "Recalculate lead score",
    status: "completed",
    trace: { tools: ["calculateLeadScore"], recordCounts: { contacts: 1, messages: messages?.length ?? 0, tasks: tasks?.length ?? 0 } }
  });
  revalidatePath(`/contacts/${contactId}`);
  revalidatePath("/sales/follow-up");
}

export async function refreshAiInsightsAction() {
  const profile = await requireCurrentProfile();
  assertAiPermission(profile, "ai.sales_insights");
  const supabase = await createClient();
  const [{ count: openTasks }, { count: noShows }] = await Promise.all([
    supabase.from("tasks").select("*", { count: "exact", head: true }).eq("organization_id", profile.organizationId).in("status", ["open", "in_progress"]),
    supabase.from("appointments").select("*", { count: "exact", head: true }).eq("organization_id", profile.organizationId).eq("status", "no_show")
  ]);
  const insights = [
    detectMetricInsight({ metric: "Open follow-ups", current: openTasks ?? 0, previous: 5, href: "/sales/follow-up" }),
    detectMetricInsight({ metric: "No-show volume", current: noShows ?? 0, previous: 2, href: "/calendar" })
  ].filter(Boolean);
  for (const insight of insights) {
    await supabase.from("ai_insights").insert({
      organization_id: profile.organizationId,
      insight_type: insight!.insightType,
      severity: insight!.severity,
      title: insight!.title,
      summary: insight!.summary,
      evidence_json: insight!.evidence,
      status: "active",
      expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString()
    });
  }
  await logAiRequest(supabase, profile, {
    feature: "insights",
    prompt: "Refresh insights",
    status: "completed",
    trace: { tools: ["detectMetricInsight"], recordCounts: { insights: insights.length } }
  });
  revalidatePath("/dashboard");
  revalidatePath("/settings/ai");
}
