import { assertNoLiveAccountingAction } from "../../../accounting/calculations.ts";
import type { AccountingProvider } from "../types";

export function createQuickBooksProvider(): AccountingProvider {
  return {
    name: "quickbooks_online",
    async testConnection() {
      return { ok: false, message: "QuickBooks Online foundation is configured, but live OAuth is disabled in Phase 18." };
    },
    async fetchChartOfAccounts() {
      assertNoLiveAccountingAction("QuickBooks chart sync");
    },
    async fetchClassesTrackingCategories() {
      assertNoLiveAccountingAction("QuickBooks class/location sync");
    },
    async exportCustomers() {
      assertNoLiveAccountingAction("QuickBooks customer export");
    },
    async exportSales() {
      assertNoLiveAccountingAction("QuickBooks sale export");
    },
    async exportPayments() {
      assertNoLiveAccountingAction("QuickBooks payment export");
    },
    async exportRefunds() {
      assertNoLiveAccountingAction("QuickBooks refund export");
    },
    async exportVendorBillsFuture() {
      assertNoLiveAccountingAction("QuickBooks vendor bill export");
    },
    async exportJournalBatch() {
      assertNoLiveAccountingAction("QuickBooks journal posting");
    },
    async getSyncStatus() {
      return { status: "disabled_foundation", lastSyncAt: null };
    },
    async validateWebhook() {
      return false;
    },
    async revokeConnection() {
      return { revoked: false, message: "No live QuickBooks connection exists in Phase 18." };
    }
  };
}
