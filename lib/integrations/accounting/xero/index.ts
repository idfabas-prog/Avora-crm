import { assertNoLiveAccountingAction } from "../../../accounting/calculations.ts";
import type { AccountingProvider } from "../types";

export function createXeroProvider(): AccountingProvider {
  return {
    name: "xero",
    async testConnection() {
      return { ok: false, message: "Xero foundation is configured, but live OAuth is disabled in Phase 18." };
    },
    async fetchChartOfAccounts() {
      assertNoLiveAccountingAction("Xero account sync");
    },
    async fetchClassesTrackingCategories() {
      assertNoLiveAccountingAction("Xero tracking category sync");
    },
    async exportCustomers() {
      assertNoLiveAccountingAction("Xero contact export");
    },
    async exportSales() {
      assertNoLiveAccountingAction("Xero invoice export");
    },
    async exportPayments() {
      assertNoLiveAccountingAction("Xero payment export");
    },
    async exportRefunds() {
      assertNoLiveAccountingAction("Xero credit note export");
    },
    async exportVendorBillsFuture() {
      assertNoLiveAccountingAction("Xero bill export");
    },
    async exportJournalBatch() {
      assertNoLiveAccountingAction("Xero manual journal export");
    },
    async getSyncStatus() {
      return { status: "disabled_foundation", lastSyncAt: null };
    },
    async validateWebhook() {
      return false;
    },
    async revokeConnection() {
      return { revoked: false, message: "No live Xero connection exists in Phase 18." };
    }
  };
}
