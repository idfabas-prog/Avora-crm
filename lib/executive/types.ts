export type ExecutivePeriod =
  | "today"
  | "yesterday"
  | "this_week"
  | "this_month"
  | "this_quarter"
  | "year_to_date";

export type ExecutiveStatus = "Above Target" | "On Target" | "Watch" | "Below Target";

export type TrendDirection = "up" | "down" | "flat";

export type ExecutiveDateRange = {
  start: string;
  end: string;
  label: string;
  priorStart: string;
  priorEnd: string;
  priorLabel: string;
  period: ExecutivePeriod;
};

export type ExecutiveKpis = {
  grossSalesCents: number;
  collectedRevenueCents: number;
  netCollectedRevenueCents: number;
  refundsCents: number;
  outstandingBalanceCents: number;
  inventoryCogsCents: number;
  directLaborCostCents: number;
  contributionBeforeOverheadCents: number;
  contributionMarginPercent: number;
  marketingSpendCents: number;
  roas: number;
  closeRatePercent: number;
  averageTicketCents: number;
  showRatePercent: number;
  noShowRatePercent: number;
  referralRevenueCents: number;
  reactivationRevenueCents: number;
  nps: number | null;
  activeMemberships: number;
  bookedConsults: number;
  showedConsults: number;
  noShowConsults: number;
  soldCount: number;
  paidSalesCount: number;
  leads: number;
  treatmentCompleted: number;
  providerUtilizationPercent: number;
  followUpsDue: number;
  unsignedNotes: number;
  missingConsents: number;
  staffScheduledToday: number;
  clockedInNow: number;
  lateToday: number;
  openAttendanceExceptions: number;
  overtimeRiskCount: number;
  ptoToday: number;
  revenuePerLaborHourCents: number;
  inventoryValueCents: number;
  lowStockItems: number;
  outOfStockItems: number;
  expiringSoonItems: number;
  wasteCostCents: number;
  openPurchaseOrders: number;
  reviewRequests: number;
  completedReviews: number;
  openNegativeFeedback: number;
  averageExternalRating: number | null;
  referralLeads: number;
  referralSales: number;
  inactivePatients: number;
  activeReactivationCampaigns: number;
  reactivationBookingsRecovered: number;
  membershipRevenueCents: number;
  pastDueMemberships: number;
  cancelledMembershipsThisMonth: number;
};

export type TargetRow = {
  id: string;
  organization_id: string;
  location_id: string | null;
  metric_key: string;
  period_type: string;
  target_value: number | string;
  warning_threshold: number | string | null;
  critical_threshold: number | string | null;
  effective_start: string;
  effective_end: string | null;
  active: boolean;
};

export type LocationScorecard = {
  locationId: string;
  locationName: string;
  maturityStage: string;
  kpis: ExecutiveKpis;
  score: number;
  components: Record<string, number>;
  statuses: Record<string, ExecutiveStatus>;
  benchmarks: Record<string, string>;
  expansionReadiness: {
    label: "Strong" | "Ready Soon" | "Building";
    score: number;
    factors: string[];
  };
};

export type ExecutiveAlert = {
  id?: string;
  locationId: string | null;
  locationName: string;
  alertType: string;
  severity: "info" | "watch" | "important" | "critical";
  title: string;
  summary: string;
  status: "active" | "acknowledged" | "resolved" | "expired";
  identityKey: string;
  generatedAt: string;
};

export type ExecutiveForecast = {
  metricKey: string;
  label: string;
  actualValue: number;
  forecastValue: number;
  targetValue: number | null;
  gapToTarget: number | null;
  confidence: "Early Estimate" | "Moderate Confidence" | "Higher Confidence";
};

export type ExecutiveReport = {
  range: ExecutiveDateRange;
  locationIds: string[];
  company: ExecutiveKpis;
  priorCompany: ExecutiveKpis;
  trends: Record<string, { absoluteChange: number; percentChange: number | null; direction: TrendDirection }>;
  locationScorecards: LocationScorecard[];
  targets: TargetRow[];
  alerts: ExecutiveAlert[];
  forecasts: ExecutiveForecast[];
  savedViews: Array<{ id: string; name: string; view_type: string; filters_json: Record<string, unknown>; shared: boolean }>;
  weeklyReview: string[];
  monthlyReview: string[];
};
