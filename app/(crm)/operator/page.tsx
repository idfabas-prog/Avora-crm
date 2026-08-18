import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { fromDbStatus } from "@/lib/crm/constants";
import { hasExpansionPermission } from "@/lib/expansion/permissions";
import { getBrandCompliance, getEntityPerformance, getExpansionPortfolio } from "@/lib/expansion/reports";
import { formatMoney } from "@/lib/financial/money";
import { createClient } from "@/lib/supabase/server";

export default async function OperatorPage() {
  const profile = await requireCurrentProfile();
  if (!hasExpansionPermission(profile, "operator.read")) {
    return <div className="page-stack"><PageHeader title="Operator" description="Your role does not include operator access." /></div>;
  }
  const supabase = await createClient();
  const [portfolio, entities, audits] = await Promise.all([
    getExpansionPortfolio(supabase, profile),
    getEntityPerformance(supabase, profile),
    getBrandCompliance(supabase, profile)
  ]);

  return (
    <div className="page-stack">
      <PageHeader
        action={<Link className="secondary-button" href="/expansion">Expansion</Link>}
        description="Restricted operator foundation for authorized locations, brand audits, targets, royalties, and management fee metadata."
        title="Operator View"
      />
      <section className="metric-grid">
        <StatCard detail="Authorized scope" label="Locations" value={String(profile.locations.length)} />
        <StatCard detail="Draft metadata" label="Mgmt Fees" value={formatMoney(portfolio.summary.managementFeesDraftCents)} />
        <StatCard detail="Latest audits" label="Brand Score" value={String(portfolio.summary.averageBrandScore ?? "N/A")} />
        <StatCard detail="Active expansion alerts" label="Alerts" value={String(portfolio.summary.activeAlerts)} />
      </section>
      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Authorized Locations</h2><span>Location switcher scope</span></div>
          <div className="record-list">{profile.locations.map((location) => <article key={location.id}><strong>{location.name}</strong><p>{location.slug}</p></article>)}</div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Entities</h2><span>Operational metadata</span></div>
          <div className="record-list">{entities.map((entity) => <article key={entity.id}><strong>{entity.name}</strong><p>{fromDbStatus(entity.entity_type)}</p><span>{formatMoney(entity.managementFeeCents)} draft fees</span></article>)}</div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Brand Audits</h2><span>Remediation visibility</span></div>
          <div className="record-list">{audits.map((audit) => <article key={audit.id}><strong>{audit.locationName}</strong><p>{audit.score}/100 - {audit.statusLabel}</p><StatusBadge status={fromDbStatus(audit.status)} /></article>)}</div>
        </section>
      </section>
    </div>
  );
}
