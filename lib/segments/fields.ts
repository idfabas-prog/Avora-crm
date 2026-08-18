import type { SegmentContactProfile } from "./types";

export type SegmentField = {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "date" | "string_array";
  read: (profile: SegmentContactProfile) => unknown;
};

export const segmentFields: SegmentField[] = [
  { key: "created_at", label: "Created Date", type: "date", read: (profile) => profile.createdAt },
  { key: "location_id", label: "Location", type: "string", read: (profile) => profile.locationId },
  { key: "location_slug", label: "Location Slug", type: "string", read: (profile) => profile.locationSlug },
  { key: "status", label: "Contact Status", type: "string", read: (profile) => profile.status },
  { key: "lead_source", label: "Lead Source", type: "string", read: (profile) => profile.leadSource },
  { key: "tags", label: "Tags", type: "string_array", read: (profile) => profile.tags ?? [] },
  { key: "assigned_user_id", label: "Assigned User", type: "string", read: (profile) => profile.assignedUserId },
  { key: "opportunity_status", label: "Opportunity Status", type: "string", read: (profile) => profile.opportunityStatus },
  { key: "opportunity_value_cents", label: "Opportunity Value", type: "number", read: (profile) => profile.opportunityValueCents ?? 0 },
  { key: "salesperson_id", label: "Salesperson", type: "string", read: (profile) => profile.salespersonId },
  { key: "last_appointment_at", label: "Last Appointment", type: "date", read: (profile) => profile.lastAppointmentAt },
  { key: "next_appointment_at", label: "Next Appointment", type: "date", read: (profile) => profile.nextAppointmentAt },
  { key: "appointment_type", label: "Appointment Type", type: "string", read: (profile) => profile.appointmentType },
  { key: "appointment_status", label: "Appointment Status", type: "string", read: (profile) => profile.appointmentStatus },
  { key: "last_appointment_days", label: "Days Since Last Appointment", type: "number", read: (profile) => daysSince(profile.lastAppointmentAt) },
  { key: "no_show_count", label: "No-Show Count", type: "number", read: (profile) => profile.noShowCount ?? 0 },
  { key: "lifetime_sales", label: "Lifetime Sales", type: "number", read: (profile) => profile.lifetimeSales ?? 0 },
  { key: "lifetime_collected_cents", label: "Lifetime Collected", type: "number", read: (profile) => profile.lifetimeCollectedCents ?? 0 },
  { key: "outstanding_balance_cents", label: "Outstanding Balance", type: "number", read: (profile) => profile.outstandingBalanceCents ?? 0 },
  { key: "last_purchase_at", label: "Last Purchase Date", type: "date", read: (profile) => profile.lastPurchaseAt },
  { key: "purchased_services", label: "Purchased Services", type: "string_array", read: (profile) => profile.purchasedServices ?? [] },
  { key: "package_remaining", label: "Package Remaining", type: "number", read: (profile) => profile.packageRemaining ?? 0 },
  { key: "last_treatment_at", label: "Last Treatment Date", type: "date", read: (profile) => profile.lastTreatmentAt },
  { key: "treatment_service", label: "Treatment Service", type: "string", read: (profile) => profile.treatmentService },
  { key: "follow_up_due", label: "Follow-Up Due", type: "boolean", read: (profile) => Boolean(profile.followUpDue) },
  { key: "membership_status", label: "Membership Status", type: "string", read: (profile) => profile.membershipStatus },
  { key: "membership_type", label: "Membership Type", type: "string", read: (profile) => profile.membershipType },
  { key: "referral_count", label: "Referral Count", type: "number", read: (profile) => profile.referralCount ?? 0 },
  { key: "nps_category", label: "NPS Category", type: "string", read: (profile) => profile.npsCategory },
  { key: "feedback_status", label: "Feedback Status", type: "string", read: (profile) => profile.feedbackStatus },
  { key: "marketing_source", label: "Marketing Source", type: "string", read: (profile) => profile.marketingSource },
  { key: "marketing_campaign", label: "Marketing Campaign", type: "string", read: (profile) => profile.marketingCampaign },
  { key: "last_inbound_at", label: "Last Inbound Message", type: "date", read: (profile) => profile.lastInboundAt },
  { key: "last_outbound_at", label: "Last Outbound Message", type: "date", read: (profile) => profile.lastOutboundAt },
  { key: "days_since_contact", label: "Days Since Contact", type: "number", read: (profile) => profile.daysSinceContact ?? daysSince(profile.lastInboundAt ?? profile.lastOutboundAt) },
  { key: "unread_conversation", label: "Unread Conversation", type: "boolean", read: (profile) => Boolean(profile.unreadConversation) },
  { key: "phone", label: "Phone", type: "string", read: (profile) => profile.phone },
  { key: "sms_opted_out", label: "SMS Opt-Out", type: "boolean", read: (profile) => Boolean(profile.smsOptedOut) }
];

export const segmentFieldMap = new Map(segmentFields.map((field) => [field.key, field]));

export const segmentOperators = [
  "equals",
  "not_equals",
  "contains",
  "does_not_contain",
  "greater_than",
  "less_than",
  "greater_than_or_equal",
  "less_than_or_equal",
  "before",
  "after",
  "between",
  "is_empty",
  "is_not_empty",
  "in",
  "not_in",
  "within_last_days",
  "more_than_days_ago"
] as const;

export function daysSince(value: string | null | undefined, now = new Date()) {
  if (!value) return 99999;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 99999;
  return Math.max(0, Math.floor((now.getTime() - time) / 86400000));
}
