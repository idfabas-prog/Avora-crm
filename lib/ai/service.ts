import type { CurrentProfile } from "@/lib/auth/profile";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { createClient } from "@/lib/supabase/server";
import { assertAiPermission } from "./permissions";
import { assertAiUsageAllowed } from "./usage";
import { logAiRequest } from "./audit";
import { completeWithAi } from "./client";
import { getAiConfig } from "./config";
import { getOwnerAnalytics, getSalespersonPerformance, getWorkflowPerformance } from "./analytics";
import { detectUnsafeRequest } from "./safety";
import type { AiAnswer } from "./types";

function featureFromQuestion(question: string) {
  const text = question.toLowerCase();
  if (text.includes("workflow")) return "workflow_performance";
  if (text.includes("salesperson") || text.includes("salesperson") || text.includes("staff") || text.includes("coaching") || text.includes("close rate")) return "sales_coaching";
  if (text.includes("reply")) return "suggest_reply";
  if (text.includes("lead") || text.includes("follow")) return "lead_scoring";
  if (text.includes("conversation") || text.includes("summar")) return "conversation_summary";
  return "owner_analytics";
}

function permissionForFeature(feature: string) {
  if (feature === "workflow_performance") return "ai.sales_insights";
  if (feature === "sales_coaching") return "ai.sales_insights";
  if (feature === "suggest_reply") return "ai.suggest_reply";
  if (feature === "lead_scoring") return "ai.lead_scoring";
  if (feature === "conversation_summary") return "ai.conversation_summary";
  return "ai.owner_analytics";
}

export async function askAvora(profile: CurrentProfile, question: string): Promise<AiAnswer> {
  const started = Date.now();
  assertAiPermission(profile, "ai.use");
  const feature = featureFromQuestion(question);
  assertAiPermission(profile, permissionForFeature(feature));
  const supabase = await createClient();
  await assertAiUsageAllowed(supabase, profile);
  const config = getAiConfig();
  const unsafe = detectUnsafeRequest(question);
  if (unsafe) {
    const requestId = await logAiRequest(supabase, profile, {
      feature,
      prompt: question,
      status: "completed",
      durationMs: Date.now() - started,
      trace: { blocked_intent: unsafe }
    });
    return {
      mode: config.mode,
      feature,
      observedFacts: ["The request included an action that AI is not allowed to perform."],
      analysis: [`Blocked intent detected: ${unsafe}.`],
      recommendations: ["Use normal CRM controls with explicit user review for operational actions."],
      basedOn: { tools: ["detectUnsafeRequest"], locations: [], recordCounts: {} },
      recordLinks: [],
      requestId,
      mock: true
    };
  }

  const selectedLocationId = await getSelectedLocationId(profile);
  const locationIds = allowedLocationIds(profile, selectedLocationId);
  const toolResult = feature === "workflow_performance"
    ? await getWorkflowPerformance(supabase, profile)
    : feature === "sales_coaching"
      ? await getSalespersonPerformance(supabase, profile, locationIds, question)
      : await getOwnerAnalytics(supabase, profile, locationIds, question);
  const aiResult = await completeWithAi({ feature, prompt: question, context: toolResult });
  const requestId = await logAiRequest(supabase, profile, {
    feature,
    prompt: question,
    status: "completed",
    model: aiResult.model,
    inputTokens: aiResult.inputTokens,
    outputTokens: aiResult.outputTokens,
    durationMs: Date.now() - started,
    trace: toolResult.trace
  });

  return {
    mode: config.mode,
    feature,
    observedFacts: toolResult.facts,
    analysis: [...toolResult.analysis, aiResult.text],
    recommendations: toolResult.recommendations,
    basedOn: toolResult.trace,
    recordLinks: [
      { label: "Open Reports", href: "/reports" },
      { label: "Open Follow-Up Queue", href: "/sales/follow-up" }
    ],
    requestId,
    mock: aiResult.mock
  };
}
