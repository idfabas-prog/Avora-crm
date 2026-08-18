import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentProfile } from "@/lib/auth/profile";
import { APP_DISPLAY_NAME } from "@/lib/config/branding";
import { allowedLocationIds } from "@/lib/crm/location";
import { formatMoney } from "@/lib/financial/money";
import type { AiTrace } from "./types";

export type ConfidenceLabel = "high" | "moderate" | "limited";
export type RiskBand = "low" | "medium" | "high" | "urgent";
export type ForecastMethod = "run_rate" | "rolling_average" | "weighted_recent_average";

export type ScoreFactor = {
  label: string;
  points: number;
  evidence?: string;
};

export type PredictionInput = {
  recentActivityDays?: number;
  inboundCount?: number;
  openTaskCount?: number;
  overdueTaskCount?: number;
  opportunityValueCents?: number;
  bookedConsult?: boolean;
  noShowCount?: number;
  cancelledCount?: number;
  unpaidBalanceCents?: number;
  monthsSinceLastVisit?: number;
  membershipPastDue?: boolean;
};

export type PredictionOutput = {
  score: number;
  band: RiskBand;
  confidence: number;
  factors: ScoreFactor[];
  excludedFactors: string[];
  recommendedNextStep: string;
};

export type ForecastInput = {
  actualValue: number;
  elapsedDays: number;
  periodDays: number;
  recentValues?: number[];
  weights?: number[];
  targetValue?: number | null;
};

export type ForecastOutput = {
  method: ForecastMethod;
  actualValue: number;
  forecastValue: number;
  targetValue: number | null;
  gapValue: number | null;
  confidence: ConfidenceLabel;
  assumptions: string[];
  limitations: string[];
};

export type OperatingRow = {
  id: string;
  organization_id: string;
  location_id: string | null;
  title: string;
  summary: string;
  status?: string | null;
  priority?: string | null;
  severity?: string | null;
  score?: number | null;
  confidence?: number | string | null;
  supporting_route?: string | null;
  generated_at?: string | null;
  brief_date?: string | null;
  metric_label?: string | null;
  forecast_value?: number | string | null;
  target_value?: number | string | null;
};

export type AiOperatingSummary = {
  briefs: OperatingRow[];
  insights: OperatingRow[];
  predictions: OperatingRow[];
  recommendations: OperatingRow[];
  forecasts: OperatingRow[];
  facts: string[];
  analysis: string[];
  recommendationsText: string[];
  trace: AiTrace;
};

export type AiOperatingToolSummary = {
  facts: string[];
  analysis: string[];
  recommendations: string[];
  trace: AiTrace;
};

export const sensitivePredictionExclusions = [
  "age",
  "race",
  "ethnicity",
  "gender",
  "disability",
  "diagnosis",
  "medical history",
  "insurance status",
  "credit score",
  "income"
];

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function riskBand(score: number): RiskBand {
  if (score >= 85) return "urgent";
  if (score >= 70) return "high";
  if (score >= 45) return "medium";
  return "low";
}

export function confidenceFromEvidence(sampleSize: number, completeness: number, periodMaturity = 1): ConfidenceLabel {
  if (sampleSize >= 30 && completeness >= 0.85 && periodMaturity >= 0.5) return "high";
  if (sampleSize >= 10 && completeness >= 0.65) return "moderate";
  return "limited";
}

export function numericConfidence(label: ConfidenceLabel) {
  if (label === "high") return 0.86;
  if (label === "moderate") return 0.7;
  return 0.55;
}

function scoreFromFactors(base: number, factors: ScoreFactor[]) {
  return clamp(base + factors.reduce((sum, factor) => sum + factor.points, 0));
}

export function leadConversionPrediction(input: PredictionInput, now = new Date()): PredictionOutput {
  const factors: ScoreFactor[] = [];
  if (input.bookedConsult) factors.push({ label: "Booked consult", points: 24, evidence: "Consult is already scheduled." });
  if ((input.inboundCount ?? 0) > 0) factors.push({ label: "Recent inbound interest", points: 16, evidence: "Contact initiated or replied recently." });
  if ((input.opportunityValueCents ?? 0) >= 900_000) factors.push({ label: "High-value opportunity", points: 14, evidence: "Opportunity value is above demo threshold." });
  if ((input.recentActivityDays ?? 999) <= 3) factors.push({ label: "Fresh activity", points: 12, evidence: `${input.recentActivityDays} day(s) since last activity as of ${now.toISOString().slice(0, 10)}.` });
  if ((input.openTaskCount ?? 0) === 0) factors.push({ label: "No open blocker tasks", points: 8, evidence: "No unfinished follow-up task is blocking review." });
  const score = scoreFromFactors(18, factors);
  return {
    score,
    band: riskBand(score),
    confidence: 0.78,
    factors,
    excludedFactors: sensitivePredictionExclusions,
    recommendedNextStep: "Review the contact and approve any follow-up manually."
  };
}

export function noShowRiskPrediction(input: PredictionInput): PredictionOutput {
  const factors: ScoreFactor[] = [];
  if ((input.noShowCount ?? 0) > 0) factors.push({ label: "Prior no-show", points: 24 });
  if ((input.cancelledCount ?? 0) > 0) factors.push({ label: "Recent cancellation", points: 14 });
  if ((input.inboundCount ?? 0) === 0) factors.push({ label: "No recent inbound confirmation", points: 12 });
  if ((input.overdueTaskCount ?? 0) > 0) factors.push({ label: "Overdue confirmation task", points: 16 });
  const score = scoreFromFactors(22, factors);
  return {
    score,
    band: riskBand(score),
    confidence: 0.68,
    factors,
    excludedFactors: sensitivePredictionExclusions,
    recommendedNextStep: "Have staff review appointment intent before sending any reminder."
  };
}

export function churnRiskPrediction(input: PredictionInput): PredictionOutput {
  const factors: ScoreFactor[] = [];
  if ((input.monthsSinceLastVisit ?? 0) >= 12) factors.push({ label: "Long activity gap", points: 26 });
  if (input.membershipPastDue) factors.push({ label: "Past-due membership", points: 18 });
  if ((input.inboundCount ?? 0) === 0) factors.push({ label: "No recent conversation", points: 10 });
  if ((input.openTaskCount ?? 0) > 0) factors.push({ label: "Open follow-up task", points: 8 });
  const score = scoreFromFactors(20, factors);
  return {
    score,
    band: riskBand(score),
    confidence: 0.65,
    factors,
    excludedFactors: sensitivePredictionExclusions,
    recommendedNextStep: "Review consent, suppressions, and lifecycle context before reactivation outreach."
  };
}

export function collectionPriorityPrediction(input: PredictionInput): PredictionOutput {
  const factors: ScoreFactor[] = [];
  if ((input.unpaidBalanceCents ?? 0) >= 100_000) factors.push({ label: "Meaningful balance due", points: 28, evidence: formatMoney(input.unpaidBalanceCents ?? 0) });
  if ((input.recentActivityDays ?? 999) <= 14) factors.push({ label: "Recent activity", points: 12 });
  if ((input.overdueTaskCount ?? 0) > 0) factors.push({ label: "Overdue billing task", points: 10 });
  const score = scoreFromFactors(18, factors);
  return {
    score,
    band: riskBand(score),
    confidence: 0.72,
    factors,
    excludedFactors: sensitivePredictionExclusions,
    recommendedNextStep: "Review account status manually; AI cannot charge cards or issue payment demands."
  };
}

export function runRateForecast(input: ForecastInput): ForecastOutput {
  const elapsed = Math.max(1, input.elapsedDays);
  const period = Math.max(elapsed, input.periodDays);
  const forecastValue = Math.round((input.actualValue / elapsed) * period);
  const maturity = elapsed / period;
  const confidence = confidenceFromEvidence(input.recentValues?.length ?? elapsed, 0.75, maturity);
  return {
    method: "run_rate",
    actualValue: input.actualValue,
    forecastValue,
    targetValue: input.targetValue ?? null,
    gapValue: input.targetValue == null ? null : forecastValue - input.targetValue,
    confidence,
    assumptions: ["Current pace continues through the remaining period."],
    limitations: ["Run-rate forecasts are sensitive to early-period volatility and demo sample size."]
  };
}

export function rollingAverageForecast(input: ForecastInput): ForecastOutput {
  const values = input.recentValues?.length ? input.recentValues : [input.actualValue];
  const dailyAverage = values.reduce((sum, value) => sum + value, 0) / values.length;
  const forecastValue = Math.round(dailyAverage * Math.max(1, input.periodDays));
  const confidence = confidenceFromEvidence(values.length, 0.7, 1);
  return {
    method: "rolling_average",
    actualValue: input.actualValue,
    forecastValue,
    targetValue: input.targetValue ?? null,
    gapValue: input.targetValue == null ? null : forecastValue - input.targetValue,
    confidence,
    assumptions: ["Recent average is representative of the forecast period."],
    limitations: ["Does not account for seasonality or campaign changes."]
  };
}

export function weightedRecentAverageForecast(input: ForecastInput): ForecastOutput {
  const values = input.recentValues?.length ? input.recentValues : [input.actualValue];
  const weights = input.weights?.length === values.length ? input.weights : values.map((_, index) => index + 1);
  const weightedTotal = values.reduce((sum, value, index) => sum + value * weights[index], 0);
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  const forecastValue = Math.round((weightedTotal / Math.max(1, weightTotal)) * Math.max(1, input.periodDays));
  const confidence = confidenceFromEvidence(values.length, 0.72, 1);
  return {
    method: "weighted_recent_average",
    actualValue: input.actualValue,
    forecastValue,
    targetValue: input.targetValue ?? null,
    gapValue: input.targetValue == null ? null : forecastValue - input.targetValue,
    confidence,
    assumptions: ["More recent demo activity carries more weight."],
    limitations: ["Does not make external market or ad-platform calls."]
  };
}

export function insightSeverity(changePercent: number, sampleSize: number): "info" | "watch" | "important" | "critical" {
  const magnitude = Math.abs(changePercent);
  if (magnitude >= 0.35 && sampleSize >= 20) return "critical";
  if (magnitude >= 0.2 && sampleSize >= 10) return "important";
  if (magnitude >= 0.1) return "watch";
  return "info";
}

export function recommendationPriority(score: number): RiskBand {
  return riskBand(score);
}

export function explainScore(output: PredictionOutput) {
  return output.factors
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
    .map((factor) => `${factor.label}: ${factor.points >= 0 ? "+" : ""}${factor.points}`);
}

export function assertAdvisoryOnlyAction(action: string) {
  const blocked = ["send", "call", "charge", "refund", "delete", "diagnose", "publish", "receive inventory", "approve payroll", "change budget"];
  const normalized = action.toLowerCase();
  const match = blocked.find((item) => normalized.includes(item));
  if (match) throw new Error(`AI operating system is advisory-only and cannot ${match}.`);
}

function inAllowedScope(locationId: string | null, locationIds: string[]) {
  return locationId === null || locationIds.includes(locationId);
}

export async function getAiOperatingSummary(
  supabase: SupabaseClient,
  profile: CurrentProfile,
  selectedLocationId?: string | null
): Promise<AiOperatingSummary> {
  const locationIds = allowedLocationIds(profile, selectedLocationId ?? null);
  const [
    { data: briefs },
    { data: insights },
    { data: predictions },
    { data: recommendations },
    { data: forecasts }
  ] = await Promise.all([
    supabase
      .from("ai_operating_briefs")
      .select("id, organization_id, location_id, title, summary, status, confidence, generated_at, brief_date")
      .eq("organization_id", profile.organizationId)
      .order("generated_at", { ascending: false })
      .limit(12),
    supabase
      .from("ai_insights")
      .select("id, organization_id, location_id, title, summary, status, severity, confidence, supporting_route, generated_at")
      .eq("organization_id", profile.organizationId)
      .in("status", ["active", "acknowledged"])
      .order("generated_at", { ascending: false })
      .limit(20),
    supabase
      .from("predictive_scores")
      .select("id, organization_id, location_id, score_type, entity_type, score, band, confidence, recommended_next_step, calculated_at")
      .eq("organization_id", profile.organizationId)
      .order("score", { ascending: false })
      .limit(30),
    supabase
      .from("ai_recommendations")
      .select("id, organization_id, location_id, title, summary, status, priority, generated_at")
      .eq("organization_id", profile.organizationId)
      .in("status", ["open", "accepted", "deferred"])
      .order("generated_at", { ascending: false })
      .limit(30),
    supabase
      .from("forecast_records")
      .select("id, organization_id, location_id, metric_label, forecast_value, target_value, confidence, generated_at")
      .eq("organization_id", profile.organizationId)
      .order("generated_at", { ascending: false })
      .limit(20)
  ]);

  const mappedPredictions = ((predictions ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    organization_id: String(row.organization_id),
    location_id: typeof row.location_id === "string" ? row.location_id : null,
    title: String(row.score_type ?? "Prediction").replaceAll("_", " "),
    summary: String(row.recommended_next_step ?? "Review recommended next step."),
    status: String(row.band ?? "medium"),
    score: Number(row.score ?? 0),
    confidence: Number(row.confidence ?? 0),
    generated_at: typeof row.calculated_at === "string" ? row.calculated_at : null
  }));

  const mappedForecasts = ((forecasts ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    organization_id: String(row.organization_id),
    location_id: typeof row.location_id === "string" ? row.location_id : null,
    title: String(row.metric_label ?? "Forecast"),
    summary: `Forecast ${formatForecastValue(row.forecast_value)}${row.target_value == null ? "" : ` vs target ${formatForecastValue(row.target_value)}`}`,
    confidence: String(row.confidence ?? "limited"),
    generated_at: typeof row.generated_at === "string" ? row.generated_at : null,
    metric_label: typeof row.metric_label === "string" ? row.metric_label : null,
    forecast_value: typeof row.forecast_value === "number" || typeof row.forecast_value === "string" ? row.forecast_value : null,
    target_value: typeof row.target_value === "number" || typeof row.target_value === "string" ? row.target_value : null
  }));

  const scopedBriefs = ((briefs ?? []) as OperatingRow[]).filter((row) => inAllowedScope(row.location_id, locationIds));
  const scopedInsights = ((insights ?? []) as OperatingRow[]).filter((row) => inAllowedScope(row.location_id, locationIds));
  const scopedRecommendations = ((recommendations ?? []) as OperatingRow[]).filter((row) => inAllowedScope(row.location_id, locationIds));
  const scopedPredictions = mappedPredictions.filter((row) => inAllowedScope(row.location_id, locationIds));
  const scopedForecasts = mappedForecasts.filter((row) => inAllowedScope(row.location_id, locationIds));

  const facts = [
    `${scopedBriefs.length} operating brief(s) are visible in the authorized scope.`,
    `${scopedInsights.length} active proactive insight(s) are visible.`,
    `${scopedPredictions.length} predictive score(s) are visible.`,
    `${scopedRecommendations.length} recommendation(s) are open or pending.`,
    `${scopedForecasts.length} forecast record(s) are loaded.`
  ];

  const topPrediction = scopedPredictions[0];
  const topRecommendation = scopedRecommendations[0];
  const analysis = [
    topPrediction ? `Highest visible risk/opportunity score is ${topPrediction.title} at ${topPrediction.score}/100.` : "No prediction records are visible yet.",
    topRecommendation ? `Top recommendation is ${topRecommendation.title}.` : "No open recommendations are visible yet.",
    "All Phase 16 AI outputs are deterministic, explainable, and advisory-only."
  ];

  return {
    briefs: scopedBriefs,
    insights: scopedInsights,
    predictions: scopedPredictions,
    recommendations: scopedRecommendations,
    forecasts: scopedForecasts,
    facts,
    analysis,
    recommendationsText: [
      "Review recommendations in the CRM before taking any action.",
      `Use normal ${APP_DISPLAY_NAME} workflows for messages, calls, payments, inventory, payroll, clinical, campaigns, and approvals.`
    ],
    trace: {
      tools: ["getAiOperatingSummary", "predictive_scores", "ai_recommendations", "forecast_records", "ai_operating_briefs", "ai_insights"],
      locations: locationIds,
      recordCounts: {
        ai_operating_briefs: scopedBriefs.length,
        ai_insights: scopedInsights.length,
        predictive_scores: scopedPredictions.length,
        ai_recommendations: scopedRecommendations.length,
        forecast_records: scopedForecasts.length
      }
    }
  };
}

export async function getAiOperatingToolSummary(
  supabase: SupabaseClient,
  profile: CurrentProfile,
  selectedLocationId?: string | null
): Promise<AiOperatingToolSummary> {
  const summary = await getAiOperatingSummary(supabase, profile, selectedLocationId);
  return {
    facts: summary.facts,
    analysis: summary.analysis,
    recommendations: summary.recommendationsText,
    trace: summary.trace
  };
}

function formatForecastValue(value: unknown) {
  const number = Number(value ?? 0);
  if (Number.isNaN(number)) return "0";
  return Math.abs(number) >= 1000 ? formatMoney(Math.round(number)) : number.toLocaleString();
}
