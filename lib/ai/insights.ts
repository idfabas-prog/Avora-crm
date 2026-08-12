import type { AiInsight } from "./types";

export function percentChange(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function detectMetricInsight(input: { metric: string; current: number; previous: number; href?: string }): AiInsight | null {
  const change = percentChange(input.current, input.previous);
  const abs = Math.abs(change);
  if (abs < 20) return null;
  return {
    insightType: input.metric,
    severity: abs >= 40 ? "important" : "watch",
    title: `${input.metric} ${change > 0 ? "increased" : "decreased"} ${Math.round(abs)}%`,
    summary: `${input.metric} moved from ${input.previous} to ${input.current}. This is deterministic threshold detection, not a clinical or financial forecast.`,
    evidence: { current: input.current, previous: input.previous, percent_change: change },
    href: input.href
  };
}

export function insightSeverityLabel(severity: AiInsight["severity"]) {
  return severity === "important" ? "Important" : severity === "watch" ? "Watch" : "Info";
}
