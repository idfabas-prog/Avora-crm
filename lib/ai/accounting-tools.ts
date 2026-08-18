import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentProfile } from "@/lib/auth/profile";
import { AI_ASSISTANT_DISPLAY_NAME, APP_DISPLAY_NAME } from "@/lib/config/branding";
import { formatMoney } from "@/lib/financial/money";
import {
  accountingFactsFromSummary,
  getAccountingCloseStatus,
  getAccountingDashboard,
  getAccountingExceptions,
  getAccountingExportSummary,
  getCOGSExportSummary,
  getManagementFeeAccountingSummary,
  getReconciliationSummary,
  getRoyaltyAccountingSummary,
  getUnmappedAccountingRecords
} from "@/lib/accounting/reports";

export async function getAccountingIntelligenceSummary(supabase: SupabaseClient, profile: CurrentProfile, locationIds: string[], question: string) {
  const text = question.toLowerCase();
  const dashboard = await getAccountingDashboard(supabase, profile, locationIds);
  const close = await getAccountingCloseStatus(supabase, profile);
  const exceptions = await getAccountingExceptions(supabase, profile, locationIds);
  const reconciliation = await getReconciliationSummary(supabase, profile, locationIds);
  const exports = await getAccountingExportSummary(supabase, profile);
  const unmapped = await getUnmappedAccountingRecords(supabase, profile);
  const royalties = await getRoyaltyAccountingSummary(supabase, profile);
  const managementFees = await getManagementFeeAccountingSummary(supabase, profile);
  const cogs = await getCOGSExportSummary(supabase, profile, locationIds);

  return {
    facts: [
      ...accountingFactsFromSummary(dashboard),
      close ? `Current accounting close readiness: ${close.readiness}% with ${close.blockers.length} blocker(s).` : "No open accounting period was found.",
      `Royalty export support: ${royalties.count} records totaling ${formatMoney(royalties.amountCents)}.`,
      `Management-fee export support: ${managementFees.count} records totaling ${formatMoney(managementFees.amountCents)}.`,
      `COGS export support: ${cogs.count} usage rows totaling ${formatMoney(cogs.amountCents)}.`
    ],
    analysis: [
      text.includes("close")
        ? `Close blockers: ${close?.blockers.length ? close.blockers.join("; ") : "none from the current checklist and exception snapshot"}.`
        : `Accounting intelligence is read-only and based on ${APP_DISPLAY_NAME} operational export support, not a formal GL.`,
      `Unmapped location count: ${unmapped.missingLocationMappings.length}; unmapped customer sample count: ${unmapped.missingCustomerMappings}.`,
      `Reconciliation status: ${reconciliation.summary.matched} matched, ${reconciliation.summary.partial} partial, ${reconciliation.summary.unmatched} unmatched.`
    ],
    recommendations: [
      "Resolve critical accounting exceptions before approving export batches.",
      "Review any unbalanced batch in journal preview before CSV/mock export.",
      `Use accounting settings to maintain mappings; ${AI_ASSISTANT_DISPLAY_NAME} cannot change mappings or post journals.`
    ],
    trace: {
      tools: [
        "getAccountingCloseStatus",
        "getAccountingExceptions",
        "getReconciliationSummary",
        "getUnmappedAccountingRecords",
        "getAccountingExportSummary",
        "getRoyaltyAccountingSummary",
        "getManagementFeeAccountingSummary",
        "getCOGSExportSummary"
      ],
      locations: locationIds,
      recordCounts: {
        accounting_connections: dashboard.connections.length,
        accounting_export_batches: exports.summary.batches,
        accounting_exceptions: exceptions.length,
        processor_reconciliation_records: reconciliation.rows.length,
        accounting_close_items: close?.items.length ?? 0,
        accounting_unmapped_locations: unmapped.missingLocationMappings.length,
        royalty_records: royalties.count,
        management_fee_records: managementFees.count,
        cogs_usage_rows: cogs.count
      },
      filters: { question }
    }
  };
}
