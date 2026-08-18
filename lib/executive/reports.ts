import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentProfile } from "@/lib/auth/profile";
import { allowedLocationIds } from "@/lib/crm/location";
import { aggregateKpis, buildBenchmarks, calculateTrend, contributionBeforeOverhead, emptyKpis, executiveDateRange, executiveScore, expansionReadiness, forecastConfidence, percent, runRateForecast, safeDivide, scoreComponent, scoreTarget } from "./metrics";
import { assertExecutivePermission } from "./permissions";
import type { ExecutiveAlert, ExecutiveKpis, ExecutivePeriod, ExecutiveReport, LocationScorecard, TargetRow } from "./types";

type Relation<T> = T | T[] | null;
type LocationRow = { id: string; name: string; slug: string };
type LocationRelation = Relation<{ name: string | null }>;
type SaleRow = { id: string; location_id: string | null; salesperson_id: string | null; status: string | null; total_amount_cents: number | null; paid_amount_cents: number | null; refunded_amount_cents: number | null; balance_due_cents: number | null; sale_date: string };
type PaymentRow = { location_id: string | null; amount_cents: number | null; received_at: string; status: string | null };
type AppointmentRow = { location_id: string | null; provider_id: string | null; status: string | null; start_at: string; end_at: string };
type ContactRow = { location_id: string | null; created_at: string };
type MarketingSpendRow = { location_id: string | null; spend_cents: number | null; leads: number | null; spend_date: string };
type TreatmentSessionRow = { location_id: string | null; provider_id: string | null; service_id: string | null; status: string | null; documentation_status: string | null; scheduled_at: string | null; completed_at: string | null };
type TreatmentFollowupRow = { location_id: string | null; status: string | null; due_at: string };
type ConsentRecordRow = { location_id: string | null; status: string | null; created_at: string };
type TreatmentUsageRow = { location_id: string | null; total_cost_cents: number | null; created_at: string };
type InventoryLotRow = { location_id: string | null; quantity_available: number | string | null; cost_per_unit_cents: number | null; expiration_date: string | null; status: string | null };
type InventoryAlertRow = { location_id: string | null; status: string | null; alert_type: string | null };
type InventoryEventRow = { location_id: string | null; quantity: number | string | null; unit_cost_cents: number | null; event_type: string | null; created_at: string };
type PurchaseOrderRow = { location_id: string | null; status: string | null };
type StaffShiftRow = { location_id: string | null; status: string | null; shift_date: string };
type TimeEntryRow = { location_id: string | null; status: string | null; clock_in_at: string; clock_out_at: string | null; worked_minutes: number | null };
type AttendanceExceptionRow = { location_id: string | null; status: string | null; exception_type: string | null };
type PtoRequestRow = { location_id: string | null; status: string | null; start_date: string; end_date: string };
type LaborCostRow = { location_id: string | null; regular_minutes: number | null; overtime_minutes: number | null; pto_minutes: number | null; total_cost_cents: number | null; pay_periods: Relation<{ start_date: string | null; end_date: string | null }> };
type ReviewRequestRow = { location_id: string | null; status: string | null; created_at: string };
type FeedbackResponseRow = { location_id: string | null; score: number | null; rating: number | null; submitted_at: string };
type FeedbackEscalationRow = { location_id: string | null; status: string | null; created_at: string };
type ExternalReviewRow = { location_id: string | null; rating: number | null; review_date: string };
type ReferralRow = { location_id: string | null; status: string | null; sale_id: string | null; sales: Relation<{ paid_amount_cents: number | null }>; lead_created_at: string };
type ReactivationCampaignRow = { status: string | null; contacts_targeted: number | null; contacts_reactivated: number | null; bookings_generated: number | null; sales_generated: number | null; collected_revenue_cents: number | null };
type LoyaltyRow = { location_id: string | null; loyalty_status: string | null; months_since_last_visit: number | null };
type MembershipRow = { status: string | null; created_at: string; membership_plans: Relation<{ price_cents?: number | null; monthly_price_cents?: number | null }> };
type ExecutiveAlertRow = { id: string; location_id: string | null; alert_type: string; severity: ExecutiveAlert["severity"]; title: string; summary: string; status: ExecutiveAlert["status"]; identity_key: string; generated_at: string; locations: LocationRelation };
type SavedViewRow = { id: string; name: string; view_type: string; filters_json: Record<string, unknown>; shared: boolean };
type WeightRow = { category: string; weight: number | string; active: boolean };
type OperatingProfileRow = { location_id: string; maturity_stage: string };

type RawBundle = {
  sales: SaleRow[];
  payments: PaymentRow[];
  appointments: AppointmentRow[];
  contacts: ContactRow[];
  marketingSpend: MarketingSpendRow[];
  treatmentSessions: TreatmentSessionRow[];
  treatmentFollowups: TreatmentFollowupRow[];
  consentRecords: ConsentRecordRow[];
  treatmentUsage: TreatmentUsageRow[];
  inventoryLots: InventoryLotRow[];
  inventoryAlerts: InventoryAlertRow[];
  inventoryEvents: InventoryEventRow[];
  purchaseOrders: PurchaseOrderRow[];
  shifts: StaffShiftRow[];
  timeEntries: TimeEntryRow[];
  attendanceExceptions: AttendanceExceptionRow[];
  ptoRequests: PtoRequestRow[];
  laborCosts: LaborCostRow[];
  reviewRequests: ReviewRequestRow[];
  feedbackResponses: FeedbackResponseRow[];
  feedbackEscalations: FeedbackEscalationRow[];
  externalReviews: ExternalReviewRow[];
  referrals: ReferralRow[];
  reactivationCampaigns: ReactivationCampaignRow[];
  loyaltyRows: LoyaltyRow[];
  memberships: MembershipRow[];
};

function first<T>(value: Relation<T> | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function inScope(locationId: string | null | undefined, locationIds: string[]) {
  return typeof locationId === "string" && locationIds.includes(locationId);
}

function locationName(locations: LocationRow[], id: string | null) {
  if (!id) return "Company";
  return locations.find((location) => location.id === id)?.name ?? "Location";
}

function dateTime(date: string, endOfDay = false) {
  return `${date}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`;
}

function countBetween(start: string, end: string, value: string | null | undefined) {
  if (!value) return false;
  const day = value.slice(0, 10);
  return day >= start && day <= end;
}

function baseKpis(rows: RawBundle, locationId: string | null, locationIds: string[], start: string, end: string): ExecutiveKpis {
  const scope = (rowLocationId: string | null | undefined) => locationId ? rowLocationId === locationId : inScope(rowLocationId, locationIds);
  const kpis = { ...emptyKpis };
  const sales = rows.sales.filter((row) => scope(row.location_id) && countBetween(start, end, row.sale_date));
  const payments = rows.payments.filter((row) => scope(row.location_id) && countBetween(start, end, row.received_at) && row.status !== "failed");
  const appointments = rows.appointments.filter((row) => scope(row.location_id) && countBetween(start, end, row.start_at));
  const contacts = rows.contacts.filter((row) => scope(row.location_id) && countBetween(start, end, row.created_at));
  const marketingSpend = rows.marketingSpend.filter((row) => scope(row.location_id) && row.spend_date >= start && row.spend_date <= end);
  const treatmentSessions = rows.treatmentSessions.filter((row) => scope(row.location_id) && countBetween(start, end, row.scheduled_at ?? row.completed_at));
  const treatmentUsage = rows.treatmentUsage.filter((row) => scope(row.location_id) && countBetween(start, end, row.created_at));
  const inventoryEvents = rows.inventoryEvents.filter((row) => scope(row.location_id) && countBetween(start, end, row.created_at));
  const laborCosts = rows.laborCosts.filter((row) => {
    const period = first(row.pay_periods);
    return scope(row.location_id) && (!period || !period.start_date || !period.end_date || (period.start_date <= end && period.end_date >= start));
  });
  const reviewRequests = rows.reviewRequests.filter((row) => scope(row.location_id) && countBetween(start, end, row.created_at));
  const feedback = rows.feedbackResponses.filter((row) => scope(row.location_id) && countBetween(start, end, row.submitted_at));
  const escalations = rows.feedbackEscalations.filter((row) => scope(row.location_id));
  const externalReviews = rows.externalReviews.filter((row) => scope(row.location_id) && row.review_date >= start && row.review_date <= end);
  const referrals = rows.referrals.filter((row) => scope(row.location_id) && countBetween(start, end, row.lead_created_at));
  const loyaltyRows = rows.loyaltyRows.filter((row) => scope(row.location_id));

  kpis.grossSalesCents = sales.reduce((sum, row) => sum + Number(row.total_amount_cents ?? 0), 0);
  kpis.collectedRevenueCents = payments.length
    ? payments.reduce((sum, row) => sum + Number(row.amount_cents ?? 0), 0)
    : sales.reduce((sum, row) => sum + Number(row.paid_amount_cents ?? 0), 0);
  kpis.refundsCents = sales.reduce((sum, row) => sum + Number(row.refunded_amount_cents ?? 0), 0);
  kpis.netCollectedRevenueCents = kpis.collectedRevenueCents - kpis.refundsCents;
  kpis.outstandingBalanceCents = sales.reduce((sum, row) => sum + Number(row.balance_due_cents ?? 0), 0);
  kpis.inventoryCogsCents = treatmentUsage.reduce((sum, row) => sum + Number(row.total_cost_cents ?? 0), 0);
  kpis.directLaborCostCents = laborCosts.reduce((sum, row) => sum + Number(row.total_cost_cents ?? 0), 0);
  const contribution = contributionBeforeOverhead(kpis.netCollectedRevenueCents, kpis.inventoryCogsCents, kpis.directLaborCostCents);
  kpis.contributionBeforeOverheadCents = contribution.contributionCents;
  kpis.contributionMarginPercent = contribution.marginPercent;
  kpis.marketingSpendCents = marketingSpend.reduce((sum, row) => sum + Number(row.spend_cents ?? 0), 0);
  kpis.leads = contacts.length + marketingSpend.reduce((sum, row) => sum + Number(row.leads ?? 0), 0);
  kpis.roas = safeDivide(kpis.netCollectedRevenueCents, kpis.marketingSpendCents);
  kpis.bookedConsults = appointments.filter((row) => !["cancelled"].includes(row.status ?? "")).length;
  kpis.showedConsults = appointments.filter((row) => ["completed", "checked_in"].includes(row.status ?? "")).length + treatmentSessions.filter((row) => row.status === "completed").length;
  kpis.noShowConsults = appointments.filter((row) => row.status === "no_show").length + treatmentSessions.filter((row) => row.status === "no_show").length;
  kpis.soldCount = sales.filter((row) => !["cancelled", "void"].includes(row.status ?? "")).length;
  kpis.paidSalesCount = sales.filter((row) => Number(row.paid_amount_cents ?? 0) > 0).length;
  kpis.closeRatePercent = percent(kpis.soldCount, kpis.showedConsults);
  kpis.averageTicketCents = Math.round(safeDivide(kpis.grossSalesCents, kpis.soldCount));
  kpis.showRatePercent = percent(kpis.showedConsults, kpis.bookedConsults);
  kpis.noShowRatePercent = percent(kpis.noShowConsults, kpis.bookedConsults);
  kpis.treatmentCompleted = treatmentSessions.filter((row) => row.status === "completed").length;
  kpis.providerUtilizationPercent = percent(kpis.treatmentCompleted, Math.max(1, treatmentSessions.filter((row) => row.status !== "cancelled").length));
  kpis.followUpsDue = rows.treatmentFollowups.filter((row) => scope(row.location_id) && !["completed", "cancelled"].includes(row.status ?? "") && countBetween(start, end, row.due_at)).length;
  kpis.unsignedNotes = treatmentSessions.filter((row) => row.documentation_status !== "signed" && row.status === "completed").length;
  kpis.missingConsents = rows.consentRecords.filter((row) => scope(row.location_id) && ["required", "pending", "expired"].includes(row.status ?? "")).length;
  kpis.staffScheduledToday = rows.shifts.filter((row) => scope(row.location_id) && row.shift_date === new Date().toISOString().slice(0, 10) && row.status !== "cancelled").length;
  kpis.clockedInNow = rows.timeEntries.filter((row) => scope(row.location_id) && row.status === "open" && !row.clock_out_at).length;
  kpis.lateToday = rows.attendanceExceptions.filter((row) => scope(row.location_id) && row.exception_type === "late" && row.status !== "resolved").length;
  kpis.openAttendanceExceptions = rows.attendanceExceptions.filter((row) => scope(row.location_id) && row.status !== "resolved").length;
  kpis.overtimeRiskCount = laborCosts.filter((row) => Number(row.overtime_minutes ?? 0) > 0).length;
  kpis.ptoToday = rows.ptoRequests.filter((row) => scope(row.location_id) && row.status === "approved" && row.start_date <= end && row.end_date >= start).length;
  const workedMinutes = rows.timeEntries.filter((row) => scope(row.location_id)).reduce((sum, row) => sum + Number(row.worked_minutes ?? 0), 0);
  kpis.revenuePerLaborHourCents = Math.round(safeDivide(kpis.netCollectedRevenueCents, workedMinutes / 60));
  const lots = rows.inventoryLots.filter((row) => scope(row.location_id) && row.status !== "archived");
  kpis.inventoryValueCents = lots.reduce((sum, row) => sum + Math.round(Number(row.quantity_available ?? 0) * Number(row.cost_per_unit_cents ?? 0)), 0);
  kpis.lowStockItems = rows.inventoryAlerts.filter((row) => scope(row.location_id) && row.alert_type === "low_stock" && row.status !== "resolved").length;
  kpis.outOfStockItems = rows.inventoryAlerts.filter((row) => scope(row.location_id) && row.alert_type === "out_of_stock" && row.status !== "resolved").length;
  const today = new Date();
  const expiringCutoff = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  kpis.expiringSoonItems = lots.filter((row) => row.expiration_date !== null && row.expiration_date <= expiringCutoff).length;
  kpis.wasteCostCents = inventoryEvents.filter((row) => row.event_type === "waste").reduce((sum, row) => sum + Math.round(Math.abs(Number(row.quantity ?? 0)) * Number(row.unit_cost_cents ?? 0)), 0);
  kpis.openPurchaseOrders = rows.purchaseOrders.filter((row) => scope(row.location_id) && ["draft", "submitted", "approved", "ordered", "partially_received"].includes(row.status ?? "")).length;
  kpis.reviewRequests = reviewRequests.length;
  kpis.completedReviews = reviewRequests.filter((row) => row.status === "completed").length;
  kpis.openNegativeFeedback = escalations.filter((row) => !["resolved", "dismissed"].includes(row.status ?? "")).length;
  const scores = feedback.filter((row) => row.score !== null).map((row) => Number(row.score));
  if (scores.length) {
    const promoters = scores.filter((score) => score >= 9).length;
    const detractors = scores.filter((score) => score <= 6).length;
    kpis.nps = Math.round((promoters / scores.length - detractors / scores.length) * 100);
  }
  const ratings = [...feedback.map((row) => row.rating), ...externalReviews.map((row) => row.rating)].filter((rating): rating is number => rating !== null && rating !== undefined);
  kpis.averageExternalRating = ratings.length ? Math.round(safeDivide(ratings.reduce((sum, rating) => sum + rating, 0), ratings.length) * 10) / 10 : null;
  kpis.referralLeads = referrals.length;
  kpis.referralSales = referrals.filter((row) => ["sold", "reward_pending", "reward_issued"].includes(row.status ?? "")).length;
  kpis.referralRevenueCents = referrals.reduce((sum, row) => sum + Number(first(row.sales)?.paid_amount_cents ?? 0), 0);
  kpis.activeReactivationCampaigns = rows.reactivationCampaigns.filter((row) => row.status === "active").length;
  kpis.reactivationBookingsRecovered = rows.reactivationCampaigns.reduce((sum, row) => sum + Number(row.bookings_generated ?? 0), 0);
  kpis.reactivationRevenueCents = rows.reactivationCampaigns.reduce((sum, row) => sum + Number(row.collected_revenue_cents ?? 0), 0);
  kpis.inactivePatients = loyaltyRows.filter((row) => row.loyalty_status === "inactive" || Number(row.months_since_last_visit ?? 0) >= 12).length;
  kpis.activeMemberships = rows.memberships.filter((row) => ["trial", "active"].includes(row.status ?? "")).length;
  kpis.pastDueMemberships = rows.memberships.filter((row) => row.status === "past_due").length;
  kpis.cancelledMembershipsThisMonth = rows.memberships.filter((row) => row.status === "cancelled" && countBetween(start, end, row.created_at)).length;
  kpis.membershipRevenueCents = rows.memberships.filter((row) => ["trial", "active"].includes(row.status ?? "")).reduce((sum, row) => {
    const plan = first(row.membership_plans);
    return sum + Number(plan?.monthly_price_cents ?? plan?.price_cents ?? 0);
  }, 0);
  return kpis;
}

function targetsByKey(targets: TargetRow[], locationId: string | null) {
  return new Map(
    targets
      .filter((target) => target.active && (target.location_id === locationId || (locationId !== null && target.location_id === null)))
      .map((target) => [`${target.location_id ?? "company"}:${target.metric_key}`, target])
  );
}

function findTarget(targets: TargetRow[], metricKey: string, locationId: string | null) {
  const targetMap = targetsByKey(targets, locationId);
  return targetMap.get(`${locationId ?? "company"}:${metricKey}`) ?? targetMap.get(`company:${metricKey}`);
}

function generatedAlerts(company: ExecutiveKpis, scorecards: LocationScorecard[], targets: TargetRow[], rangeLabel: string): ExecutiveAlert[] {
  const alerts: ExecutiveAlert[] = [];
  for (const scorecard of scorecards) {
    const revenueTarget = findTarget(targets, "net_collected_revenue_cents", scorecard.locationId);
    if (revenueTarget && scorecard.kpis.netCollectedRevenueCents < Number(revenueTarget.target_value) * Number(revenueTarget.warning_threshold ?? 0.9)) {
      alerts.push({
        locationId: scorecard.locationId,
        locationName: scorecard.locationName,
        alertType: "revenue_below_target",
        severity: "watch",
        title: `${scorecard.locationName} revenue below target`,
        summary: `${rangeLabel} net collected revenue is tracking below the configured demo target.`,
        status: "active",
        identityKey: `${rangeLabel}:${scorecard.locationId}:revenue_below_target`,
        generatedAt: new Date().toISOString()
      });
    }
    if (scorecard.kpis.lowStockItems + scorecard.kpis.outOfStockItems > 0) {
      alerts.push({
        locationId: scorecard.locationId,
        locationName: scorecard.locationName,
        alertType: "inventory_low",
        severity: scorecard.kpis.outOfStockItems ? "important" : "watch",
        title: `${scorecard.locationName} inventory attention`,
        summary: `${scorecard.kpis.lowStockItems} low-stock and ${scorecard.kpis.outOfStockItems} out-of-stock items are visible in the allowed scope.`,
        status: "active",
        identityKey: `${rangeLabel}:${scorecard.locationId}:inventory_low`,
        generatedAt: new Date().toISOString()
      });
    }
  }
  const laborTarget = findTarget(targets, "labor_cost_percent", null);
  const laborCostPercent = safeDivide(company.directLaborCostCents, company.netCollectedRevenueCents);
  if (laborTarget && laborCostPercent > Number(laborTarget.warning_threshold ?? 0.28)) {
    alerts.push({
      locationId: null,
      locationName: "Company",
      alertType: "labor_cost_percent_above_threshold",
      severity: "watch",
      title: "Company labor cost above threshold",
      summary: "Aggregate direct labor cost is above the configured operating watch line.",
      status: "active",
      identityKey: `${rangeLabel}:company:labor_cost_percent`,
      generatedAt: new Date().toISOString()
    });
  }
  return alerts;
}

async function loadBundle(supabase: SupabaseClient, organizationId: string, locationIds: string[], start: string, end: string): Promise<RawBundle> {
  const startIso = dateTime(start);
  const endIso = dateTime(end, true);
  const [sales, payments, appointments, contacts, marketingSpend, treatmentSessions, treatmentFollowups, consentRecords, treatmentUsage, inventoryLots, inventoryAlerts, inventoryEvents, purchaseOrders, shifts, timeEntries, attendanceExceptions, ptoRequests, laborCosts, reviewRequests, feedbackResponses, feedbackEscalations, externalReviews, referrals, reactivationCampaigns, loyaltyRows, memberships] = await Promise.all([
    supabase.from("sales").select("id, location_id, salesperson_id, status, total_amount_cents, paid_amount_cents, refunded_amount_cents, balance_due_cents, sale_date").eq("organization_id", organizationId).gte("sale_date", startIso).lte("sale_date", endIso).in("location_id", locationIds).limit(4000),
    supabase.from("payments").select("location_id, amount_cents, received_at, status").eq("organization_id", organizationId).gte("received_at", startIso).lte("received_at", endIso).in("location_id", locationIds).limit(4000),
    supabase.from("appointments").select("location_id, provider_id, status, start_at, end_at").eq("organization_id", organizationId).gte("start_at", startIso).lte("start_at", endIso).in("location_id", locationIds).limit(4000),
    supabase.from("contacts").select("location_id, created_at").eq("organization_id", organizationId).gte("created_at", startIso).lte("created_at", endIso).in("location_id", locationIds).limit(4000),
    supabase.from("marketing_spend").select("location_id, spend_cents, leads, spend_date").eq("organization_id", organizationId).gte("spend_date", start).lte("spend_date", end).in("location_id", locationIds).limit(4000),
    supabase.from("treatment_sessions").select("location_id, provider_id, service_id, status, documentation_status, scheduled_at, completed_at").eq("organization_id", organizationId).gte("scheduled_at", startIso).lte("scheduled_at", endIso).in("location_id", locationIds).limit(4000),
    supabase.from("treatment_followups").select("location_id, status, due_at").eq("organization_id", organizationId).lte("due_at", endIso).in("location_id", locationIds).limit(4000),
    supabase.from("consent_records").select("location_id, status, created_at").eq("organization_id", organizationId).in("location_id", locationIds).limit(4000),
    supabase.from("treatment_inventory_usage").select("location_id, total_cost_cents, created_at").eq("organization_id", organizationId).gte("created_at", startIso).lte("created_at", endIso).in("location_id", locationIds).limit(4000),
    supabase.from("inventory_lots").select("location_id, quantity_available, cost_per_unit_cents, expiration_date, status").eq("organization_id", organizationId).in("location_id", locationIds).limit(4000),
    supabase.from("inventory_alerts").select("location_id, status, alert_type").eq("organization_id", organizationId).in("location_id", locationIds).limit(4000),
    supabase.from("inventory_events").select("location_id, quantity, unit_cost_cents, event_type, created_at").eq("organization_id", organizationId).gte("created_at", startIso).lte("created_at", endIso).in("location_id", locationIds).limit(4000),
    supabase.from("purchase_orders").select("location_id, status").eq("organization_id", organizationId).in("location_id", locationIds).limit(4000),
    supabase.from("staff_shifts").select("location_id, status, shift_date").eq("organization_id", organizationId).gte("shift_date", start).lte("shift_date", end).in("location_id", locationIds).limit(4000),
    supabase.from("time_entries").select("location_id, status, clock_in_at, clock_out_at, worked_minutes").eq("organization_id", organizationId).gte("clock_in_at", startIso).lte("clock_in_at", endIso).in("location_id", locationIds).limit(4000),
    supabase.from("attendance_exceptions").select("location_id, status, exception_type").eq("organization_id", organizationId).in("location_id", locationIds).limit(4000),
    supabase.from("pto_requests").select("location_id, status, start_date, end_date").eq("organization_id", organizationId).in("location_id", locationIds).limit(4000),
    supabase.from("labor_cost_records").select("location_id, regular_minutes, overtime_minutes, pto_minutes, total_cost_cents, pay_periods(start_date, end_date)").eq("organization_id", organizationId).in("location_id", locationIds).limit(4000),
    supabase.from("review_requests").select("location_id, status, created_at").eq("organization_id", organizationId).gte("created_at", startIso).lte("created_at", endIso).in("location_id", locationIds).limit(4000),
    supabase.from("feedback_responses").select("location_id, score, rating, submitted_at").eq("organization_id", organizationId).gte("submitted_at", startIso).lte("submitted_at", endIso).in("location_id", locationIds).limit(4000),
    supabase.from("feedback_escalations").select("location_id, status, created_at").eq("organization_id", organizationId).in("location_id", locationIds).limit(4000),
    supabase.from("external_reviews").select("location_id, rating, review_date").eq("organization_id", organizationId).gte("review_date", start).lte("review_date", end).in("location_id", locationIds).limit(4000),
    supabase.from("referrals").select("location_id, status, sale_id, sales(paid_amount_cents), lead_created_at").eq("organization_id", organizationId).gte("lead_created_at", startIso).lte("lead_created_at", endIso).in("location_id", locationIds).limit(4000),
    supabase.from("reactivation_campaigns").select("status, contacts_targeted, contacts_reactivated, bookings_generated, sales_generated, collected_revenue_cents").eq("organization_id", organizationId).limit(1000),
    supabase.from("patient_loyalty_snapshots").select("location_id, loyalty_status, months_since_last_visit").eq("organization_id", organizationId).in("location_id", locationIds).limit(4000),
    supabase.from("patient_memberships").select("status, created_at, membership_plans(price_cents)").eq("organization_id", organizationId).limit(4000)
  ]);

  const results = { sales, payments, appointments, contacts, marketingSpend, treatmentSessions, treatmentFollowups, consentRecords, treatmentUsage, inventoryLots, inventoryAlerts, inventoryEvents, purchaseOrders, shifts, timeEntries, attendanceExceptions, ptoRequests, laborCosts, reviewRequests, feedbackResponses, feedbackEscalations, externalReviews, referrals, reactivationCampaigns, loyaltyRows, memberships };
  for (const [name, result] of Object.entries(results)) {
    if (result.error) throw new Error(`Executive ${name} query failed: ${result.error.message}`);
  }

  return {
    sales: (sales.data ?? []) as SaleRow[],
    payments: (payments.data ?? []) as PaymentRow[],
    appointments: (appointments.data ?? []) as AppointmentRow[],
    contacts: (contacts.data ?? []) as ContactRow[],
    marketingSpend: (marketingSpend.data ?? []) as MarketingSpendRow[],
    treatmentSessions: (treatmentSessions.data ?? []) as TreatmentSessionRow[],
    treatmentFollowups: (treatmentFollowups.data ?? []) as TreatmentFollowupRow[],
    consentRecords: (consentRecords.data ?? []) as ConsentRecordRow[],
    treatmentUsage: (treatmentUsage.data ?? []) as TreatmentUsageRow[],
    inventoryLots: (inventoryLots.data ?? []) as InventoryLotRow[],
    inventoryAlerts: (inventoryAlerts.data ?? []) as InventoryAlertRow[],
    inventoryEvents: (inventoryEvents.data ?? []) as InventoryEventRow[],
    purchaseOrders: (purchaseOrders.data ?? []) as PurchaseOrderRow[],
    shifts: (shifts.data ?? []) as StaffShiftRow[],
    timeEntries: (timeEntries.data ?? []) as TimeEntryRow[],
    attendanceExceptions: (attendanceExceptions.data ?? []) as AttendanceExceptionRow[],
    ptoRequests: (ptoRequests.data ?? []) as PtoRequestRow[],
    laborCosts: (laborCosts.data ?? []) as LaborCostRow[],
    reviewRequests: (reviewRequests.data ?? []) as ReviewRequestRow[],
    feedbackResponses: (feedbackResponses.data ?? []) as FeedbackResponseRow[],
    feedbackEscalations: (feedbackEscalations.data ?? []) as FeedbackEscalationRow[],
    externalReviews: (externalReviews.data ?? []) as ExternalReviewRow[],
    referrals: (referrals.data ?? []) as ReferralRow[],
    reactivationCampaigns: (reactivationCampaigns.data ?? []) as ReactivationCampaignRow[],
    loyaltyRows: (loyaltyRows.data ?? []) as LoyaltyRow[],
    memberships: (memberships.data ?? []) as MembershipRow[]
  };
}

export async function getExecutiveReport(supabase: SupabaseClient, profile: CurrentProfile, options: { period?: ExecutivePeriod; selectedLocationId?: string | null } = {}): Promise<ExecutiveReport> {
  assertExecutivePermission(profile, "executive.read");
  const selectedLocationIds = allowedLocationIds(profile, options.selectedLocationId ?? null);
  const locationIds = selectedLocationIds.length ? selectedLocationIds : profile.locations.map((location) => location.id);
  const range = executiveDateRange(options.period ?? "this_month");
  const priorRange = { start: range.priorStart, end: range.priorEnd };
  const scopedLocations = profile.locations.filter((location) => locationIds.includes(location.id));
  const [currentBundle, priorBundle, targetsResult, alertsResult, weightsResult, profilesResult, viewsResult] = await Promise.all([
    loadBundle(supabase, profile.organizationId, locationIds, range.start, range.end),
    loadBundle(supabase, profile.organizationId, locationIds, priorRange.start, priorRange.end),
    supabase.from("executive_targets").select("id, organization_id, location_id, metric_key, period_type, target_value, warning_threshold, critical_threshold, effective_start, effective_end, active").eq("organization_id", profile.organizationId).eq("active", true).limit(1000),
    supabase.from("executive_alerts").select("id, location_id, alert_type, severity, title, summary, status, identity_key, generated_at, locations(name)").eq("organization_id", profile.organizationId).in("status", ["active", "acknowledged"]).limit(1000),
    supabase.from("executive_scorecard_weights").select("category, weight, active").eq("organization_id", profile.organizationId).eq("active", true),
    supabase.from("location_operating_profiles").select("location_id, maturity_stage").eq("organization_id", profile.organizationId).in("location_id", locationIds),
    supabase.from("executive_saved_views").select("id, name, view_type, filters_json, shared").eq("organization_id", profile.organizationId).limit(100)
  ]);
  for (const result of [targetsResult, alertsResult, weightsResult, profilesResult, viewsResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  const targets = (targetsResult.data ?? []) as TargetRow[];
  const weights = Object.fromEntries(((weightsResult.data ?? []) as WeightRow[]).map((row) => [row.category, Number(row.weight)]));
  const operatingProfiles = new Map(((profilesResult.data ?? []) as OperatingProfileRow[]).map((row) => [row.location_id, row.maturity_stage]));
  const locationKpis = scopedLocations.map((location) => ({
    location,
    kpis: baseKpis(currentBundle, location.id, locationIds, range.start, range.end)
  }));
  const company = aggregateKpis(locationKpis.map((row) => row.kpis));
  const priorCompany = aggregateKpis(scopedLocations.map((location) => baseKpis(priorBundle, location.id, locationIds, priorRange.start, priorRange.end)));
  const scorecards = locationKpis.map(({ location, kpis }) => {
    const revenueTarget = findTarget(targets, "net_collected_revenue_cents", location.id);
    const closeTarget = findTarget(targets, "close_rate_percent", location.id);
    const roasTarget = findTarget(targets, "marketing_roas", location.id);
    const marginTarget = findTarget(targets, "contribution_margin_percent", location.id);
    const npsTarget = findTarget(targets, "nps", location.id);
    const laborTarget = findTarget(targets, "labor_cost_percent", location.id);
    const noShowTarget = findTarget(targets, "no_show_rate_percent", location.id);
    const laborCostPercent = safeDivide(kpis.directLaborCostCents, kpis.netCollectedRevenueCents);
    const components = {
      financial: scoreComponent(kpis.netCollectedRevenueCents, Number(revenueTarget?.target_value ?? company.netCollectedRevenueCents / Math.max(1, scopedLocations.length))),
      sales: scoreComponent(kpis.closeRatePercent, Number(closeTarget?.target_value ?? 0.4)),
      marketing: scoreComponent(kpis.roas, Number(roasTarget?.target_value ?? 3.5)),
      operations: Math.round((scoreComponent(kpis.providerUtilizationPercent, 0.75) + scoreComponent(laborCostPercent, Number(laborTarget?.target_value ?? 0.25), true) + scoreComponent(kpis.noShowRatePercent, Number(noShowTarget?.target_value ?? 0.1), true)) / 3),
      retention: scoreComponent(kpis.nps ?? 0, Number(npsTarget?.target_value ?? 60))
    };
    const score = executiveScore(components, { financial: 0.3, sales: 0.2, marketing: 0.18, operations: 0.17, retention: 0.15, ...weights });
    const draftScorecard: LocationScorecard = {
      locationId: location.id,
      locationName: location.name,
      maturityStage: operatingProfiles.get(location.id) ?? "established",
      kpis,
      score,
      components,
      statuses: {
        revenue: scoreTarget(kpis.netCollectedRevenueCents, revenueTarget),
        contributionMargin: scoreTarget(kpis.contributionMarginPercent, marginTarget),
        roas: scoreTarget(kpis.roas, roasTarget),
        closeRate: scoreTarget(kpis.closeRatePercent, closeTarget),
        laborCostPercent: scoreTarget(laborCostPercent, laborTarget, true),
        noShowRate: scoreTarget(kpis.noShowRatePercent, noShowTarget, true),
        nps: scoreTarget(kpis.nps ?? 0, npsTarget)
      },
      benchmarks: buildBenchmarks(kpis, company),
      expansionReadiness: { label: "Building", score, factors: [] }
    };
    return { ...draftScorecard, expansionReadiness: expansionReadiness(draftScorecard) };
  });

  const persistedAlerts = ((alertsResult.data ?? []) as ExecutiveAlertRow[])
    .filter((alert) => alert.location_id === null || locationIds.includes(alert.location_id))
    .map((alert) => ({
      id: alert.id,
      locationId: alert.location_id,
      locationName: locationName(scopedLocations, alert.location_id),
      alertType: alert.alert_type,
      severity: alert.severity,
      title: alert.title,
      summary: alert.summary,
      status: alert.status,
      identityKey: alert.identity_key,
      generatedAt: alert.generated_at
    }));
  const alertByIdentity = new Map<string, ExecutiveAlert>();
  for (const alert of [...persistedAlerts, ...generatedAlerts(company, scorecards, targets, range.label)]) {
    alertByIdentity.set(alert.identityKey, alert);
  }
  const forecasts = [
    {
      metricKey: "net_collected_revenue_cents",
      label: "Month-End Net Collected Revenue",
      actualValue: company.netCollectedRevenueCents,
      forecastValue: runRateForecast(company.netCollectedRevenueCents, range),
      targetValue: Number(findTarget(targets, "net_collected_revenue_cents", null)?.target_value ?? 0) || null,
      gapToTarget: null,
      confidence: forecastConfidence(range)
    },
    {
      metricKey: "marketing_spend_cents",
      label: "Month-End Marketing Spend",
      actualValue: company.marketingSpendCents,
      forecastValue: runRateForecast(company.marketingSpendCents, range),
      targetValue: null,
      gapToTarget: null,
      confidence: forecastConfidence(range)
    },
    {
      metricKey: "labor_cost_cents",
      label: "Month-End Direct Labor Cost",
      actualValue: company.directLaborCostCents,
      forecastValue: runRateForecast(company.directLaborCostCents, range),
      targetValue: null,
      gapToTarget: null,
      confidence: forecastConfidence(range)
    },
    {
      metricKey: "contribution_before_overhead_cents",
      label: "Month-End Contribution Before Overhead",
      actualValue: company.contributionBeforeOverheadCents,
      forecastValue: runRateForecast(company.contributionBeforeOverheadCents, range),
      targetValue: null,
      gapToTarget: null,
      confidence: forecastConfidence(range)
    }
  ].map((forecast) => ({ ...forecast, gapToTarget: forecast.targetValue === null ? null : forecast.forecastValue - forecast.targetValue }));

  return {
    range,
    locationIds,
    company,
    priorCompany,
    trends: {
      netCollectedRevenueCents: calculateTrend(company.netCollectedRevenueCents, priorCompany.netCollectedRevenueCents),
      contributionBeforeOverheadCents: calculateTrend(company.contributionBeforeOverheadCents, priorCompany.contributionBeforeOverheadCents),
      marketingSpendCents: calculateTrend(company.marketingSpendCents, priorCompany.marketingSpendCents),
      closeRatePercent: calculateTrend(company.closeRatePercent, priorCompany.closeRatePercent),
      nps: calculateTrend(company.nps ?? 0, priorCompany.nps ?? 0)
    },
    locationScorecards: scorecards,
    targets,
    alerts: Array.from(alertByIdentity.values()),
    forecasts,
    savedViews: (viewsResult.data ?? []) as SavedViewRow[],
    weeklyReview: [
      `Company net collected revenue: ${company.netCollectedRevenueCents}`,
      `Contribution before overhead: ${company.contributionBeforeOverheadCents}`,
      `Owner attention items: ${alertByIdentity.size}`
    ],
    monthlyReview: [
      `Locations reviewed: ${scorecards.length}`,
      `Average contribution margin: ${Math.round(company.contributionMarginPercent * 1000) / 10}%`,
      `Expansion-readiness strongest: ${[...scorecards].sort((a, b) => b.score - a.score)[0]?.locationName ?? "Not available"}`
    ]
  };
}
