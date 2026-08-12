import { NextRequest } from "next/server";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { assertFinancialPermission } from "@/lib/financial/permissions";
import { createClient } from "@/lib/supabase/server";
import { csvMoney, rowsToCsv } from "@/lib/financial/csv";

type ExportType = "sales" | "payments" | "refunds" | "commissions" | "royalties";

type QueryResult = { data: unknown[] | null; error: { message: string } | null };
type LooseQuery = PromiseLike<QueryResult> & {
  eq: (column: string, value: string) => LooseQuery;
  in: (column: string, values: string[]) => LooseQuery;
  order: (column: string, options?: { ascending?: boolean }) => LooseQuery;
  limit: (count: number) => LooseQuery;
};
type LooseSupabase = {
  from: (table: string) => {
    select: (columns: string) => LooseQuery;
  };
};

function firstRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function download(csv: string, filename: string) {
  return new Response(csv, {
    headers: {
      "content-disposition": `attachment; filename="${filename}"`,
      "content-type": "text/csv; charset=utf-8"
    }
  });
}

function scoped<T extends { eq: (column: string, value: string) => T; in: (column: string, values: string[]) => T }>(
  query: T,
  organizationId: string,
  locationIds: string[]
) {
  const base = query.eq("organization_id", organizationId);
  return locationIds.length > 0 ? base.in("location_id", locationIds) : base;
}

export async function GET(request: NextRequest) {
  const profile = await requireCurrentProfile();
  assertFinancialPermission(profile, "financial_reports.read");
  const type = (request.nextUrl.searchParams.get("type") ?? "sales") as ExportType;
  const selectedLocationId = await getSelectedLocationId(profile);
  const locationIds = allowedLocationIds(profile, selectedLocationId);
  const supabase = await createClient();
  const db = supabase as unknown as LooseSupabase;

  if (type === "payments") {
    const { data, error } = await scoped(
      db.from("payments").select("id, received_at, amount_cents, payment_method, payment_provider, payment_purpose, status, simulated, contacts(first_name, last_name), locations(name), sales(id)"),
      profile.organizationId,
      locationIds
    ).order("received_at", { ascending: false }).limit(1000);
    if (error) throw new Error(error.message);
    const rows = (data ?? []).map((payment) => {
      const row = payment as Record<string, unknown>;
      const contact = firstRelation(row.contacts as { first_name?: string | null; last_name?: string | null } | { first_name?: string | null; last_name?: string | null }[] | null);
      const location = firstRelation(row.locations as { name?: string | null } | { name?: string | null }[] | null);
      return [row.id, row.received_at, `${contact?.first_name ?? ""} ${contact?.last_name ?? ""}`.trim(), location?.name, csvMoney(row.amount_cents as number | null), row.payment_method, row.payment_provider, row.payment_purpose, row.status, row.simulated];
    });
    return download(rowsToCsv(["id", "received_at", "contact", "location", "amount", "method", "provider", "purpose", "status", "simulated"], rows), "avora-payments.csv");
  }

  if (type === "refunds") {
    const { data, error } = await scoped(
      db.from("refunds").select("id, refunded_at, amount_cents, reason, status, contacts(first_name, last_name), locations(name), payments(id), sales(id)"),
      profile.organizationId,
      locationIds
    ).order("refunded_at", { ascending: false }).limit(1000);
    if (error) throw new Error(error.message);
    const rows = (data ?? []).map((refund) => {
      const row = refund as Record<string, unknown>;
      const contact = firstRelation(row.contacts as { first_name?: string | null; last_name?: string | null } | { first_name?: string | null; last_name?: string | null }[] | null);
      const location = firstRelation(row.locations as { name?: string | null } | { name?: string | null }[] | null);
      return [row.id, row.refunded_at, `${contact?.first_name ?? ""} ${contact?.last_name ?? ""}`.trim(), location?.name, csvMoney(row.amount_cents as number | null), row.reason, row.status];
    });
    return download(rowsToCsv(["id", "refunded_at", "contact", "location", "amount", "reason", "status"], rows), "avora-refunds.csv");
  }

  if (type === "commissions") {
    const { data, error } = await scoped(
      db.from("commissions").select("id, status, basis_amount_cents, commission_rate, commission_amount_cents, notes, user_profiles(full_name, email), locations(name), sales(id)"),
      profile.organizationId,
      locationIds
    ).order("created_at", { ascending: false }).limit(1000);
    if (error) throw new Error(error.message);
    const rows = (data ?? []).map((commission) => {
      const row = commission as Record<string, unknown>;
      const user = firstRelation(row.user_profiles as { full_name?: string | null; email?: string | null } | { full_name?: string | null; email?: string | null }[] | null);
      const location = firstRelation(row.locations as { name?: string | null } | { name?: string | null }[] | null);
      return [row.id, user?.full_name ?? user?.email, location?.name, csvMoney(row.basis_amount_cents as number | null), row.commission_rate, csvMoney(row.commission_amount_cents as number | null), row.status, row.notes];
    });
    return download(rowsToCsv(["id", "employee", "location", "basis_amount", "rate", "commission_amount", "status", "notes"], rows), "avora-commissions.csv");
  }

  if (type === "royalties") {
    const { data, error } = await scoped(
      db.from("royalties").select("id, status, basis_amount_cents, royalty_rate, royalty_amount_cents, due_date, paid_at, locations(name), sales(id)"),
      profile.organizationId,
      locationIds
    ).order("created_at", { ascending: false }).limit(1000);
    if (error) throw new Error(error.message);
    const rows = (data ?? []).map((royalty) => {
      const row = royalty as Record<string, unknown>;
      const location = firstRelation(row.locations as { name?: string | null } | { name?: string | null }[] | null);
      return [row.id, location?.name, csvMoney(row.basis_amount_cents as number | null), row.royalty_rate, csvMoney(row.royalty_amount_cents as number | null), row.status, row.due_date, row.paid_at];
    });
    return download(rowsToCsv(["id", "location", "basis_amount", "rate", "royalty_amount", "status", "due_date", "paid_at"], rows), "avora-royalties.csv");
  }

  const { data, error } = await scoped(
    db.from("sales").select("id, sale_date, status, subtotal_cents, discount_amount_cents, total_amount_cents, paid_amount_cents, refunded_amount_cents, balance_due_cents, contacts(first_name, last_name), locations(name), user_profiles!sales_salesperson_id_fkey(full_name, email)"),
    profile.organizationId,
    locationIds
  ).order("sale_date", { ascending: false }).limit(1000);
  if (error) throw new Error(error.message);
  const rows = (data ?? []).map((sale) => {
    const row = sale as Record<string, unknown>;
    const contact = firstRelation(row.contacts as { first_name?: string | null; last_name?: string | null } | { first_name?: string | null; last_name?: string | null }[] | null);
    const location = firstRelation(row.locations as { name?: string | null } | { name?: string | null }[] | null);
    const user = firstRelation(row.user_profiles as { full_name?: string | null; email?: string | null } | { full_name?: string | null; email?: string | null }[] | null);
    return [row.id, row.sale_date, `${contact?.first_name ?? ""} ${contact?.last_name ?? ""}`.trim(), location?.name, user?.full_name ?? user?.email, row.status, csvMoney(row.subtotal_cents as number | null), csvMoney(row.discount_amount_cents as number | null), csvMoney(row.total_amount_cents as number | null), csvMoney(row.paid_amount_cents as number | null), csvMoney(row.refunded_amount_cents as number | null), csvMoney(row.balance_due_cents as number | null)];
  });
  return download(rowsToCsv(["id", "sale_date", "contact", "location", "salesperson", "status", "subtotal", "discount", "total", "paid", "refunded", "balance_due"], rows), "avora-sales.csv");
}
