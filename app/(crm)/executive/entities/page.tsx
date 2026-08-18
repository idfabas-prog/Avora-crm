import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { fromDbStatus } from "@/lib/crm/constants";
import { getEntityPerformance, getExpansionPortfolio } from "@/lib/expansion/reports";
import { formatMoney } from "@/lib/financial/money";
import { createClient } from "@/lib/supabase/server";

export default async function EntitiesPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const [entities, portfolio] = await Promise.all([
    getEntityPerformance(supabase, profile),
    getExpansionPortfolio(supabase, profile)
  ]);

  return (
    <div className="page-stack">
      <PageHeader
        action={<Link className="secondary-button" href="/executive">Executive</Link>}
        description="Operating-entity reporting foundation for corporate, managed, franchise, partner, and joint-venture models."
        title="Operating Entities"
      />
      <section className="metric-grid">
        <StatCard detail="Active records" label="Entities" value={String(portfolio.summary.activeEntities)} />
        <StatCard detail="Draft metadata only" label="Management Fees" value={formatMoney(portfolio.summary.managementFeesDraftCents)} />
        <StatCard detail="Operating territories" label="Territories" value={String(portfolio.territories.length)} />
        <StatCard detail="No formal cap table" label="Ownership Records" value="Operational" />
      </section>
      <section className="panel wide-panel">
        <div className="panel-header"><h2>Entity Performance</h2><span>Planning and operating metadata</span></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Entity</th><th>Type</th><th>Status</th><th>Calculation Base</th><th>Management Fees</th></tr></thead>
            <tbody>
              {entities.map((entity) => (
                <tr key={entity.id}>
                  <td><Link className="strong-link" href={`/executive/entities/${entity.id}`}>{entity.name}</Link></td>
                  <td>{fromDbStatus(entity.entity_type)}</td>
                  <td><StatusBadge status={entity.active ? "Active" : "Inactive"} /></td>
                  <td>{formatMoney(entity.calculationBaseCents)}</td>
                  <td>{formatMoney(entity.managementFeeCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
