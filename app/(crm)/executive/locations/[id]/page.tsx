import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { assertExecutivePermission } from "@/lib/executive/permissions";
import { getExecutiveReport } from "@/lib/executive/reports";
import { formatMoney } from "@/lib/financial/money";
import { createClient } from "@/lib/supabase/server";

function asPercent(value: number | null) {
  if (value === null) return "N/A";
  return `${(value * 100).toFixed(1)}%`;
}

export default async function ExecutiveLocationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireCurrentProfile();
  assertExecutivePermission(profile, "executive.location.read");
  if (!profile.locations.some((location) => location.id === id)) notFound();
  const supabase = await createClient();
  const report = await getExecutiveReport(supabase, profile, { selectedLocationId: id, period: "this_month" });
  const scorecard = report.locationScorecards.find((item) => item.locationId === id);
  if (!scorecard) notFound();
  const locationAlerts = report.alerts.filter((alert) => alert.locationId === id || alert.locationId === null);

  return (
    <div className="page-stack">
      <PageHeader
        action={<div className="header-actions"><Link className="secondary-button" href="/executive">Command Center</Link><Link className="primary-button" href="/executive/alerts">Alerts</Link></div>}
        description={`${scorecard.locationName} operating profile. Aggregate clinical and labor data only.`}
        title={`${scorecard.locationName} Executive Scorecard`}
      />
      <section className="metric-grid">
        <StatCard detail={scorecard.statuses.revenue} label="Net Collected" value={formatMoney(scorecard.kpis.netCollectedRevenueCents)} />
        <StatCard detail={scorecard.statuses.contributionMargin} label="Contribution Margin" value={asPercent(scorecard.kpis.contributionMarginPercent)} />
        <StatCard detail={scorecard.statuses.roas} label="ROAS" value={`${scorecard.kpis.roas.toFixed(1)}x`} />
        <StatCard detail={scorecard.statuses.closeRate} label="Close Rate" value={asPercent(scorecard.kpis.closeRatePercent)} />
        <StatCard detail={scorecard.statuses.laborCostPercent} label="Labor Cost %" value={asPercent(scorecard.kpis.directLaborCostCents / Math.max(1, scorecard.kpis.netCollectedRevenueCents))} />
        <StatCard detail={scorecard.expansionReadiness.label} label="Executive Score" value={`${scorecard.score}/100`} />
      </section>
      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Financial</h2><span>Before overhead</span></div>
          <dl className="settings-list">
            <div><dt>Gross Sales</dt><dd>{formatMoney(scorecard.kpis.grossSalesCents)}</dd></div>
            <div><dt>Collected</dt><dd>{formatMoney(scorecard.kpis.collectedRevenueCents)}</dd></div>
            <div><dt>Refunds</dt><dd>{formatMoney(scorecard.kpis.refundsCents)}</dd></div>
            <div><dt>Inventory COGS</dt><dd>{formatMoney(scorecard.kpis.inventoryCogsCents)}</dd></div>
            <div><dt>Direct Labor</dt><dd>{formatMoney(scorecard.kpis.directLaborCostCents)}</dd></div>
            <div><dt>Outstanding</dt><dd>{formatMoney(scorecard.kpis.outstandingBalanceCents)}</dd></div>
          </dl>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Sales & Marketing</h2><span>Funnel</span></div>
          <dl className="settings-list">
            <div><dt>Leads</dt><dd>{scorecard.kpis.leads}</dd></div>
            <div><dt>Booked / Showed</dt><dd>{scorecard.kpis.bookedConsults} / {scorecard.kpis.showedConsults}</dd></div>
            <div><dt>No-Shows</dt><dd>{scorecard.kpis.noShowConsults} · {asPercent(scorecard.kpis.noShowRatePercent)}</dd></div>
            <div><dt>Marketing Spend</dt><dd>{formatMoney(scorecard.kpis.marketingSpendCents)}</dd></div>
            <div><dt>Average Ticket</dt><dd>{formatMoney(scorecard.kpis.averageTicketCents)}</dd></div>
          </dl>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Operations</h2><span>Aggregate only</span></div>
          <dl className="settings-list">
            <div><dt>Treatments Completed</dt><dd>{scorecard.kpis.treatmentCompleted}</dd></div>
            <div><dt>Provider Utilization</dt><dd>{asPercent(scorecard.kpis.providerUtilizationPercent)}</dd></div>
            <div><dt>Unsigned Notes</dt><dd>{scorecard.kpis.unsignedNotes}</dd></div>
            <div><dt>Clocked In</dt><dd>{scorecard.kpis.clockedInNow}</dd></div>
            <div><dt>Open Exceptions</dt><dd>{scorecard.kpis.openAttendanceExceptions}</dd></div>
            <div><dt>PTO Today</dt><dd>{scorecard.kpis.ptoToday}</dd></div>
          </dl>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Inventory</h2><span>Health</span></div>
          <dl className="settings-list">
            <div><dt>Inventory Value</dt><dd>{formatMoney(scorecard.kpis.inventoryValueCents)}</dd></div>
            <div><dt>Low Stock</dt><dd>{scorecard.kpis.lowStockItems}</dd></div>
            <div><dt>Out of Stock</dt><dd>{scorecard.kpis.outOfStockItems}</dd></div>
            <div><dt>Expiring Soon</dt><dd>{scorecard.kpis.expiringSoonItems}</dd></div>
            <div><dt>Open POs</dt><dd>{scorecard.kpis.openPurchaseOrders}</dd></div>
            <div><dt>Waste Cost</dt><dd>{formatMoney(scorecard.kpis.wasteCostCents)}</dd></div>
          </dl>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Retention</h2><span>Reputation + growth</span></div>
          <dl className="settings-list">
            <div><dt>NPS</dt><dd>{scorecard.kpis.nps ?? "N/A"}</dd></div>
            <div><dt>Average Rating</dt><dd>{scorecard.kpis.averageExternalRating ?? "N/A"}</dd></div>
            <div><dt>Open Negative Feedback</dt><dd>{scorecard.kpis.openNegativeFeedback}</dd></div>
            <div><dt>Referral Revenue</dt><dd>{formatMoney(scorecard.kpis.referralRevenueCents)}</dd></div>
            <div><dt>Reactivation Revenue</dt><dd>{formatMoney(scorecard.kpis.reactivationRevenueCents)}</dd></div>
          </dl>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Expansion Readiness</h2><StatusBadge status={scorecard.expansionReadiness.label} /></div>
          <div className="record-list">
            {scorecard.expansionReadiness.factors.map((factor) => <article key={factor}><p>{factor}</p></article>)}
          </div>
        </section>
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Location Alerts</h2><span>{locationAlerts.length}</span></div>
        <div className="record-list">
          {locationAlerts.map((alert) => <article key={alert.identityKey}><strong>{alert.title}</strong><p>{alert.summary}</p><span>{alert.severity} · {alert.status}</span></article>)}
        </div>
      </section>
    </div>
  );
}
