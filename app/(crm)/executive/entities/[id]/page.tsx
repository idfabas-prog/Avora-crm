import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { fromDbStatus } from "@/lib/crm/constants";
import { getEntityPerformance, getExpansionPortfolio } from "@/lib/expansion/reports";
import { formatMoney } from "@/lib/financial/money";
import { createClient } from "@/lib/supabase/server";

export default async function EntityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const [entities, portfolio] = await Promise.all([
    getEntityPerformance(supabase, profile, id),
    getExpansionPortfolio(supabase, profile)
  ]);
  const entity = entities[0];
  const fees = portfolio.managementFees.filter((fee) => fee.operating_entity_id === id);

  return (
    <div className="page-stack">
      <PageHeader
        action={<Link className="secondary-button" href="/executive/entities">All Entities</Link>}
        description="Entity-level operating metadata. This is not a legal contract, tax record, cap table, or payment system."
        title={entity?.name ?? "Operating Entity"}
      />
      <section className="metric-grid">
        <StatCard detail={fromDbStatus(entity?.entity_type ?? "other")} label="Type" value={entity?.active ? "Active" : "Inactive"} />
        <StatCard detail="Management fee base" label="Base" value={formatMoney(entity?.calculationBaseCents ?? 0)} />
        <StatCard detail="Draft only" label="Fees" value={formatMoney(entity?.managementFeeCents ?? 0)} />
        <StatCard detail="Current period records" label="Rows" value={String(fees.length)} />
      </section>
      <section className="panel wide-panel">
        <div className="panel-header"><h2>Management Fee Records</h2><span>No money is moved</span></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Location</th><th>Base</th><th>Fee</th><th>Status</th></tr></thead>
            <tbody>
              {fees.map((fee) => (
                <tr key={`${fee.location_id}-${fee.operating_entity_id}`}>
                  <td>{fee.location_id}</td>
                  <td>{formatMoney(fee.calculation_base_cents)}</td>
                  <td>{formatMoney(fee.fee_cents)}</td>
                  <td>{fromDbStatus(fee.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
