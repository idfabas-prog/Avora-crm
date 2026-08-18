import type { AccountingAccount, AccountingExportResult, AccountingProvider, AccountingTrackingCategory } from "./types";

const demoAccounts: AccountingAccount[] = [
  { externalAccountId: "1000", accountName: "Cash", accountType: "asset", active: true },
  { externalAccountId: "1010", accountName: "Stripe Clearing", accountType: "asset", active: true },
  { externalAccountId: "1100", accountName: "Accounts Receivable", accountType: "asset", active: true },
  { externalAccountId: "1200", accountName: "Inventory Asset", accountType: "asset", active: true },
  { externalAccountId: "4000", accountName: "Hair Restoration Revenue", accountType: "income", active: true },
  { externalAccountId: "4010", accountName: "T-Shape Revenue", accountType: "income", active: true },
  { externalAccountId: "4020", accountName: "NeoGen Revenue", accountType: "income", active: true },
  { externalAccountId: "4030", accountName: "Injectables Revenue", accountType: "income", active: true },
  { externalAccountId: "4040", accountName: "Membership Revenue", accountType: "income", active: true },
  { externalAccountId: "5000", accountName: "Inventory COGS", accountType: "expense", active: true },
  { externalAccountId: "6100", accountName: "Commissions Expense", accountType: "expense", active: true },
  { externalAccountId: "6200", accountName: "Royalties Expense", accountType: "expense", active: true },
  { externalAccountId: "6300", accountName: "Management Fees", accountType: "expense", active: true },
  { externalAccountId: "6400", accountName: "Merchant Fees", accountType: "expense", active: true }
];

function result(records: unknown[], label: string): AccountingExportResult {
  return {
    success: true,
    providerTransactionId: null,
    message: `Development provider accepted ${records.length} ${label} record(s); no live accounting API call was made.`,
    recordsProcessed: records.length
  };
}

export function createDevelopmentAccountingProvider(): AccountingProvider {
  return {
    name: "csv_export",
    async testConnection() {
      return { ok: true, message: "Development accounting provider is available; no external connection required." };
    },
    async fetchChartOfAccounts() {
      return demoAccounts;
    },
    async fetchClassesTrackingCategories(): Promise<AccountingTrackingCategory[]> {
      return [
        { id: "LOC-MIA", name: "Miami", type: "location" },
        { id: "LOC-TPA", name: "Tampa", type: "location" },
        { id: "LOC-JAX", name: "Jacksonville", type: "location" }
      ];
    },
    async exportCustomers(records) {
      return result(records, "customer");
    },
    async exportSales(records) {
      return result(records, "sale");
    },
    async exportPayments(records) {
      return result(records, "payment");
    },
    async exportRefunds(records) {
      return result(records, "refund");
    },
    async exportVendorBillsFuture(records) {
      return result(records, "vendor bill foundation");
    },
    async exportJournalBatch(records) {
      return result(records, "journal preview");
    },
    async getSyncStatus() {
      return { status: "development", lastSyncAt: null };
    },
    async validateWebhook() {
      return true;
    },
    async revokeConnection() {
      return { revoked: true, message: "Development connection revoked locally only." };
    }
  };
}
