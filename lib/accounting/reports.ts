import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentProfile } from "@/lib/auth/profile";
import { formatMoney } from "@/lib/financial/money";
import { accountingLocationAllowed, assertAccountingPermission } from "./permissions";

type Relation<T> = T | T[] | null;

function first<T>(value: Relation<T> | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function scopedIds(profile: CurrentProfile, locationIds: string[]) {
  return locationIds.filter((id) => accountingLocationAllowed(profile, id));
}

export async function getAccountingDashboard(supabase: SupabaseClient, profile: CurrentProfile, locationIds: string[]) {
  assertAccountingPermission(profile, "accounting.read");
  const scopedLocationIds = scopedIds(profile, locationIds);
  const connectionQuery = supabase.from("accounting_connections").select("id, provider, status, company_name, last_sync_at, sync_mode").eq("organization_id", profile.organizationId);
  const accountsQuery = supabase.from("accounting_accounts").select("id").eq("organization_id", profile.organizationId).eq("active", true);
  const mappingsQuery = supabase.from("accounting_mappings").select("id").eq("organization_id", profile.organizationId).eq("active", true);
  const exceptionsQuery = supabase.from("accounting_exceptions").select("id, exception_type, severity, status").eq("organization_id", profile.organizationId);
  const batchesQuery = supabase.from("accounting_export_batches").select("id, status, debit_total_cents, credit_total_cents, exported_at, batch_type, period_start, period_end").eq("organization_id", profile.organizationId);
  const reconciliationQuery = supabase.from("processor_reconciliation_records").select("id, status, gross_cents, fee_cents, net_cents, settlement_date, location_id").eq("organization_id", profile.organizationId);
  const periodsQuery = supabase.from("accounting_periods").select("id, period_start, period_end, status, closed_at").eq("organization_id", profile.organizationId).order("period_start", { ascending: false }).limit(3);
  const locationMappingsQuery = supabase.from("accounting_location_mappings").select("location_id").eq("organization_id", profile.organizationId).eq("active", true);

  if (scopedLocationIds.length > 0) {
    exceptionsQuery.in("location_id", scopedLocationIds);
    reconciliationQuery.in("location_id", scopedLocationIds);
  }

  const [{ data: connections }, { data: accounts }, { data: mappings }, { data: exceptions }, { data: batches }, { data: reconciliation }, { data: periods }, { data: locationMappings }] = await Promise.all([
    connectionQuery,
    accountsQuery,
    mappingsQuery,
    exceptionsQuery,
    batchesQuery,
    reconciliationQuery,
    periodsQuery,
    locationMappingsQuery
  ]);

  const openExceptions = (exceptions ?? []).filter((item) => item.status !== "resolved");
  const unreconciled = (reconciliation ?? []).filter((item) => item.status !== "matched");
  const draftBatches = (batches ?? []).filter((item) => item.status === "draft" || item.status === "review");
  const approvedNotExported = (batches ?? []).filter((item) => item.status === "approved");
  const currentPeriod = (periods ?? []).find((period) => period.status === "open" || period.status === "review") ?? periods?.[0] ?? null;
  const requiredLocationCount = profile.locations.length;
  const mappedLocationCount = new Set((locationMappings ?? []).map((mapping) => mapping.location_id)).size;

  return {
    connections: connections ?? [],
    periods: periods ?? [],
    batches: batches ?? [],
    reconciliation: reconciliation ?? [],
    exceptions: exceptions ?? [],
    summary: {
      activeConnection: connections?.[0] ?? null,
      accountCount: accounts?.length ?? 0,
      mappingCount: mappings?.length ?? 0,
      currentPeriod,
      unmappedRecords: Math.max(0, requiredLocationCount - mappedLocationCount),
      unreconciledPayments: unreconciled.length,
      unreconciledAmountCents: unreconciled.reduce((sum, item) => sum + Math.abs(Number(item.net_cents ?? item.gross_cents ?? 0)), 0),
      draftExportBatches: draftBatches.length,
      approvedNotExported: approvedNotExported.length,
      openExceptions: openExceptions.length,
      criticalExceptions: openExceptions.filter((item) => item.severity === "critical").length,
      lastSyncAt: connections?.[0]?.last_sync_at ?? null
    }
  };
}

export async function getAccountingCloseStatus(supabase: SupabaseClient, profile: CurrentProfile) {
  assertAccountingPermission(profile, "accounting.close.read");
  const { data: period } = await supabase
    .from("accounting_periods")
    .select("id, period_start, period_end, status, closed_at, close_notes")
    .eq("organization_id", profile.organizationId)
    .in("status", ["open", "review", "reopened"])
    .order("period_start", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!period) return null;

  const [{ data: items }, { data: exceptions }, { data: batches }] = await Promise.all([
    supabase.from("accounting_close_items").select("id, title, category, required, status, completed_at, notes").eq("accounting_period_id", period.id).order("category"),
    supabase.from("accounting_exceptions").select("id, exception_type, severity, status").eq("organization_id", profile.organizationId).neq("status", "resolved"),
    supabase.from("accounting_export_batches").select("id, batch_type, status, debit_total_cents, credit_total_cents").eq("organization_id", profile.organizationId).gte("period_start", period.period_start).lte("period_end", period.period_end)
  ]);

  const required = (items ?? []).filter((item) => item.required);
  const completedRequired = required.filter((item) => item.status === "complete");
  const unbalanced = (batches ?? []).filter((batch) => Number(batch.debit_total_cents ?? 0) !== Number(batch.credit_total_cents ?? 0));
  const blockers = [
    ...required.filter((item) => item.status !== "complete").map((item) => `Checklist incomplete: ${item.title}`),
    ...(exceptions ?? []).filter((item) => item.severity === "critical").map((item) => `Critical exception: ${item.exception_type}`),
    ...unbalanced.map((batch) => `Unbalanced batch: ${batch.batch_type}`)
  ];

  return {
    period,
    items: items ?? [],
    exceptions: exceptions ?? [],
    batches: batches ?? [],
    readiness: required.length ? Math.max(0, Math.round((completedRequired.length / required.length) * 100) - blockers.length * 5) : 0,
    blockers
  };
}

export async function getAccountingExceptions(supabase: SupabaseClient, profile: CurrentProfile, locationIds: string[]) {
  assertAccountingPermission(profile, "accounting.exceptions.read");
  const query = supabase
    .from("accounting_exceptions")
    .select("id, source_type, source_id, exception_type, severity, message, status, created_at, resolved_at, locations(name), assigned:user_profiles!accounting_exceptions_assigned_user_id_fkey(full_name)")
    .eq("organization_id", profile.organizationId)
    .order("created_at", { ascending: false });
  const scopedLocationIds = scopedIds(profile, locationIds);
  if (scopedLocationIds.length > 0) query.in("location_id", scopedLocationIds);
  const { data } = await query;
  return (data ?? []).map((item) => ({ ...item, locationName: first(item.locations)?.name ?? "All locations", assignedName: first(item.assigned)?.full_name ?? null }));
}

export async function getReconciliationSummary(supabase: SupabaseClient, profile: CurrentProfile, locationIds: string[]) {
  assertAccountingPermission(profile, "accounting.reconciliation.read");
  const query = supabase
    .from("processor_reconciliation_records")
    .select("id, processor, processor_transaction_id, gross_cents, fee_cents, net_cents, settlement_date, status, locations(name)")
    .eq("organization_id", profile.organizationId)
    .order("settlement_date", { ascending: false });
  const scopedLocationIds = scopedIds(profile, locationIds);
  if (scopedLocationIds.length > 0) query.in("location_id", scopedLocationIds);
  const { data } = await query;
  const rows = data ?? [];
  return {
    rows: rows.map((item) => ({ ...item, locationName: first(item.locations)?.name ?? "All locations" })),
    summary: {
      matched: rows.filter((item) => item.status === "matched").length,
      partial: rows.filter((item) => item.status === "partial").length,
      unmatched: rows.filter((item) => item.status === "unmatched").length,
      exception: rows.filter((item) => item.status === "exception").length,
      grossCents: rows.reduce((sum, item) => sum + Number(item.gross_cents ?? 0), 0),
      feesCents: rows.reduce((sum, item) => sum + Number(item.fee_cents ?? 0), 0),
      netCents: rows.reduce((sum, item) => sum + Number(item.net_cents ?? 0), 0)
    }
  };
}

export async function getAccountingExportSummary(supabase: SupabaseClient, profile: CurrentProfile) {
  assertAccountingPermission(profile, "accounting.exports.read");
  const { data: batches } = await supabase
    .from("accounting_export_batches")
    .select("id, batch_type, period_start, period_end, status, record_count, debit_total_cents, credit_total_cents, approved_at, exported_at, accounting_connections(provider, company_name)")
    .eq("organization_id", profile.organizationId)
    .order("period_start", { ascending: false });
  const { data: items } = await supabase
    .from("accounting_export_items")
    .select("id, accounting_export_batch_id, source_type, source_id, amount_cents, debit_credit, export_status, external_account_id, description")
    .eq("organization_id", profile.organizationId)
    .order("created_at", { ascending: false })
    .limit(100);

  return {
    batches: (batches ?? []).map((batch) => ({ ...batch, connection: first(batch.accounting_connections) })),
    items: items ?? [],
    summary: {
      batches: batches?.length ?? 0,
      draft: (batches ?? []).filter((batch) => batch.status === "draft").length,
      approved: (batches ?? []).filter((batch) => batch.status === "approved").length,
      exported: (batches ?? []).filter((batch) => batch.status === "exported").length,
      unbalanced: (batches ?? []).filter((batch) => Number(batch.debit_total_cents ?? 0) !== Number(batch.credit_total_cents ?? 0)).length
    }
  };
}

export async function getUnmappedAccountingRecords(supabase: SupabaseClient, profile: CurrentProfile) {
  assertAccountingPermission(profile, "accounting.mappings.read");
  const [{ data: locationMappings }, { data: entityMappings }, { data: mappings }, { data: contacts }, { data: customerMappings }] = await Promise.all([
    supabase.from("accounting_location_mappings").select("location_id").eq("organization_id", profile.organizationId).eq("active", true),
    supabase.from("accounting_entity_mappings").select("operating_entity_id").eq("organization_id", profile.organizationId).eq("active", true),
    supabase.from("accounting_mappings").select("mapping_type, source_key").eq("organization_id", profile.organizationId).eq("active", true),
    supabase.from("contacts").select("id").eq("organization_id", profile.organizationId).limit(50),
    supabase.from("accounting_customer_mappings").select("contact_id").eq("organization_id", profile.organizationId)
  ]);
  const mappedLocations = new Set((locationMappings ?? []).map((item) => item.location_id));
  const mappedCustomers = new Set((customerMappings ?? []).map((item) => item.contact_id));
  return {
    missingLocationMappings: profile.locations.filter((location) => !mappedLocations.has(location.id)),
    missingEntityMappings: Math.max(0, 4 - (entityMappings?.length ?? 0)),
    missingCustomerMappings: (contacts ?? []).filter((contact) => !mappedCustomers.has(contact.id)).length,
    mappingKeys: mappings ?? []
  };
}

export async function getRoyaltyAccountingSummary(supabase: SupabaseClient, profile: CurrentProfile) {
  assertAccountingPermission(profile, "accounting.reports.read");
  const { data } = await supabase.from("royalties").select("id, royalty_amount_cents, status").eq("organization_id", profile.organizationId).limit(1000);
  const rows = data ?? [];
  return { count: rows.length, amountCents: rows.reduce((sum, row) => sum + Number(row.royalty_amount_cents ?? 0), 0), openCount: rows.filter((row) => row.status !== "paid").length };
}

export async function getManagementFeeAccountingSummary(supabase: SupabaseClient, profile: CurrentProfile) {
  assertAccountingPermission(profile, "accounting.reports.read");
  const { data } = await supabase.from("management_fee_records").select("id, fee_cents, status").eq("organization_id", profile.organizationId).limit(1000);
  const rows = data ?? [];
  return { count: rows.length, amountCents: rows.reduce((sum, row) => sum + Number(row.fee_cents ?? 0), 0), openCount: rows.filter((row) => row.status !== "exported" && row.status !== "paid_future").length };
}

export async function getCOGSExportSummary(supabase: SupabaseClient, profile: CurrentProfile, locationIds: string[]) {
  assertAccountingPermission(profile, "accounting.reports.read");
  const query = supabase.from("treatment_inventory_usage").select("id, total_cost_cents, location_id").eq("organization_id", profile.organizationId).limit(1000);
  const scopedLocationIds = scopedIds(profile, locationIds);
  if (scopedLocationIds.length > 0) query.in("location_id", scopedLocationIds);
  const { data } = await query;
  const rows = data ?? [];
  return { count: rows.length, amountCents: rows.reduce((sum, row) => sum + Number(row.total_cost_cents ?? 0), 0) };
}

export function accountingFactsFromSummary(input: Awaited<ReturnType<typeof getAccountingDashboard>>) {
  return [
    `Accounting connection: ${input.summary.activeConnection?.provider ?? "none"} (${input.summary.activeConnection?.status ?? "not configured"}).`,
    `Open accounting exceptions: ${input.summary.openExceptions}.`,
    `Unreconciled processor records: ${input.summary.unreconciledPayments} totaling ${formatMoney(input.summary.unreconciledAmountCents)}.`,
    `Draft/review export batches: ${input.summary.draftExportBatches}.`,
    `Approved not exported batches: ${input.summary.approvedNotExported}.`
  ];
}
