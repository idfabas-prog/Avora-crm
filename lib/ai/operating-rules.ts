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
  if ((input.unpaidBalanceCents ?? 0) >= 100_000) factors.push({ label: "Meaningful balance due", points: 28, evidence: `${input.unpaidBalanceCents ?? 0} cents` });
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
