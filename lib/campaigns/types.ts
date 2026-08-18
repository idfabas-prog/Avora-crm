export type CampaignPermission =
  | "campaigns.read"
  | "campaigns.create"
  | "campaigns.edit"
  | "campaigns.approve"
  | "campaigns.launch"
  | "campaigns.pause"
  | "campaigns.cancel"
  | "campaigns.recipients.read"
  | "campaigns.analytics.read"
  | "suppression.read"
  | "suppression.manage"
  | "campaigns.settings.manage";

export type CampaignSettings = {
  maxSmsPerMinute: number;
  maxSmsPerHour: number;
  dailyContactFrequencyCap: number;
  weeklyContactFrequencyCap: number;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  weekendsEnabled: boolean;
  bookingAttributionWindowDays: number;
  saleAttributionWindowDays: number;
  simulationMode: boolean;
};

export type CampaignEligibilityInput = {
  contactId: string;
  locationId: string | null;
  phone: string | null | undefined;
  optedOut: boolean;
  suppressed: boolean;
  outboundToday: number;
  outboundThisWeek: number;
  allowedLocationIds: string[];
  campaignStatus: string;
  fatigueScore: number;
};

export type EligibilityStatus =
  | "eligible"
  | "opted_out"
  | "suppressed"
  | "frequency_capped"
  | "invalid_phone"
  | "unauthorized_location"
  | "campaign_inactive"
  | "contact_fatigue";

export type CampaignVariant = {
  id: string;
  name: string;
  weightPercent: number;
  active: boolean;
};

export type CampaignRecipientAnalytics = {
  status: string;
  variantId: string | null;
  revenueCents: number;
  sentAt?: string | null;
  deliveredAt?: string | null;
  repliedAt?: string | null;
  bookedAt?: string | null;
  soldAt?: string | null;
};
