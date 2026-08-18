import { AccountingBatchActions } from "@/components/crm/AccountingForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { APP_DISPLAY_NAME } from "@/lib/config/branding";
import { fromDbStatus, formatDate } from "@/lib/crm/constants";
import { formatMoney } from "@/lib/financial/money";
import { hasAccountingPermission } from "@/lib/accounting/permissions";
import { getAccountingExportSummary } from "@/lib/accounting/reports";
import { createClient } from "@/lib/supabase/server";

export default async function JournalPreviewPage() {
  const profile = await requireCurrentProfile();
  if (!hasAccountingPermission(profile, "accounting.exports.read")) {
    return <div className="page-stack"><PageHeader title="Journal Preview" description="Your role does not include accounting export access." /></div>;
  }
  const supabase = await createClient();
  const report = await getAccountingExportSummary(supabase, profile);

  return (
    <div className="page-stack">
      <PageHeader description={`Deterministic ${APP_DISPLAY_NAME} export batches for review before CSV/mock provider export.`} title="Journal Preview" />
      <section className="panel wide-panel">
        <div className="panel-header"><h2>Export Batches</h2><span>{report.summary.unbalanced} unbalanced</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Type</th><th>Period</th><th>Status</th><th>Records</th><th>Debits</th><th>Credits</th><th>Balanced</th><th>Actions</th></tr></thead>
            <tbody>
              {report.batches.map((batch) => {
                const balanced = Number(batch.debit_total_cents ?? 0) === Number(batch.credit_total_cents ?? 0);
                return (
                  <tr key={batch.id}>
                    <td>{fromDbStatus(batch.batch_type)}</td>
                    <td>{formatDate(batch.period_start)} to {formatDate(batch.period_end)}</td>
                    <td><StatusBadge status={fromDbStatus(batch.status)} /></td>
                    <td>{batch.record_count}</td>
                    <td>{formatMoney(Number(batch.debit_total_cents ?? 0))}</td>
                    <td>{formatMoney(Number(batch.credit_total_cents ?? 0))}</td>
                    <td>{balanced ? "Yes" : "No"}</td>
                    <td><AccountingBatchActions balanced={balanced} batchId={batch.id} status={batch.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel wide-panel">
        <div className="panel-header"><h2>Journal Lines</h2><span>Preview only</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Source</th><th>Account</th><th>Debit/Credit</th><th>Amount</th><th>Status</th><th>Description</th></tr></thead>
            <tbody>
              {report.items.map((item) => (
                <tr key={item.id}>
                  <td>{fromDbStatus(item.source_type)}</td>
                  <td>{item.external_account_id ?? "Unmapped"}</td>
                  <td>{fromDbStatus(item.debit_credit)}</td>
                  <td>{formatMoney(Number(item.amount_cents ?? 0))}</td>
                  <td><StatusBadge status={fromDbStatus(item.export_status)} /></td>
                  <td>{item.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
