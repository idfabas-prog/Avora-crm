import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { formatMoney } from "@/lib/financial/money";
import { hasReputationPermission } from "@/lib/reputation/permissions";
import { getReputationReport } from "@/lib/reputation/reports";
import { createClient } from "@/lib/supabase/server";

export default async function LoyaltyPage() {
  const profile = await requireCurrentProfile();
  if (!hasReputationPermission(profile, "reputation.reports.read")) return <div className="page-stack"><PageHeader title="Patient Loyalty" description="Access denied." /></div>;
  const supabase = await createClient();
  const selectedLocationId = await getSelectedLocationId(profile);
  const locationIds = allowedLocationIds(profile, selectedLocationId);
  const report = await getReputationReport(supabase, { organizationId: profile.organizationId, locationIds });
  const count = (status: string) => report.loyaltyRows.filter((row) => row.loyalty_status === status).length;

  return (
    <div className="page-stack">
      <PageHeader description="Deterministic loyalty snapshots for retention planning. These are not manipulative behavioral scores." title="Patient Loyalty" />
      <section className="metric-grid">
        <StatCard detail="Currently engaged patients" label="Active" value={String(count("active"))} />
        <StatCard detail="High-value repeat patients" label="VIP" value={String(count("vip"))} />
        <StatCard detail="Needs retention review" label="At Risk" value={String(count("at_risk"))} />
        <StatCard detail="No recent visit" label="Inactive" value={String(count("inactive"))} />
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Loyalty Snapshot</h2><span>Sorted by reactivation priority</span></div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Patient</th><th>Location</th><th>Status</th><th>Visits</th><th>Treatments</th><th>Revenue</th><th>Months Since Visit</th><th>Referrals</th><th>Package Use</th><th>Priority</th></tr></thead><tbody>{report.loyaltyRows.sort((a, b) => b.priority - a.priority).map((row) => <tr key={row.id}><td>{row.contactName}</td><td>{row.locationName}</td><td>{row.loyalty_status}</td><td>{row.total_visits}</td><td>{row.completed_treatments}</td><td>{formatMoney(row.lifetime_collected_revenue_cents)}</td><td>{row.months_since_last_visit ?? "n/a"}</td><td>{row.referral_count}</td><td>{row.package_utilization_percent ?? "n/a"}%</td><td>{row.priority}</td></tr>)}</tbody></table></div>
      </section>
    </div>
  );
}
