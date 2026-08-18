import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { formatMoney } from "@/lib/financial/money";
import { createClient } from "@/lib/supabase/server";
import { hasWorkforcePermission } from "@/lib/workforce/permissions";
import { getWorkforceSummary } from "@/lib/workforce/reports";

type Relation<T> = T | T[] | null;

function first<T>(value: Relation<T> | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function hours(minutes: number | null | undefined) {
  return `${(Number(minutes ?? 0) / 60).toFixed(1)}h`;
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export default async function LaborCostReportPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const selectedLocationId = await getSelectedLocationId(profile);
  const locationIds = allowedLocationIds(profile, selectedLocationId);

  if (!hasWorkforcePermission(profile, "workforce.reports.read")) {
    return <div className="page-stack"><PageHeader description="Your current role does not include labor-cost report access." title="Labor Cost" /></div>;
  }

  const report = await getWorkforceSummary(supabase, { organizationId: profile.organizationId, locationIds });

  return (
    <div className="page-stack">
      <PageHeader
        action={<div className="header-actions"><Link className="secondary-button" href="/api/exports/payroll">Export Payroll CSV</Link><Link className="primary-button" href="/staff/timesheets">Timesheets</Link></div>}
        description="Payroll-support labor reporting with no tax, withholding, paycheck, or payroll processor activity."
        title="Labor Cost"
      />
      <section className="metric-grid">
        <StatCard detail="Loaded labor rows" label="Labor Cost" value={formatMoney(report.summary.laborCostCents)} />
        <StatCard detail="Completed time entries" label="Worked Hours" value={hours(report.summary.workedMinutes)} />
        <StatCard detail="Above threshold" label="Overtime" value={hours(report.summary.overtimeMinutes)} />
        <StatCard detail="Collected sales divided by labor hours" label="Revenue/Labor Hour" value={formatMoney(report.summary.revenuePerLaborHourCents)} />
        <StatCard detail="Treatment minutes over scheduled minutes" label="Provider Utilization" value={percent(report.summary.providerUtilization)} />
        <StatCard detail="Revenue minus inventory COGS and labor" label="Contribution" value={formatMoney(report.summary.contribution.contributionCents)} />
      </section>
      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Labor Cost Records</h2><span>Payroll-support rows</span></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Employee</th><th>Location</th><th>Period</th><th>Regular</th><th>Overtime</th><th>PTO</th><th>Total</th></tr></thead>
              <tbody>
                {report.laborCosts.map((row) => {
                  const user = first(row.users);
                  const location = first(row.locations);
                  const period = first(row.pay_periods);
                  return <tr key={row.id}><td>{user?.full_name ?? "Team member"}</td><td>{location?.name ?? "Location"}</td><td>{period?.start_date} to {period?.end_date}</td><td>{hours(row.regular_minutes)}</td><td>{hours(row.overtime_minutes)}</td><td>{hours(row.pto_minutes)}</td><td>{formatMoney(row.total_cost_cents)}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Attendance Exceptions</h2><span>Review before approval</span></div>
          <div className="record-list">{report.attendanceExceptions.map((exception) => {
            const user = first(exception.users);
            const location = first(exception.locations);
            return <article key={exception.id}><strong>{user?.full_name ?? "Team member"} - {exception.exception_type}</strong><p>{location?.name ?? "Location"} - {exception.event_date} - {exception.status}</p></article>;
          })}</div>
        </section>
      </section>
    </div>
  );
}
