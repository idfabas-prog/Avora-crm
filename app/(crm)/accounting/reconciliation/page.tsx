import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { APP_DISPLAY_NAME } from "@/lib/config/branding";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { fromDbStatus, formatDate } from "@/lib/crm/constants";
import { formatMoney } from "@/lib/financial/money";
import { hasAccountingPermission } from "@/lib/accounting/permissions";
import { getReconciliationSummary } from "@/lib/accounting/reports";
import { createClient } from "@/lib/supabase/server";

export default async function ReconciliationPage() {
  const profile = await requireCurrentProfile();
  if (!hasAccountingPermission(profile, "accounting.reconciliation.read")) {
    return <div className="page-stack"><PageHeader title="Reconciliation" description="Your role does not include reconciliation access." /></div>;
  }
  const supabase = await createClient();
  const selectedLocationId = await getSelectedLocationId(profile);
  const report = await getReconciliationSummary(supabase, profile, allowedLocationIds(profile, selectedLocationId));

  return (
    <div className="page-stack">
      <PageHeader description="Processor settlement support. No live bank connection is used in Phase 18." title="Reconciliation" />
      <section className="metric-grid">
        <StatCard detail="Processor rows" label="Matched" value={String(report.summary.matched)} />
        <StatCard detail="Needs review" label="Partial" value={String(report.summary.partial)} />
        <StatCard detail={`No ${APP_DISPLAY_NAME} match yet`} label="Unmatched" value={String(report.summary.unmatched)} />
        <StatCard detail="Gross processor amount" label="Gross" value={formatMoney(report.summary.grossCents)} />
        <StatCard detail="Processor fees" label="Fees" value={formatMoney(report.summary.feesCents)} />
        <StatCard detail="Settlement support" label="Net" value={formatMoney(report.summary.netCents)} />
      </section>
      <section className="panel wide-panel">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Processor</th><th>Transaction</th><th>Location</th><th>Status</th><th>Gross</th><th>Fee</th><th>Net</th><th>Settlement</th></tr></thead>
            <tbody>
              {report.rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.processor}</td>
                  <td>{row.processor_transaction_id}</td>
                  <td>{row.locationName}</td>
                  <td><StatusBadge status={fromDbStatus(row.status)} /></td>
                  <td>{formatMoney(Number(row.gross_cents ?? 0))}</td>
                  <td>{formatMoney(Number(row.fee_cents ?? 0))}</td>
                  <td>{formatMoney(Number(row.net_cents ?? 0))}</td>
                  <td>{formatDate(row.settlement_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
