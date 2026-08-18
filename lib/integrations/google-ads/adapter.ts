import type { GoogleAdsCampaignImport, GoogleAdsSpendImport } from "./types";

export type GoogleAdsAdapter = {
  listCampaigns(): Promise<GoogleAdsCampaignImport[]>;
  listSpend(startDate: string, endDate: string): Promise<GoogleAdsSpendImport[]>;
};

export function createMockGoogleAdsAdapter(): GoogleAdsAdapter {
  return {
    async listCampaigns() {
      return [
        { externalCampaignId: "google_demo_jax_hair", name: "Jacksonville Hair Restoration - Google", status: "active", channel: "SEARCH" },
        { externalCampaignId: "google_demo_tampa_neogen", name: "Tampa NeoGen - Google", status: "active", channel: "SEARCH" }
      ];
    },
    async listSpend(startDate: string) {
      return [
        { externalCampaignId: "google_demo_jax_hair", spendDate: startDate, spendCents: 18000, impressions: 900, clicks: 45, conversions: 2 }
      ];
    }
  };
}
