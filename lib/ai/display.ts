import type { AiMode, AiTrace } from "./types";

const featureLabels: Record<string, string> = {
  owner_analytics: "Business Performance",
  sales_coaching: "Sales Coaching",
  workflow_performance: "Workflow Performance",
  lead_scoring: "Lead Prioritization",
  conversation_summary: "Conversation Summary",
  suggest_reply: "Suggested Reply",
  insights: "AI Insights",
  contact_summary: "Contact Summary"
};

const featureToggleLabels: Record<string, string> = {
  ask_avora: "Ask Avora",
  owner_brief: "Owner Brief",
  conversation_summary: "Conversation Summary",
  suggested_replies: "Suggested Replies",
  lead_scoring: "Lead Scoring",
  follow_up_recommendations: "Follow-Up Recommendations",
  sales_coaching: "Sales Coaching",
  insights: "Insights"
};

const recordLabels: Record<string, string> = {
  completed_appointments: "Completed Appointments",
  workflow_enrollments: "Workflow Enrollments",
  no_shows: "No-Shows"
};

export function humanFeatureLabel(feature: string) {
  return featureLabels[feature] ?? titleize(feature);
}

export function humanFeatureToggleLabel(feature: string) {
  return featureToggleLabels[feature] ?? titleize(feature);
}

export function aiModeLabel(mode: AiMode) {
  if (mode === "development") return "Development AI";
  if (mode === "enabled") return "Live AI";
  return "AI Disabled";
}

export function aiStatusMessage(mode: AiMode, configured: boolean) {
  if (mode === "development") return "Development Mode Active";
  if (mode === "enabled" && !configured) return "OpenAI key required for live AI";
  if (mode === "enabled") return "Live OpenAI Ready";
  return "AI Disabled";
}

export function describeLocationScope(trace: Pick<AiTrace, "locations">) {
  if (trace.locations.length === 0) return "All allowed locations";
  if (trace.locations.length === 1) return "Selected location";
  return "All allowed locations";
}

export function sourceRows(trace: AiTrace) {
  return Object.entries(trace.recordCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => `${count} ${recordLabels[key] ?? titleize(key)}`);
}

export function metricLabelsFromAnswer(text: string) {
  const metrics = [
    ["collected", "Collected Revenue"],
    ["net collected", "Net Collected"],
    ["outstanding", "Outstanding Balance"],
    ["show rate", "Show Rate"],
    ["close rate", "Close Rate"],
    ["average ticket", "Average Ticket"],
    ["lead", "Leads"],
    ["appointment", "Appointments"],
    ["refund", "Refunds"]
  ];
  const lower = text.toLowerCase();
  return metrics
    .filter(([needle]) => lower.includes(needle))
    .map(([, label]) => label);
}

export function contextualFollowUps(feature: string) {
  if (feature === "sales_coaching") {
    return ["Which salesperson needs follow-up help?", "Show overdue follow-ups", "Compare close rates this month"];
  }
  if (feature === "workflow_performance") {
    return ["Which workflow is underperforming?", "Show workflow failures", "What should we improve first?"];
  }
  if (feature === "lead_scoring") {
    return ["Which leads should we follow up with today?", "Show hot leads", "Show unassigned high-value leads"];
  }
  return ["Compare to yesterday", "Break down by location", "Show salesperson performance", "Show follow-up priorities"];
}

export function zeroDataContext(facts: string[]) {
  const hasZeroRevenue = facts.some((fact) => /\$0\b/.test(fact) && /collected|revenue/i.test(fact));
  return hasZeroRevenue
    ? "No successful payments are recorded for this period in the selected location scope. Seeded or prior activity may still exist outside this date range."
    : null;
}

function titleize(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
