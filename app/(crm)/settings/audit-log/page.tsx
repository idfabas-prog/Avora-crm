import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { assertFinancialPermission } from "@/lib/financial/permissions";

type AuditRow = {
  id: string;
  action: string | null;
  entity_table: string | null;
  entity_id: string | null;
  created_at: string | null;
  metadata: unknown;
  user_profiles: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
};

function firstRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value: string | null) {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export default async function FinancialAuditLogPage({
  searchParams
}: {
  searchParams: Promise<{ table?: string; action?: string }>;
}) {
  const profile = await requireCurrentProfile();
  assertFinancialPermission(profile, "financial_reports.read");
  const filters = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("audit_logs")
    .select("id, action, entity_table, entity_id, created_at, metadata, user_profiles!audit_logs_actor_id_fkey(full_name, email)")
    .eq("organization_id", profile.organizationId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (filters.table) query = query.eq("entity_table", filters.table);
  if (filters.action) query = query.ilike("action", `%${filters.action}%`);

  const { data: logs } = await query;
  const rows = (logs ?? []) as unknown as AuditRow[];

  return (
    <div className="page-stack">
      <PageHeader
        description="Read-only financial audit trail for controlled sales, payment, refund, commission, royalty, and settings actions."
        title="Financial Audit Log"
      />
      <section className="panel">
        <form className="query-toolbar">
          <label className="filter-control">
            <span>Entity table</span>
            <input className="search-input" defaultValue={filters.table ?? ""} name="table" placeholder="sales, payments, commissions" />
          </label>
          <label className="filter-control">
            <span>Action contains</span>
            <input className="search-input" defaultValue={filters.action ?? ""} name="action" placeholder="Refund, Rule, Sale" />
          </label>
          <button type="submit">Filter</button>
        </form>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Metadata</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((log) => {
                const actor = firstRelation(log.user_profiles);
                return (
                  <tr key={log.id}>
                    <td>{formatDate(log.created_at)}</td>
                    <td>{actor?.full_name ?? actor?.email ?? "System"}</td>
                    <td><StatusBadge status={log.action ?? "Unknown"} /></td>
                    <td>{log.entity_table ?? "unknown"}<br /><span>{log.entity_id ?? "no id"}</span></td>
                    <td>{JSON.stringify(log.metadata ?? {})}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
