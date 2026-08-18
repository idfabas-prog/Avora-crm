export type SegmentOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "does_not_contain"
  | "greater_than"
  | "less_than"
  | "greater_than_or_equal"
  | "less_than_or_equal"
  | "before"
  | "after"
  | "between"
  | "is_empty"
  | "is_not_empty"
  | "in"
  | "not_in"
  | "within_last_days"
  | "more_than_days_ago";

export type SegmentCondition = {
  field: string;
  operator: SegmentOperator;
  value?: unknown;
};

export type SegmentRuleGroup = {
  logic: "and" | "or";
  conditions: Array<SegmentCondition | SegmentRuleGroup>;
};

export type SegmentContactProfile = {
  id: string;
  organizationId?: string;
  locationId?: string | null;
  locationSlug?: string | null;
  status?: string | null;
  leadSource?: string | null;
  tags?: string[];
  assignedUserId?: string | null;
  createdAt?: string | null;
  opportunityStatus?: string | null;
  opportunityValueCents?: number;
  salespersonId?: string | null;
  lastAppointmentAt?: string | null;
  nextAppointmentAt?: string | null;
  appointmentType?: string | null;
  appointmentStatus?: string | null;
  noShowCount?: number;
  lifetimeSales?: number;
  lifetimeCollectedCents?: number;
  outstandingBalanceCents?: number;
  lastPurchaseAt?: string | null;
  purchasedServices?: string[];
  packageRemaining?: number;
  lastTreatmentAt?: string | null;
  treatmentService?: string | null;
  followUpDue?: boolean;
  membershipStatus?: string | null;
  membershipType?: string | null;
  referralCount?: number;
  npsCategory?: string | null;
  feedbackStatus?: string | null;
  marketingSource?: string | null;
  marketingCampaign?: string | null;
  lastInboundAt?: string | null;
  lastOutboundAt?: string | null;
  daysSinceContact?: number;
  unreadConversation?: boolean;
  smsOptedOut?: boolean;
  phone?: string | null;
};

export type SegmentPreviewRow = {
  contactId: string;
  contactName: string;
  locationName: string;
  status: string;
  leadSource: string;
  opportunity: string;
  lastAppointment: string;
  lastContact: string;
  lifetimeCollectedCents: number;
  reasonMatched: string;
};
