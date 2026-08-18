export type MetaCampaignImport = {
  externalCampaignId: string;
  name: string;
  status: string;
  objective?: string | null;
};

export type MetaSpendImport = {
  externalCampaignId: string;
  spendDate: string;
  spendCents: number;
  impressions: number;
  clicks: number;
  leads: number;
};
