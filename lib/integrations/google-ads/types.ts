export type GoogleAdsCampaignImport = {
  externalCampaignId: string;
  name: string;
  status: string;
  channel?: string | null;
};

export type GoogleAdsSpendImport = {
  externalCampaignId: string;
  spendDate: string;
  spendCents: number;
  impressions: number;
  clicks: number;
  conversions: number;
};
