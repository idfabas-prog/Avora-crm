import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { formatDate, fromDbStatus } from "@/lib/crm/constants";
import { formatMoney } from "@/lib/financial/money";
import { hasAccountingPermission } from "@/lib/accounting/permissions";
import { getAccountingDashboard } from "@/lib/accounting/reports";
import { getAccountingConfig } from "@/lib/accounting/config";
import { createClient } from "@/lib/supabase/server";

export default async function AccountingPage() {
  const profile = await requireCurrentProfile();
  if (!hasAccountingPermission(profile, "accounting.read")) {
    return <div className="page-stack"><PageHeader title="Accounting" description="Your role does not include accounting access." /></div>;
  }

  const supabase = await createClient();
  const selectedLocationId = await getSelectedLocationId(profile);
  const report = await getAccountingDashboard(supabase, profile, allowedLocationIds(profile, selectedLocationId));
  const config = getAccountingConfig();

  return (
    <div className="page-stack">
      <PageHeader
        action={<div className="header-actions"><Link className="secondary-button" href="/accounting/journal-preview">Journal Preview</Link><Link className="secondary-button" href="/accounting/reconciliation">Reconciliation</Link><Link className="primary-button" href="/settings/accounting">Settings</Link></div>}
        description="Operational accounting export support, reconciliation, and month-end close readiness."
        title="Accounting"
      />
      <section className="metric-grid">
        <StatCard detail={report.summary.currentPeriod ? `${formatDate(report.summary.currentPeriod.period_start)} to ${formatDate(report.summary.currentPeriod.period_end)}` : "No period seeded"} label="Open Period" value={report.summary.currentPeriod ? fromDbStatus(report.summary.currentPeriod.status) : "Missing"} />
        <StatCard detail="Location/customer/entity gaps" label="Unmapped Records" value={String(report.summary.unmappedRecords)} />
        <StatCard detail={formatMoney(report.summary.unreconciledAmountCents)} label="Unreconciled" value={String(report.summary.unreconciledPayments)} />
        <StatCard detail="Draft or review" label="Export Batches" value={String(report.summary.draftExportBatches)} />
        <StatCard detail="Ready for CSV/mock export" label="Approved" value={String(report.summary.approvedNotExported)} />
        <StatCard detail={`${report.summary.criticalExceptions} critical`} label="Exceptions" value={String(report.summary.openExceptions)} />
        <StatCard detail={report.summary.lastSyncAt ? formatDate(report.summary.lastSyncAt) : "Development provider"} label="Last Sync" value={config.mode} />
        <StatCard detail="Active chart rows" label="Accounts" value={String(report.summary.accountCount)} />
      </section>
      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Connection</h2><span>No tokens stored in CRM tables</span></div>
          <dl className="settings-list">
            <div><dt>Provider</dt><dd>{report.summary.activeConnection?.provider ?? "None"}</dd></div>
            <div><dt>Status</dt><dd>{report.summary.activeConnection?.status ?? "Not configured"}</dd></div>
            <div><dt>Company</dt><dd>{report.summary.activeConnection?.company_name ?? "Development CSV"}</dd></div>
            <div><dt>Mode</dt><dd>{config.mode}</dd></div>
          </dl>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Recent Batches</h2><span>Approval blocks unbalanced journals</span></div>
          <div className="record-list">
            {report.batches.slice(0, 5).map((batch) => (
              <article key={batch.id}>
                <strong>{fromDbStatus(batch.batch_type)}</strong>
                <p>{formatDate(batch.period_start)} to {formatDate(batch.period_end)} - {formatMoney(Number(batch.debit_total_cents ?? 0))} debits</p>
                <StatusBadge status={fromDbStatus(batch.status)} />
              </article>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Open Exceptions</h2><span>Accounting review queue</span></div>
          <div className="record-list">
            {report.exceptions.filter((item) => item.status !== "resolved").slice(0, 5).map((exception) => (
              <article key={exception.id}><strong>{fromDbStatus(exception.exception_type)}</strong><p>{exception.severity} - {exception.status}</p></article>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}
