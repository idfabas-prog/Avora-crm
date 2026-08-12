import Link from "next/link";
import { RecalculateSaleForm } from "@/components/crm/FinancialForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { assertFinancialPermission } from "@/lib/financial/permissions";
import { detectSaleHealthIssues, type HealthSale } from "@/lib/financial/health";
import { formatMoney } from "@/lib/financial/money";

type SaleRow = HealthSale & {
  sale_date: string | null;
  contacts: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null;
  locations: { name: string | null } | { name: string | null }[] | null;
};

function firstRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function FinancialHealthPage() {
  const profile = await requireCurrentProfile();
  assertFinancialPermission(profile, "financial_reports.read");
  const supabase = await createClient();
  const selectedLocationId = await getSelectedLocationId(profile);
  const locationIds = allowedLocationIds(profile, selectedLocationId);

  let query = supabase
    .from("sales")
    .select("id, sale_date, subtotal_cents, discount_amount_cents, total_amount_cents, paid_amount_cents, refunded_amount_cents, balance_due_cents, contacts(first_name, last_name), locations(name), sale_items(quantity, unit_price_cents, discount_amount_cents, line_total_cents), payments(amount_cents, status), refunds(amount_cents, status)")
    .eq("organization_id", profile.organizationId)
    .order("sale_date", { ascending: false })
    .limit(200);

  if (locationIds.length > 0) {
    query = query.in("location_id", locationIds);
  }

  const { data: sales } = await query;
  const saleRows = (sales ?? []) as unknown as SaleRow[];
  const issues = detectSaleHealthIssues(saleRows);
  const saleOptions = saleRows.map((sale) => {
    const contact = firstRelation(sale.contacts);
    return {
      id: sale.id,
      name: `${contact?.first_name ?? "Sale"} ${contact?.last_name ?? ""} - ${formatMoney(sale.total_amount_cents)}`
    };
  });

  return (
    <div className="page-stack">
      <PageHeader
        action={<Link className="primary-button" href="/settings/audit-log?table=sales">Audit Trail</Link>}
        description="Detect mismatches between sale totals, line items, payments, refunds, and balances before reports drift."
        title="Financial Health"
      />
      <section className="metric-grid">
        <section className="stat-card"><p>Sales Checked</p><strong>{saleRows.length}</strong><span>Current access scope</span></section>
        <section className="stat-card"><p>Critical Issues</p><strong>{issues.filter((issue) => issue.severity === "critical").length}</strong><span>Require review</span></section>
        <section className="stat-card"><p>Warnings</p><strong>{issues.filter((issue) => issue.severity === "warning").length}</strong><span>Line-level variance</span></section>
        <section className="stat-card"><p>Scope</p><strong>{selectedLocationId ? "Location" : "All"}</strong><span>Allowed locations only</span></section>
      </section>
      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Health Issues</h2><span>{issues.length} found</span></div>
          <div className="record-list">
            {issues.length === 0 ? <article><strong>No financial mismatches detected</strong><p>Checked stored totals against related financial rows.</p></article> : null}
            {issues.map((issue) => (
              <article key={`${issue.entityId}-${issue.message}`}>
                <strong>{issue.message}</strong>
                <p>{issue.entity} - {issue.entityId}</p>
                <StatusBadge status={issue.severity} />
              </article>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Recalculate Sale</h2><span>Audited server action</span></div>
          <RecalculateSaleForm sales={saleOptions} />
        </section>
      </section>
    </div>
  );
}
