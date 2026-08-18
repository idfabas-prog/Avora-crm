import type { CurrentProfile } from "@/lib/auth/profile";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { createClient } from "@/lib/supabase/server";
import { assertAiPermission } from "./permissions";
import { assertAiUsageAllowed } from "./usage";
import { logAiRequest } from "./audit";
import { completeWithAi } from "./client";
import { getAiConfig } from "./config";
import { getOwnerAnalytics, getSalespersonPerformance, getWorkflowPerformance } from "./analytics";
import { getMarketingSummary } from "./marketing-tools";
import { getCampaignIntelligenceSummary } from "./campaign-tools";
import { getCallSummary } from "./call-tools";
import { getPortalRevenueSummary } from "./portal-tools";
import { getInventorySummary } from "./inventory-tools";
import { getWorkforcePerformanceSummary } from "./workforce-tools";
import { getReputationSummary } from "./reputation-tools";
import { getExecutiveSummary } from "./executive-tools";
import { getAiOperatingToolSummary } from "./operating-system";
import { getExpansionIntelligenceSummary } from "./expansion-tools";
import { getAccountingIntelligenceSummary } from "./accounting-tools";
import { getGhlIntegrationSummary } from "./gohighlevel-tools";
import { detectUnsafeRequest } from "./safety";
import type { AiAnswer } from "./types";

function featureFromQuestion(question: string) {
  const text = question.toLowerCase();
  if (text.includes("operating system") || text.includes("operating brief") || text.includes("daily brief") || text.includes("today's priorities") || text.includes("today priorities") || text.includes("no-show risk") || text.includes("churn risk") || text.includes("collections") || text.includes("collection priority") || text.includes("revenue opportunities") || text.includes("next best action") || text.includes("proactive insight")) return "operating_system";
  if (text.includes("accounting") || text.includes("bookkeeping") || text.includes("journal preview") || text.includes("journal batch") || text.includes("export batch") || text.includes("reconciliation") || text.includes("unreconciled") || text.includes("unmapped accounting") || text.includes("month-end close") || text.includes("financial close") || text.includes("close the month") || text.includes("royalties this month") || text.includes("management fees due")) return "accounting_close";
  if (text.includes("gohighlevel") || text.includes("highlevel") || text.includes("ghl") || text.includes("leadconnector") || text.includes("external crm") || text.includes("integration parity")) return "gohighlevel_integration";
  if (text.includes("expansion") || text.includes("territory") || text.includes("territories") || text.includes("region") || text.includes("regional") || text.includes("operating entity") || text.includes("franchise") || text.includes("partner location") || text.includes("site comparison") || text.includes("proposed site") || text.includes("opening readiness") || text.includes("new location") || text.includes("launch") || text.includes("brand compliance") || text.includes("management fee") || text.includes("ramp")) return "expansion_intelligence";
  if (text.includes("executive") || text.includes("company") || text.includes("command center") || text.includes("owner brief") || text.includes("target") || text.includes("forecast") || text.includes("contribution") || text.includes("which location") || text.includes("clinic") || text.includes("on track") || text.includes("attention")) return "executive_command";
  if (text.includes("call") || text.includes("phone") || text.includes("voicemail") || text.includes("callback") || text.includes("missed") || text.includes("dialer")) return "call_intelligence";
  if (text.includes("workflow")) return "workflow_performance";
  if (text.includes("inventory") || text.includes("reorder") || text.includes("stock") || text.includes("lot") || text.includes("expir") || text.includes("cogs") || text.includes("gross margin") || text.includes("gross profit") || text.includes("waste")) return "inventory_performance";
  if (text.includes("workforce") || text.includes("shift") || text.includes("clocked") || text.includes("time clock") || text.includes("timesheet") || text.includes("overtime") || text.includes("pto") || text.includes("labor cost") || text.includes("payroll") || text.includes("staffing") || text.includes("utilization")) return "workforce_performance";
  if (text.includes("segment") || text.includes("bulk") || text.includes("lifecycle campaign") || text.includes("a/b") || text.includes("variant") || text.includes("suppression") || text.includes("unsubscribe") || text.includes("opt-out") || text.includes("frequency cap") || text.includes("fatigue")) return "campaign_intelligence";
  if (text.includes("reputation") || text.includes("review") || text.includes("nps") || text.includes("csat") || text.includes("satisfaction") || text.includes("feedback") || text.includes("referral") || text.includes("referrer") || text.includes("reactivation") || text.includes("inactive") || text.includes("win-back") || text.includes("loyalty")) return "reputation_growth";
  if (text.includes("portal") || text.includes("membership") || text.includes("subscription") || text.includes("payment plan")) return "portal_revenue";
  if (text.includes("marketing") || text.includes("campaign") || text.includes("roas") || text.includes("cpl") || text.includes("meta") || text.includes("google")) return "marketing_performance";
  if (text.includes("salesperson") || text.includes("salesperson") || text.includes("staff") || text.includes("coaching") || text.includes("close rate")) return "sales_coaching";
  if (text.includes("reply")) return "suggest_reply";
  if (text.includes("lead") || text.includes("follow")) return "lead_scoring";
  if (text.includes("conversation") || text.includes("summar")) return "conversation_summary";
  return "owner_analytics";
}

function permissionForFeature(feature: string) {
  if (feature === "operating_system") return "ai.operating_brief";
  if (feature === "accounting_close") return "ai.owner_analytics";
  if (feature === "gohighlevel_integration") return "ai.owner_analytics";
  if (feature === "expansion_intelligence") return "ai.owner_analytics";
  if (feature === "executive_command") return "ai.owner_analytics";
  if (feature === "workflow_performance") return "ai.sales_insights";
  if (feature === "call_intelligence") return "ai.owner_analytics";
  if (feature === "inventory_performance") return "ai.owner_analytics";
  if (feature === "workforce_performance") return "ai.owner_analytics";
  if (feature === "campaign_intelligence") return "ai.owner_analytics";
  if (feature === "reputation_growth") return "ai.owner_analytics";
  if (feature === "portal_revenue") return "ai.owner_analytics";
  if (feature === "marketing_performance") return "ai.owner_analytics";
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
  const toolResult = feature === "executive_command"
    ? await getExecutiveSummary(supabase, profile, locationIds, question)
    : feature === "accounting_close"
    ? await getAccountingIntelligenceSummary(supabase, profile, locationIds, question)
    : feature === "gohighlevel_integration"
    ? await getGhlIntegrationSummary(supabase, profile)
    : feature === "expansion_intelligence"
    ? await getExpansionIntelligenceSummary(supabase, profile, locationIds, question)
    : feature === "operating_system"
    ? await getAiOperatingToolSummary(supabase, profile, selectedLocationId)
    : feature === "call_intelligence"
    ? await getCallSummary(supabase, profile, locationIds, question)
    : feature === "workflow_performance"
    ? await getWorkflowPerformance(supabase, profile)
    : feature === "inventory_performance"
      ? await getInventorySummary(supabase, profile, locationIds, question)
    : feature === "workforce_performance"
      ? await getWorkforcePerformanceSummary(supabase, profile, locationIds, question)
    : feature === "campaign_intelligence"
      ? await getCampaignIntelligenceSummary(supabase, profile, locationIds, question)
    : feature === "reputation_growth"
      ? await getReputationSummary(supabase, profile, locationIds, question)
    : feature === "portal_revenue"
      ? await getPortalRevenueSummary(supabase, profile)
    : feature === "marketing_performance"
      ? await getMarketingSummary(supabase, profile, locationIds)
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
      ...(feature === "executive_command" ? [{ label: "Open Executive", href: "/executive" }, { label: "Open Executive Alerts", href: "/executive/alerts" }, { label: "Open Targets", href: "/settings/executive/targets" }] : []),
      ...(feature === "accounting_close" ? [{ label: "Open Accounting", href: "/accounting" }, { label: "Open Journal Preview", href: "/accounting/journal-preview" }, { label: "Open Close", href: "/accounting/close" }] : []),
      ...(feature === "expansion_intelligence" ? [{ label: "Open Expansion", href: "/expansion" }, { label: "Open Regions", href: "/regions" }, { label: "Open Entities", href: "/executive/entities" }] : []),
      ...(feature === "operating_system" ? [{ label: "Open AI Operating System", href: "/ai/operating-system" }, { label: "Open Executive Brief", href: "/executive/brief" }, { label: "Open AI Insights", href: "/ai/insights" }] : []),
      ...(feature === "call_intelligence" ? [{ label: "Open Calls", href: "/calls" }, { label: "Open Call Dashboard", href: "/calls/dashboard" }, { label: "Open Callbacks", href: "/calls/callbacks" }] : []),
      ...(feature === "marketing_performance" ? [{ label: "Open Marketing", href: "/marketing" }] : []),
      ...(feature === "inventory_performance" ? [{ label: "Open Inventory", href: "/inventory" }, { label: "Open Gross Profit", href: "/reports/gross-profit" }] : []),
      ...(feature === "workforce_performance" ? [{ label: "Open Staff", href: "/staff" }, { label: "Open Labor Cost", href: "/reports/labor-cost" }, { label: "Open Time Off", href: "/staff/time-off" }] : []),
      ...(feature === "campaign_intelligence" ? [{ label: "Open Lifecycle Campaigns", href: "/marketing/campaigns" }, { label: "Open Segments", href: "/marketing/segments" }, { label: "Open Campaign Settings", href: "/settings/campaigns" }] : []),
      ...(feature === "reputation_growth" ? [{ label: "Open Reputation", href: "/reputation" }, { label: "Open Referrals", href: "/reputation/referrals" }, { label: "Open Reactivation", href: "/reputation/reactivation" }] : []),
      ...(feature === "portal_revenue" ? [{ label: "Open Portal Settings", href: "/settings/portal" }, { label: "Open Memberships", href: "/settings/memberships" }] : []),
      { label: "Open Reports", href: "/reports" },
      { label: "Open Follow-Up Queue", href: "/sales/follow-up" }
    ],
    requestId,
    mock: aiResult.mock
  };
}
