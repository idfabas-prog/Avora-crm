import type { CurrentProfile } from "@/lib/auth/profile";
import type { SupabaseClient } from "@supabase/supabase-js";
import { callSummaryMetrics } from "@/lib/calls/metrics";
import type { CallMetricRow } from "@/lib/calls/types";

type SupabaseLike = SupabaseClient;

type AiToolResult = {
  facts: string[];
  analysis: string[];
  recommendations: string[];
  trace: { tools: string[]; locations: string[]; recordCounts: Record<string, number> };
};

type CallToolRow = {
  id: string;
  location_id: string | null;
  direction: "inbound" | "outbound";
  status: CallMetricRow["status"];
  duration_seconds: number | null;
  ring_duration_seconds: number | null;
  metadata: Record<string, unknown> | null;
};

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function rowsToMetrics(rows: CallToolRow[]) {
  return callSummaryMetrics(rows.map((row) => ({
    id: row.id,
    locationId: row.location_id,
    direction: row.direction,
    status: row.status,
    durationSeconds: row.duration_seconds,
    ringDurationSeconds: row.ring_duration_seconds,
    booked: Boolean(row.metadata?.booked || row.metadata?.booking_attribution),
    saleAttributed: Boolean(row.metadata?.sale_attribution),
    revenueCents: row.metadata?.sale_attribution ? 650000 : 0,
    refundCents: 0
  })));
}

export async function getCallSummary(supabase: SupabaseLike, profile: Pick<CurrentProfile, "organizationId">, locationIds: string[], question = ""): Promise<AiToolResult> {
  let query = supabase
    .from("calls")
    .select("id, location_id, direction, status, duration_seconds, ring_duration_seconds, metadata")
    .eq("organization_id", profile.organizationId);
  if (locationIds.length > 0) query = query.in("location_id", locationIds);
  const { data } = await query.order("started_at", { ascending: false });
  const rows = (data ?? []) as CallToolRow[];
  const metrics = rowsToMetrics(rows);
  const missedContext = question.toLowerCase().includes("miss");
  const revenueContext = question.toLowerCase().includes("revenue") || question.toLowerCase().includes("money");

  return {
    facts: [
      `${metrics.totalCalls} calls are visible in the selected location scope.`,
      `${metrics.inboundCalls} inbound and ${metrics.outboundCalls} outbound calls are visible.`,
      `${metrics.missedCalls} inbound calls are currently classified as missed.`,
      `Call-attributed net collected revenue is $${(metrics.netRevenueCents / 100).toFixed(2)}.`
    ],
    analysis: [
      `Answer rate is ${pct(metrics.answerRate)} and missed-call rate is ${pct(metrics.missedRate)}.`,
      `Booking rate from connected calls is ${pct(metrics.bookingRate)}.`,
      revenueContext ? "Revenue is based on explicit call attribution snapshots, not unpaid booked value." : "Call conversion uses deterministic demo metadata and attribution rows.",
      missedContext ? "Missed calls include inbound no-answer, voicemail, queue-timeout, and explicit missed statuses." : "AI can summarize calls, but it cannot place calls or change dispositions automatically."
    ],
    recommendations: [
      metrics.missedCalls > 0 ? "Review the callback queue and assign the highest-priority missed calls first." : "Keep monitoring missed-call rate by location.",
      "Use human review for disposition changes, follow-up tasks, and any live outreach."
    ],
    trace: { tools: ["getCallSummary"], locations: locationIds, recordCounts: { calls: rows.length, missed_calls: metrics.missedCalls } }
  };
}

export const getMissedCallSummary = getCallSummary;
export const getCallCenterPerformance = getCallSummary;
export const getStaffCallPerformance = getCallSummary;
export const getQueuePerformance = getCallSummary;
export const getCallConversionSummary = getCallSummary;
export const getCallRevenueSummary = getCallSummary;
export const getCallSourcePerformance = getCallSummary;
