import { CloseItemStatusForm, ClosePeriodForm, ReopenPeriodForm } from "@/components/crm/AccountingForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { APP_DISPLAY_NAME } from "@/lib/config/branding";
import { fromDbStatus, formatDate } from "@/lib/crm/constants";
import { hasAccountingPermission } from "@/lib/accounting/permissions";
import { getAccountingCloseStatus } from "@/lib/accounting/reports";
import { createClient } from "@/lib/supabase/server";

export default async function AccountingClosePage() {
  const profile = await requireCurrentProfile();
  if (!hasAccountingPermission(profile, "accounting.close.read")) {
    return <div className="page-stack"><PageHeader title="Month-End Close" description="Your role does not include close access." /></div>;
  }
  const supabase = await createClient();
  const close = await getAccountingCloseStatus(supabase, profile);

  if (!close) {
    return <div className="page-stack"><PageHeader title="Month-End Close" description="No accounting period was found." /></div>;
  }

  const complete = close.items.filter((item) => item.status === "complete").length;
  const canManage = hasAccountingPermission(profile, "accounting.close.manage");

  return (
    <div className="page-stack">
      <PageHeader description={`${APP_DISPLAY_NAME} operational close checklist. This does not close external books.`} title="Month-End Close" />
      <section className="metric-grid">
        <StatCard detail={`${formatDate(close.period.period_start)} to ${formatDate(close.period.period_end)}`} label="Period" value={fromDbStatus(close.period.status)} />
        <StatCard detail={`${complete} of ${close.items.length} checklist rows`} label="Readiness" value={`${close.readiness}%`} />
        <StatCard detail="Must resolve before close" label="Blockers" value={String(close.blockers.length)} />
        <StatCard detail="Open accounting exceptions" label="Exceptions" value={String(close.exceptions.length)} />
      </section>
      <section className="dashboard-grid">
        <section className="panel wide-panel">
          <div className="panel-header"><h2>Checklist</h2><span>Required items gate close readiness</span></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Category</th><th>Title</th><th>Required</th><th>Status</th><th>Completed</th><th>Action</th></tr></thead>
              <tbody>
                {close.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.category}</td>
                    <td>{item.title}</td>
                    <td>{item.required ? "Yes" : "No"}</td>
                    <td><StatusBadge status={fromDbStatus(item.status)} /></td>
                    <td>{formatDate(item.completed_at)}</td>
                    <td>{canManage ? <CloseItemStatusForm currentStatus={item.status} itemId={item.id} /> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Close Controls</h2><span>No external filing or GL close</span></div>
          {close.blockers.length ? <div className="record-list">{close.blockers.map((blocker) => <article key={blocker}><strong>{blocker}</strong></article>)}</div> : null}
          {canManage ? <ClosePeriodForm periodId={close.period.id} /> : null}
          {canManage && close.period.status === "closed" ? <ReopenPeriodForm periodId={close.period.id} /> : null}
        </section>
      </section>
    </div>
  );
}
