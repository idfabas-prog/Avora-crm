import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { hasCallPermission } from "@/lib/calls/permissions";
import { getCallDashboardReport } from "@/lib/calls/reports";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { formatMoney } from "@/lib/financial/money";
import { createClient } from "@/lib/supabase/server";

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

export default async function CallDashboardPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  if (!hasCallPermission(profile, "calls.analytics.read")) {
    return <div className="page-stack"><PageHeader description="Your role does not include call analytics access." title="Call Center Dashboard" /></div>;
  }

  const selectedLocationId = await getSelectedLocationId(profile);
  const report = await getCallDashboardReport(supabase, profile, allowedLocationIds(profile, selectedLocationId));

  return (
    <div className="page-stack">
      <PageHeader action={<Link className="secondary-button" href="/calls">Call Log</Link>} description="Operational call metrics by location, staff, source, and queue." title="Call Center Dashboard" />
      <section className="metric-grid">
        <StatCard detail="Today and seeded demo calls in scope" label="Total Calls" value={String(report.metrics.totalCalls)} />
        <StatCard detail="Inbound calls not missed" label="Answer Rate" value={pct(report.metrics.answerRate)} />
        <StatCard detail="Missed / inbound calls" label="Missed Rate" value={pct(report.metrics.missedRate)} />
        <StatCard detail="Average call duration" label="Avg Handle" value={`${Math.round(report.metrics.averageHandleSeconds)}s`} />
        <StatCard detail="Average ring or queue time" label="Avg Ring" value={`${Math.round(report.metrics.averageRingSeconds)}s`} />
        <StatCard detail="Revenue minus refunds" label="Call Revenue" value={formatMoney(report.metrics.netRevenueCents)} />
      </section>
      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>By Location</h2><span>Location-scoped RLS still applies</span></div>
          <div className="record-list">
            {report.byLocation.map((row) => (
              <article key={row.id}><strong>{row.name}</strong><p>{row.metrics.totalCalls} calls - {pct(row.metrics.missedRate)} missed - {pct(row.metrics.bookingRate)} booked</p><span>{formatMoney(row.metrics.netRevenueCents)} revenue</span></article>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>By Staff</h2><span>Duration is not treated as quality</span></div>
          <div className="record-list">
            {report.byStaff.map((row) => (
              <article key={row.id}><strong>{row.name}</strong><p>{row.metrics.totalCalls} handled - {row.metrics.bookedCalls} bookings - {row.metrics.sales} sales</p><span>{Math.round(row.metrics.averageHandleSeconds)}s average handle</span></article>
            ))}
          </div>
        </section>
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Source Performance</h2><span>Tracking-number attribution snapshot</span></div>
        <div className="record-list">
          {report.bySource.map((row) => (
            <article key={row.id}><strong>{row.name}</strong><p>{row.metrics.totalCalls} calls - {row.metrics.bookedCalls} bookings - {row.metrics.sales} sales</p><span>{formatMoney(row.metrics.netRevenueCents)} net collected</span></article>
          ))}
        </div>
      </section>
    </div>
  );
}
