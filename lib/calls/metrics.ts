import type { CallCoachingInput, CallMetricRow, CallSummaryMetrics, CallStatus } from "./types";

export function isMissedCall(input: {
  direction: string;
  status: string;
  answeredAt?: string | Date | null;
  queueTimedOut?: boolean;
  afterHours?: boolean;
}) {
  return input.direction === "inbound" && (
    ["missed", "no_answer", "voicemail"].includes(input.status)
    || (!input.answeredAt && ["completed", "cancelled"].includes(input.status))
    || input.queueTimedOut === true
    || input.afterHours === true
  );
}

export function isAnsweredStatus(status: CallStatus | string) {
  return ["answered", "completed"].includes(status);
}

export function safeRate(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return numerator / denominator;
}

export function average(values: Array<number | null | undefined>) {
  const finite = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!finite.length) return 0;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

export function netCallRevenueCents(rows: Array<Pick<CallMetricRow, "revenueCents" | "refundCents">>) {
  return rows.reduce((sum, row) => sum + Math.max(0, row.revenueCents ?? 0) - Math.max(0, row.refundCents ?? 0), 0);
}

export function callSummaryMetrics(rows: CallMetricRow[]): CallSummaryMetrics {
  const inbound = rows.filter((row) => row.direction === "inbound");
  const outbound = rows.filter((row) => row.direction === "outbound");
  const answered = rows.filter((row) => isAnsweredStatus(row.status));
  const inboundAnswered = inbound.filter((row) => isAnsweredStatus(row.status));
  const missed = rows.filter((row) => row.direction === "inbound" && ["missed", "no_answer", "voicemail"].includes(row.status));
  const connected = rows.filter((row) => isAnsweredStatus(row.status));
  const booked = rows.filter((row) => row.booked);
  const sold = rows.filter((row) => row.saleAttributed);
  const completedCallbacks = rows.filter((row) => ["connected", "booked", "closed"].includes(row.callbackStatus ?? ""));
  const netRevenue = netCallRevenueCents(rows);

  return {
    totalCalls: rows.length,
    inboundCalls: inbound.length,
    outboundCalls: outbound.length,
    answeredCalls: answered.length,
    missedCalls: missed.length,
    answerRate: safeRate(inboundAnswered.length, inbound.length),
    missedRate: safeRate(missed.length, inbound.length),
    averageHandleSeconds: average(rows.map((row) => row.durationSeconds)),
    averageRingSeconds: average(rows.map((row) => row.ringDurationSeconds)),
    callbacksCompleted: completedCallbacks.length,
    bookedCalls: booked.length,
    bookingRate: safeRate(booked.length, connected.length),
    sales: sold.length,
    saleRate: safeRate(sold.length, connected.length),
    netRevenueCents: netRevenue,
    revenuePerCallCents: rows.length ? Math.round(netRevenue / rows.length) : 0
  };
}

export function callbackPriority(input: {
  missed: boolean;
  hasOpportunity?: boolean;
  lifetimeValueCents?: number | null;
  minutesSinceCall?: number;
  priorAttempts?: number;
}) {
  let score = input.missed ? 50 : 10;
  if (input.hasOpportunity) score += 15;
  if ((input.lifetimeValueCents ?? 0) >= 1000000) score += 15;
  if ((input.minutesSinceCall ?? 0) <= 30) score += 10;
  score -= Math.min(input.priorAttempts ?? 0, 4) * 5;
  return Math.max(0, Math.min(100, score));
}

export function queueOverflowNeeded(input: { waitSeconds: number; maxWaitSeconds?: number | null; voicemailEnabled?: boolean }) {
  return typeof input.maxWaitSeconds === "number" && input.waitSeconds > input.maxWaitSeconds && input.voicemailEnabled !== true;
}

export function nextQueueMember<T extends { active: boolean; available: boolean; priority: number; lastAnsweredAt?: string | null }>(members: T[]) {
  return [...members]
    .filter((member) => member.active && member.available)
    .sort((a, b) => a.priority - b.priority || new Date(a.lastAnsweredAt ?? 0).getTime() - new Date(b.lastAnsweredAt ?? 0).getTime())[0] ?? null;
}

export function providerCallIdempotencyKey(provider: string, providerCallId: string) {
  return `${provider}:${providerCallId}`.toLowerCase();
}

export function callbackTaskIdempotencyKey(callId: string) {
  return `missed-call-callback:${callId}`;
}

export function callListNextMember<T extends { status: string; orderIndex: number }>(members: T[]) {
  return [...members]
    .filter((member) => member.status === "pending")
    .sort((a, b) => a.orderIndex - b.orderIndex)[0] ?? null;
}

export function deterministicCallScore(input: CallCoachingInput) {
  const transcript = input.transcriptText.toLowerCase();
  const checks = [
    transcript.includes("schedule") || transcript.includes("book") || input.bookedAppointment === true,
    transcript.includes("financing") || transcript.includes("price") || transcript.includes("cost"),
    transcript.includes("follow up") || input.followUpCreated === true,
    transcript.includes("question") || transcript.includes("answer"),
    ["Booked Appointment", "Follow-Up Needed"].includes(input.disposition ?? "")
  ];
  const achieved = checks.filter(Boolean).length;
  return {
    score: Math.round((achieved / checks.length) * 100),
    factors: {
      appointmentAskedFor: checks[0],
      objectionOrQuestionAddressed: checks[1],
      followUpCreated: checks[2],
      keyQuestionsAnswered: checks[3],
      clearDisposition: checks[4]
    }
  };
}
