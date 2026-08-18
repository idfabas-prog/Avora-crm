import type { AiMode, AiTrace } from "./types";
import { AI_ASSISTANT_DISPLAY_NAME } from "../config/branding.ts";

const featureLabels: Record<string, string> = {
  owner_analytics: "Business Performance",
  operating_system: "AI Operating System",
  accounting_close: "Accounting & Close",
  gohighlevel_integration: "GoHighLevel Integration",
  expansion_intelligence: "Expansion Intelligence",
  executive_command: "Executive Command",
  call_intelligence: "Call Intelligence",
  sales_coaching: "Sales Coaching",
  marketing_performance: "Marketing Performance",
  campaign_intelligence: "Campaign Intelligence",
  inventory_performance: "Inventory & COGS",
  workforce_performance: "Workforce Performance",
  reputation_growth: "Reputation & Referrals",
  portal_revenue: "Portal & Memberships",
  workflow_performance: "Workflow Performance",
  lead_scoring: "Lead Prioritization",
  conversation_summary: "Conversation Summary",
  suggest_reply: "Suggested Reply",
  insights: "AI Insights",
  contact_summary: "Contact Summary"
};

const featureToggleLabels: Record<string, string> = {
  ask_avora: AI_ASSISTANT_DISPLAY_NAME,
  owner_brief: "Owner Brief",
  operating_system: "AI Operating System",
  executive_command: "Executive Command",
  expansion_intelligence: "Expansion Intelligence",
  accounting_close: "Accounting & Close",
  gohighlevel_integration: "GoHighLevel Integration",
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
  no_shows: "No-Shows",
  campaign_rows: "Campaign Rows",
  source_rows: "Source Rows",
  inventory_lots: "Inventory Lots",
  low_stock_items: "Low Stock Items",
  expiring_lots: "Expiring Lots",
  purchase_orders: "Purchase Orders",
  usage_rows: "Usage Rows",
  staff_shifts: "Staff Shifts",
  time_entries: "Time Entries",
  pto_requests: "PTO Requests",
  attendance_exceptions: "Attendance Exceptions",
  labor_cost_records: "Labor Cost Records",
  review_requests: "Review Requests",
  feedback_responses: "Feedback Responses",
  feedback_escalations: "Feedback Escalations",
  referrals: "Referrals",
  reactivation_campaigns: "Reactivation Campaigns",
  loyalty_snapshots: "Loyalty Snapshots",
  location_scorecards: "Location Scorecards",
  executive_alerts: "Executive Alerts",
  executive_targets: "Executive Targets",
  forecasts: "Forecasts",
  lifecycle_campaigns: "Lifecycle Campaigns",
  campaign_recipients: "Campaign Recipients",
  segments: "Segments",
  suppression_lists: "Suppression Lists",
  campaign_jobs: "Campaign Jobs",
  calls: "Calls",
  missed_calls: "Missed Calls",
  ai_operating_briefs: "AI Operating Briefs",
  ai_insights: "AI Insights",
  predictive_scores: "Predictive Scores",
  ai_recommendations: "AI Recommendations",
  forecast_records: "Forecast Records",
  expansion_projects: "Expansion Projects",
  expansion_sites: "Expansion Sites",
  regions: "Regions",
  territories: "Territories",
  operating_entities: "Operating Entities",
  brand_audits: "Brand Audits",
  expansion_alerts: "Expansion Alerts",
  ramp_metrics: "Ramp Metrics",
  accounting_connections: "Accounting Connections",
  accounting_export_batches: "Accounting Export Batches",
  accounting_exceptions: "Accounting Exceptions",
  processor_reconciliation_records: "Processor Reconciliation Records",
  accounting_close_items: "Accounting Close Items",
  accounting_unmapped_locations: "Unmapped Accounting Locations",
  ghl_connections: "GoHighLevel Connections",
  external_record_mappings: "External Record Mappings",
  ghl_sync_runs: "GoHighLevel Sync Runs",
  ghl_webhook_events: "GoHighLevel Webhook Events",
  ghl_sync_exceptions: "GoHighLevel Exceptions",
  royalty_records: "Royalty Records",
  management_fee_records: "Management Fee Records",
  cogs_usage_rows: "COGS Usage Rows"
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
  if (feature === "operating_system") {
    return ["What needs attention today?", "Show no-show risk", "What are our revenue opportunities?"];
  }
  if (feature === "executive_command") {
    return ["Which location needs attention?", "Are we on track for target?", "Which clinic has the best contribution margin?"];
  }
  if (feature === "expansion_intelligence") {
    return ["Which expansion is most at risk?", "Which proposed site looks stronger?", "Are we on track to open Hollywood?"];
  }
  if (feature === "accounting_close") {
    return ["Are we ready to close the month?", "Which payments are unreconciled?", "Is the journal preview balanced?"];
  }
  if (feature === "sales_coaching") {
    return ["Which salesperson needs follow-up help?", "Show overdue follow-ups", "Compare close rates this month"];
  }
  if (feature === "workflow_performance") {
    return ["Which workflow is underperforming?", "Show workflow failures", "What should we improve first?"];
  }
  if (feature === "marketing_performance") {
    return ["Which campaign has the best ROAS?", "Compare Google vs Meta", "What is our CPL this month?"];
  }
  if (feature === "campaign_intelligence") {
    return ["Which segment should we launch next?", "Show skipped campaign recipients", "Which variant is winning?"];
  }
  if (feature === "call_intelligence") {
    return ["How many calls did Miami miss today?", "Who handled the most calls?", "How much revenue came from phone calls?"];
  }
  if (feature === "inventory_performance") {
    return ["What needs reorder?", "Which lots expire soon?", "Show gross profit by service"];
  }
  if (feature === "workforce_performance") {
    return ["Who is clocked in?", "Show overtime risk", "What PTO needs review?"];
  }
  if (feature === "reputation_growth") {
    return ["What is our NPS this month?", "Who are our top referrers?", "Which patients should we reactivate first?"];
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
