export type AttributionType = "first_touch" | "last_touch" | "lead_creation" | "manual";
export type AttributionModel = AttributionType | "primary_attribution";

export type MarketingFilters = {
  organizationId: string;
  locationIds: string[];
  startDate: string;
  endDate: string;
  sourceId?: string | null;
  campaignId?: string | null;
  serviceCategory?: string | null;
  attributionModel?: AttributionModel;
};

export type MarketingMetricInput = {
  spendCents: number;
  impressions: number;
  clicks: number;
  leads: number;
  booked: number;
  showed: number;
  sales: number;
  grossRevenueCents: number;
  collectedRevenueCents: number;
  refundedCents: number;
};

export type MarketingMetrics = MarketingMetricInput & {
  netCollectedRevenueCents: number;
  cpcCents: number;
  cplCents: number;
  costPerBookedCents: number;
  costPerShowCents: number;
  cacCents: number;
  leadToBookingRate: number;
  bookingToShowRate: number;
  showToSaleRate: number;
  leadToSaleRate: number;
  averageTicketCents: number;
  grossRoas: number;
  netCollectedRoas: number;
  healthScore: number;
  qualityFlags: string[];
};

export type PerformanceRow = {
  id: string;
  name: string;
  location?: string | null;
  source?: string | null;
  serviceCategory?: string | null;
  metrics: MarketingMetrics;
};

export type MarketingReport = {
  summary: MarketingMetrics;
  sourceRows: PerformanceRow[];
  campaignRows: PerformanceRow[];
  salespersonRows: PerformanceRow[];
  insights: string[];
  funnel: Array<{ label: string; value: number; rateFromPrevious: number }>;
};
