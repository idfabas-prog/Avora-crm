import type { CurrentProfile } from "@/lib/auth/profile";
import type { SupabaseClient } from "@supabase/supabase-js";
import { callSummaryMetrics, isMissedCall } from "./metrics";
import type { CallMetricRow } from "./types";

type SupabaseLike = SupabaseClient;

export type CallRow = {
  id: string;
  organization_id: string;
  location_id: string | null;
  contact_id: string | null;
  campaign_id: string | null;
  marketing_source_id: string | null;
  direction: "inbound" | "outbound";
  status: string;
  disposition: string | null;
  started_at: string | null;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  ring_duration_seconds: number | null;
  from_number: string | null;
  to_number: string | null;
  assigned_user_id: string | null;
  handled_by_user_id: string | null;
  queue_id: string | null;
  recording_id: string | null;
  voicemail_id: string | null;
  transcript_status: string | null;
  metadata: Record<string, unknown> | null;
  locations?: { name: string } | { name: string }[] | null;
  contacts?: { first_name: string; last_name: string; phone: string | null; email: string | null } | { first_name: string; last_name: string; phone: string | null; email: string | null }[] | null;
  handled_by?: { full_name: string } | { full_name: string }[] | null;
  assigned_user?: { full_name: string } | { full_name: string }[] | null;
  call_queues?: { name: string } | { name: string }[] | null;
  marketing_sources?: { name: string } | { name: string }[] | null;
  marketing_campaigns?: { name: string } | { name: string }[] | null;
};

export type MissedCallbackRow = {
  id: string;
  call_id: string;
  status: string;
  priority: number;
  due_at: string | null;
  last_follow_up_at: string | null;
  assigned_to: string | null;
  assigned_user?: { full_name: string } | { full_name: string }[] | null;
};

export type CallDashboardReport = {
  calls: CallRow[];
  missedCallbacks: MissedCallbackRow[];
  metrics: ReturnType<typeof callSummaryMetrics>;
  byLocation: Array<{ id: string; name: string; metrics: ReturnType<typeof callSummaryMetrics> }>;
  byStaff: Array<{ id: string; name: string; metrics: ReturnType<typeof callSummaryMetrics> }>;
  bySource: Array<{ id: string; name: string; metrics: ReturnType<typeof callSummaryMetrics> }>;
  missedCalls: CallRow[];
  activeCalls: CallRow[];
};

function firstRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function metricRows(calls: CallRow[]): CallMetricRow[] {
  return calls.map((call) => ({
    id: call.id,
    locationId: call.location_id,
    locationName: firstRelation(call.locations)?.name ?? null,
    staffId: call.handled_by_user_id ?? call.assigned_user_id,
    staffName: firstRelation(call.handled_by)?.full_name ?? firstRelation(call.assigned_user)?.full_name ?? null,
    campaignId: call.campaign_id,
    campaignName: firstRelation(call.marketing_campaigns)?.name ?? null,
    sourceId: call.marketing_source_id,
    sourceName: firstRelation(call.marketing_sources)?.name ?? null,
    direction: call.direction,
    status: call.status as CallMetricRow["status"],
    durationSeconds: call.duration_seconds,
    ringDurationSeconds: call.ring_duration_seconds,
    booked: Boolean(call.metadata?.booked || call.metadata?.booking_attribution),
    saleAttributed: Boolean(call.metadata?.sale_attribution),
    revenueCents: call.metadata?.sale_attribution ? 650000 : 0,
    refundCents: 0
  }));
}

function groupMetrics<T extends { id: string | null; name: string | null }>(rows: CallMetricRow[], getKey: (row: CallMetricRow) => T) {
  const grouped = new Map<string, { id: string; name: string; rows: CallMetricRow[] }>();
  for (const row of rows) {
    const key = getKey(row);
    if (!key.id) continue;
    const existing = grouped.get(key.id) ?? { id: key.id, name: key.name ?? "Unassigned", rows: [] };
    existing.rows.push(row);
    grouped.set(key.id, existing);
  }
  return [...grouped.values()].map((entry) => ({ id: entry.id, name: entry.name, metrics: callSummaryMetrics(entry.rows) }));
}

export async function getCallDashboardReport(
  supabase: SupabaseLike,
  profile: Pick<CurrentProfile, "organizationId">,
  locationIds: string[]
): Promise<CallDashboardReport> {
  let callsQuery = supabase
    .from("calls")
    .select(`
      id, organization_id, location_id, contact_id, campaign_id, marketing_source_id, direction, status, disposition,
      started_at, answered_at, ended_at, duration_seconds, ring_duration_seconds, from_number, to_number,
      assigned_user_id, handled_by_user_id, queue_id, recording_id, voicemail_id, transcript_status, metadata,
      locations(name),
      contacts(first_name, last_name, phone, email),
      assigned_user:user_profiles!calls_assigned_user_id_fkey(full_name),
      handled_by:user_profiles!calls_handled_by_user_id_fkey(full_name),
      call_queues(name),
      marketing_sources(name),
      marketing_campaigns(name)
    `)
    .eq("organization_id", profile.organizationId);

  if (locationIds.length > 0) {
    callsQuery = callsQuery.in("location_id", locationIds);
  }

  const { data: calls } = await callsQuery.order("started_at", { ascending: false });
  const rows = calls ?? [];
  const metricsRows = metricRows(rows);
  const missedCalls = rows.filter((call) => isMissedCall({ direction: call.direction, status: call.status, answeredAt: call.answered_at, queueTimedOut: call.metadata?.queue_timed_out === true }));
  const activeCalls = rows.filter((call) => ["initiated", "queued", "ringing", "answered"].includes(call.status));

  const { data: callbacks } = await supabase
    .from("missed_call_callbacks")
    .select("id, call_id, status, priority, due_at, last_follow_up_at, assigned_to, assigned_user:user_profiles!missed_call_callbacks_assigned_to_fkey(full_name)")
    .eq("organization_id", profile.organizationId)
    .order("priority", { ascending: false });

  return {
    calls: rows,
    missedCallbacks: (callbacks ?? []) as MissedCallbackRow[],
    metrics: callSummaryMetrics(metricsRows),
    byLocation: groupMetrics(metricsRows, (row) => ({ id: row.locationId ?? null, name: row.locationName ?? null })),
    byStaff: groupMetrics(metricsRows, (row) => ({ id: row.staffId ?? null, name: row.staffName ?? null })),
    bySource: groupMetrics(metricsRows, (row) => ({ id: row.sourceId ?? null, name: row.sourceName ?? null })),
    missedCalls,
    activeCalls
  };
}

export async function getCallById(supabase: SupabaseLike, organizationId: string, callId: string) {
  const { data } = await supabase
    .from("calls")
    .select(`
      id, organization_id, location_id, contact_id, campaign_id, marketing_source_id, direction, status, disposition,
      started_at, answered_at, ended_at, duration_seconds, ring_duration_seconds, from_number, to_number,
      assigned_user_id, handled_by_user_id, queue_id, recording_id, voicemail_id, transcript_status, metadata,
      locations(name),
      contacts(first_name, last_name, phone, email),
      assigned_user:user_profiles!calls_assigned_user_id_fkey(full_name),
      handled_by:user_profiles!calls_handled_by_user_id_fkey(full_name),
      call_queues(name),
      marketing_sources(name),
      marketing_campaigns(name)
    `)
    .eq("organization_id", organizationId)
    .eq("id", callId)
    .order("started_at", { ascending: false });
  return (data?.[0] as CallRow | undefined) ?? null;
}

export function relationName<T extends { name: string }>(value: T | T[] | null | undefined) {
  return firstRelation(value)?.name ?? "Unassigned";
}

export function personName<T extends { full_name: string }>(value: T | T[] | null | undefined) {
  return firstRelation(value)?.full_name ?? "Unassigned";
}

export function contactName(call: Pick<CallRow, "contacts">) {
  const contact = firstRelation(call.contacts);
  return contact ? `${contact.first_name} ${contact.last_name}` : "Unknown caller";
}
