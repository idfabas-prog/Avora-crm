export type AccountingProviderName = "quickbooks_online" | "xero" | "csv_export" | "other";

export type AccountingAccount = {
  externalAccountId: string;
  accountName: string;
  accountType: string;
  accountSubtype?: string | null;
  active: boolean;
};

export type AccountingTrackingCategory = {
  id: string;
  name: string;
  type: "location" | "class" | "tracking_category" | "entity";
};

export type AccountingExportResult = {
  success: boolean;
  providerTransactionId?: string | null;
  message: string;
  recordsProcessed: number;
};

export type AccountingProvider = {
  name: AccountingProviderName;
  testConnection(): Promise<{ ok: boolean; message: string }>;
  fetchChartOfAccounts(): Promise<AccountingAccount[]>;
  fetchClassesTrackingCategories(): Promise<AccountingTrackingCategory[]>;
  exportCustomers(records: unknown[]): Promise<AccountingExportResult>;
  exportSales(records: unknown[]): Promise<AccountingExportResult>;
  exportPayments(records: unknown[]): Promise<AccountingExportResult>;
  exportRefunds(records: unknown[]): Promise<AccountingExportResult>;
  exportVendorBillsFuture(records: unknown[]): Promise<AccountingExportResult>;
  exportJournalBatch(records: unknown[]): Promise<AccountingExportResult>;
  getSyncStatus(): Promise<{ status: string; lastSyncAt: string | null }>;
  validateWebhook(payload: unknown, signature?: string | null): Promise<boolean>;
  revokeConnection(): Promise<{ revoked: boolean; message: string }>;
};
