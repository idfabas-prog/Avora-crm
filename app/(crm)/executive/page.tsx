import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { AI_ASSISTANT_DISPLAY_NAME } from "@/lib/config/branding";
import { getSelectedLocationId } from "@/lib/crm/location";
import { assertExecutivePermission } from "@/lib/executive/permissions";
import { getExecutiveReport } from "@/lib/executive/reports";
import type { ExecutivePeriod } from "@/lib/executive/types";
import { formatMoney } from "@/lib/financial/money";
import { createClient } from "@/lib/supabase/server";

const periods: Array<{ label: string; value: ExecutivePeriod }> = [
  { label: "Today", value: "today" },
  { label: "This Week", value: "this_week" },
  { label: "This Month", value: "this_month" },
  { label: "This Quarter", value: "this_quarter" },
  { label: "YTD", value: "year_to_date" }
];

function asPercent(value: number | null) {
  if (value === null) return "N/A";
  return `${(value * 100).toFixed(1)}%`;
}

function trendText(value: { absoluteChange: number; percentChange: number | null }) {
  const percent = value.percentChange === null ? "from zero baseline" : `${(value.percentChange * 100).toFixed(1)}%`;
  return `${value.absoluteChange >= 0 ? "+" : ""}${formatMoney(value.absoluteChange)} ${percent}`;
}

export default async function ExecutivePage({ searchParams }: { searchParams: Promise<{ period?: ExecutivePeriod }> }) {
  const params = await searchParams;
  const profile = await requireCurrentProfile();
  assertExecutivePermission(profile, "executive.read");
  const selectedLocationId = await getSelectedLocationId(profile);
  const supabase = await createClient();
  const report = await getExecutiveReport(supabase, profile, {
    period: params.period ?? "this_month",
    selectedLocationId
  });
  const bestLocation = [...report.locationScorecards].sort((a, b) => b.score - a.score)[0];
  const attentionLocation = [...report.locationScorecards].sort((a, b) => a.score - b.score)[0];
  const activeAlerts = report.alerts.filter((alert) => alert.status !== "resolved");

  return (
    <div className="page-stack">
      <PageHeader
        action={
          <div className="header-actions">
            <Link className="secondary-button" href="/api/exports/executive?type=scorecards">Export Scorecards</Link>
            <Link className="secondary-button" href="/executive/alerts">Owner Alerts</Link>
            <Link className="secondary-button" href="/settings/executive/targets">Targets</Link>
            <Link className="primary-button" href="/ai">{AI_ASSISTANT_DISPLAY_NAME} Brief</Link>
          </div>
        }
        description={`${report.range.label} owner operating view across authorized locations. Contribution is operational before overhead, not GAAP profit or EBITDA.`}
        title="Executive Command Center"
      />

      <section className="settings-nav" aria-label="Executive date range">
        {periods.map((period) => (
          <Link className={period.value === report.range.period ? "active" : undefined} href={`/executive?period=${period.value}`} key={period.value}>
            {period.label}
          </Link>
        ))}
      </section>

      <section className="metric-grid">
        <StatCard detail={trendText(report.trends.netCollectedRevenueCents)} label="Net Collected Revenue" value={formatMoney(report.company.netCollectedRevenueCents)} />
        <StatCard detail="Operational, before overhead" label="Contribution" value={formatMoney(report.company.contributionBeforeOverheadCents)} />
        <StatCard detail="Contribution / net collected" label="Contribution Margin" value={asPercent(report.company.contributionMarginPercent)} />
        <StatCard detail={`${report.company.marketingSpendCents ? report.company.roas.toFixed(1) : "0.0"}x collected ROAS`} label="Marketing Spend" value={formatMoney(report.company.marketingSpendCents)} />
        <StatCard detail={`${report.company.soldCount} sold from ${report.company.showedConsults} showed`} label="Close Rate" value={asPercent(report.company.closeRatePercent)} />
        <StatCard detail={`${report.company.noShowConsults} no-shows from ${report.company.bookedConsults} booked`} label="No-Show Rate" value={asPercent(report.company.noShowRatePercent)} />
        <StatCard detail="Aggregate labor cost only" label="Labor Cost %" value={asPercent(report.company.directLaborCostCents ? report.company.directLaborCostCents / Math.max(1, report.company.netCollectedRevenueCents) : 0)} />
        <StatCard detail="Active or trial" label="Memberships" value={String(report.company.activeMemberships)} />
      </section>

      <section className="dashboard-grid">
        <section className="panel wide-panel">
          <div className="panel-header"><h2>Location Scorecards</h2><span>Target-based statuses</span></div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Location</th>
                  <th>Score</th>
                  <th>Net Collected</th>
                  <th>Contribution</th>
                  <th>ROAS</th>
                  <th>Close</th>
                  <th>Labor %</th>
                  <th>NPS</th>
                  <th>Attention</th>
                </tr>
              </thead>
              <tbody>
                {report.locationScorecards.map((scorecard) => (
                  <tr key={scorecard.locationId}>
                    <td><Link href={`/executive/locations/${scorecard.locationId}`}>{scorecard.locationName}</Link><br /><span>{scorecard.maturityStage.replace("_", " ")}</span></td>
                    <td><strong>{scorecard.score}/100</strong></td>
                    <td>{formatMoney(scorecard.kpis.netCollectedRevenueCents)}<br /><StatusBadge status={scorecard.statuses.revenue} /></td>
                    <td>{asPercent(scorecard.kpis.contributionMarginPercent)}<br /><StatusBadge status={scorecard.statuses.contributionMargin} /></td>
                    <td>{scorecard.kpis.roas.toFixed(1)}x<br /><StatusBadge status={scorecard.statuses.roas} /></td>
                    <td>{asPercent(scorecard.kpis.closeRatePercent)}<br /><StatusBadge status={scorecard.statuses.closeRate} /></td>
                    <td>{asPercent(scorecard.kpis.directLaborCostCents / Math.max(1, scorecard.kpis.netCollectedRevenueCents))}<br /><StatusBadge status={scorecard.statuses.laborCostPercent} /></td>
                    <td>{scorecard.kpis.nps ?? "N/A"}<br /><StatusBadge status={scorecard.statuses.nps} /></td>
                    <td>{scorecard.kpis.lowStockItems + scorecard.kpis.outOfStockItems} inventory alerts</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header"><h2>What Needs Attention</h2><span>{activeAlerts.length} active</span></div>
          <div className="record-list">
            {activeAlerts.slice(0, 6).map((alert) => (
              <article key={alert.identityKey}>
                <strong>{alert.title}</strong>
                <p>{alert.summary}</p>
                <span>{alert.locationName} · {alert.severity}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header"><h2>Executive Brief</h2><span>Deterministic</span></div>
          <div className="record-list">
            <article><strong>Strongest location</strong><p>{bestLocation ? `${bestLocation.locationName} at ${bestLocation.score}/100` : "No location data"}</p></article>
            <article><strong>Needs the most attention</strong><p>{attentionLocation ? `${attentionLocation.locationName} at ${attentionLocation.score}/100` : "No location data"}</p></article>
            <article><strong>Retention</strong><p>NPS {report.company.nps ?? "N/A"} · referral revenue {formatMoney(report.company.referralRevenueCents)} · reactivation revenue {formatMoney(report.company.reactivationRevenueCents)}</p></article>
          </div>
        </section>
      </section>

      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Revenue & Contribution</h2><span>Before overhead</span></div>
          <dl className="settings-list">
            <div><dt>Gross Sales</dt><dd>{formatMoney(report.company.grossSalesCents)}</dd></div>
            <div><dt>Collected Revenue</dt><dd>{formatMoney(report.company.collectedRevenueCents)}</dd></div>
            <div><dt>Refunds</dt><dd>{formatMoney(report.company.refundsCents)}</dd></div>
            <div><dt>Inventory COGS</dt><dd>{formatMoney(report.company.inventoryCogsCents)}</dd></div>
            <div><dt>Direct Labor Cost</dt><dd>{formatMoney(report.company.directLaborCostCents)}</dd></div>
            <div><dt>Outstanding Balance</dt><dd>{formatMoney(report.company.outstandingBalanceCents)}</dd></div>
          </dl>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Sales Funnel</h2><span>Company-wide</span></div>
          <dl className="settings-list">
            <div><dt>Leads</dt><dd>{report.company.leads}</dd></div>
            <div><dt>Booked Consults</dt><dd>{report.company.bookedConsults}</dd></div>
            <div><dt>Showed</dt><dd>{report.company.showedConsults} · {asPercent(report.company.showRatePercent)}</dd></div>
            <div><dt>Sold</dt><dd>{report.company.soldCount} · {asPercent(report.company.closeRatePercent)}</dd></div>
            <div><dt>Paid</dt><dd>{report.company.paidSalesCount}</dd></div>
            <div><dt>Average Ticket</dt><dd>{formatMoney(report.company.averageTicketCents)}</dd></div>
          </dl>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Forecast</h2><span>Run-rate estimate</span></div>
          <div className="record-list">
            {report.forecasts.map((forecast) => (
              <article key={forecast.metricKey}>
                <strong>{forecast.label}</strong>
                <p>Actual {formatMoney(forecast.actualValue)} · Forecast {formatMoney(forecast.forecastValue)}</p>
                <span>{forecast.confidence}{forecast.gapToTarget === null ? "" : ` · Gap ${formatMoney(forecast.gapToTarget)}`}</span>
              </article>
            ))}
          </div>
        </section>
      </section>

      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Marketing</h2><span>Efficiency</span></div>
          <dl className="settings-list">
            <div><dt>Spend</dt><dd>{formatMoney(report.company.marketingSpendCents)}</dd></div>
            <div><dt>Leads</dt><dd>{report.company.leads}</dd></div>
            <div><dt>CPL</dt><dd>{formatMoney(Math.round(report.company.marketingSpendCents / Math.max(1, report.company.leads)))}</dd></div>
            <div><dt>Collected ROAS</dt><dd>{report.company.roas.toFixed(1)}x</dd></div>
            <div><dt>Contribution ROAS</dt><dd>{safeContributionRoas(report.company.contributionBeforeOverheadCents, report.company.marketingSpendCents)}</dd></div>
          </dl>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Operations</h2><span>Clinical + workforce</span></div>
          <dl className="settings-list">
            <div><dt>Treatments Completed</dt><dd>{report.company.treatmentCompleted}</dd></div>
            <div><dt>Provider Utilization</dt><dd>{asPercent(report.company.providerUtilizationPercent)}</dd></div>
            <div><dt>Unsigned Notes</dt><dd>{report.company.unsignedNotes}</dd></div>
            <div><dt>Clocked In Now</dt><dd>{report.company.clockedInNow}</dd></div>
            <div><dt>Open Attendance Exceptions</dt><dd>{report.company.openAttendanceExceptions}</dd></div>
            <div><dt>Revenue / Labor Hour</dt><dd>{formatMoney(report.company.revenuePerLaborHourCents)}</dd></div>
          </dl>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Inventory & Retention</h2><span>Risk signals</span></div>
          <dl className="settings-list">
            <div><dt>Inventory Value</dt><dd>{formatMoney(report.company.inventoryValueCents)}</dd></div>
            <div><dt>Low / Out of Stock</dt><dd>{report.company.lowStockItems} / {report.company.outOfStockItems}</dd></div>
            <div><dt>Expiring 30 Days</dt><dd>{report.company.expiringSoonItems}</dd></div>
            <div><dt>Open Negative Feedback</dt><dd>{report.company.openNegativeFeedback}</dd></div>
            <div><dt>Referral Revenue</dt><dd>{formatMoney(report.company.referralRevenueCents)}</dd></div>
            <div><dt>Reactivation Revenue</dt><dd>{formatMoney(report.company.reactivationRevenueCents)}</dd></div>
          </dl>
        </section>
      </section>
    </div>
  );
}

function safeContributionRoas(contributionCents: number, spendCents: number) {
  if (!spendCents) return "0.0x";
  return `${(contributionCents / spendCents).toFixed(1)}x`;
}
