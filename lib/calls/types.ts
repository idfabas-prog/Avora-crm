export const callDirections = ["inbound", "outbound"] as const;
export const callStatuses = ["initiated", "queued", "ringing", "answered", "completed", "missed", "failed", "busy", "no_answer", "voicemail", "cancelled"] as const;
export const callbackStatuses = ["new", "assigned", "called_back", "connected", "booked", "closed"] as const;
export const queueStrategies = ["round_robin", "longest_idle", "simultaneous", "priority_order", "manual_assignment"] as const;
export const callListMemberStatuses = ["pending", "called", "connected", "no_answer", "skipped", "completed"] as const;

export type CallDirection = (typeof callDirections)[number];
export type CallStatus = (typeof callStatuses)[number];
export type CallbackStatus = (typeof callbackStatuses)[number];
export type QueueStrategy = (typeof queueStrategies)[number];
export type CallListMemberStatus = (typeof callListMemberStatuses)[number];

export type CallPermission =
  | "calls.read"
  | "calls.make"
  | "calls.answer"
  | "calls.manage"
  | "calls.queues.read"
  | "calls.queues.manage"
  | "calls.recordings.read"
  | "calls.transcripts.read"
  | "calls.ai_summary"
  | "calls.analytics.read"
  | "calls.settings.manage"
  | "calls.dispositions.manage"
  | "calls.scripts.manage";

export type CallMetricRow = {
  id?: string;
  locationId?: string | null;
  locationName?: string | null;
  staffId?: string | null;
  staffName?: string | null;
  campaignId?: string | null;
  campaignName?: string | null;
  sourceId?: string | null;
  sourceName?: string | null;
  direction: CallDirection;
  status: CallStatus;
  durationSeconds?: number | null;
  ringDurationSeconds?: number | null;
  booked?: boolean;
  saleAttributed?: boolean;
  revenueCents?: number | null;
  refundCents?: number | null;
  callbackStatus?: CallbackStatus | null;
};

export type CallSummaryMetrics = {
  totalCalls: number;
  inboundCalls: number;
  outboundCalls: number;
  answeredCalls: number;
  missedCalls: number;
  answerRate: number;
  missedRate: number;
  averageHandleSeconds: number;
  averageRingSeconds: number;
  callbacksCompleted: number;
  bookedCalls: number;
  bookingRate: number;
  sales: number;
  saleRate: number;
  netRevenueCents: number;
  revenuePerCallCents: number;
};

export type CallCoachingInput = {
  transcriptText: string;
  disposition?: string | null;
  followUpCreated?: boolean;
  bookedAppointment?: boolean;
};
