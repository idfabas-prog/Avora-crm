import { CommissionStatusForm } from "@/components/crm/FinancialForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { fromDbStatus } from "@/lib/crm/constants";
import { formatMoney } from "@/lib/financial/money";

export default async function CommissionsPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const selectedLocationId = await getSelectedLocationId(profile);
  const locationIds = allowedLocationIds(profile, selectedLocationId);

  let query = supabase
    .from("commissions")
    .select("id, basis_amount_cents, commission_rate, commission_amount_cents, status, calculated_at, user_profiles(full_name), locations(name), sales(id), payments(id)")
    .eq("organization_id", profile.organizationId)
    .order("calculated_at", { ascending: false });
  if (locationIds.length > 0) query = query.in("location_id", locationIds);

  const { data: commissions, error } = await query;
  if (error) throw new Error(error.message);

  const pending = (commissions ?? []).filter((row) => row.status === "pending").reduce((sum, row) => sum + (row.commission_amount_cents ?? 0), 0);
  const approved = (commissions ?? []).filter((row) => row.status === "approved").reduce((sum, row) => sum + (row.commission_amount_cents ?? 0), 0);
  const paid = (commissions ?? []).filter((row) => row.status === "paid").reduce((sum, row) => sum + (row.commission_amount_cents ?? 0), 0);

  return (
    <div className="page-stack">
      <PageHeader description="Commission ledger based on eligible financial events. Reversals are preserved as separate rows." title="Commissions" />
      <section className="metric-grid">
        <StatCard detail="Awaiting review" label="Pending" value={formatMoney(pending)} />
        <StatCard detail="Approved, not paid" label="Approved" value={formatMoney(approved)} />
        <StatCard detail="Marked paid" label="Paid" value={formatMoney(paid)} />
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Commission Ledger</h2><span>Owner/admin approval workflow</span></div>
        <table className="data-table">
          <thead><tr><th>Employee</th><th>Location</th><th>Basis</th><th>Rate</th><th>Commission</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {(commissions ?? []).map((commission) => {
              const user = Array.isArray(commission.user_profiles) ? commission.user_profiles[0] : commission.user_profiles;
              const location = Array.isArray(commission.locations) ? commission.locations[0] : commission.locations;
              return (
                <tr key={commission.id}>
                  <td>{user?.full_name ?? "Unassigned"}</td>
                  <td>{location?.name ?? "Unassigned"}</td>
                  <td>{formatMoney(commission.basis_amount_cents)}</td>
                  <td>{Math.round((commission.commission_rate ?? 0) * 10000) / 100}%</td>
                  <td>{formatMoney(commission.commission_amount_cents)}</td>
                  <td><StatusBadge status={fromDbStatus(commission.status)} /></td>
                  <td>{commission.status !== "paid" ? <CommissionStatusForm commissionId={commission.id} /> : "Complete"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
