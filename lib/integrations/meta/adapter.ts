import type { MetaCampaignImport, MetaSpendImport } from "./types";

export type MetaAdsAdapter = {
  listCampaigns(): Promise<MetaCampaignImport[]>;
  listSpend(startDate: string, endDate: string): Promise<MetaSpendImport[]>;
};

export function createMockMetaAdsAdapter(): MetaAdsAdapter {
  return {
    async listCampaigns() {
      return [
        { externalCampaignId: "meta_demo_miami_hair", name: "Miami Hair Restoration - Meta", status: "active", objective: "Booked consultations" },
        { externalCampaignId: "meta_demo_tampa_hair", name: "Tampa Hair Restoration - Meta", status: "active", objective: "Booked consultations" }
      ];
    },
    async listSpend(startDate: string) {
      return [
        { externalCampaignId: "meta_demo_miami_hair", spendDate: startDate, spendCents: 25000, impressions: 1800, clicks: 70, leads: 3 }
      ];
    }
  };
}
