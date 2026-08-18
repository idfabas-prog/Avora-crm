import type { SupabaseClient } from "@supabase/supabase-js";
import { contributionBeforeOverhead, providerUtilization, revenuePerLaborHour } from "./calculations";

export type WorkforceReportFilters = {
  organizationId: string;
  locationIds: string[];
};

type Relation<T> = T | T[] | null;

function first<T>(value: Relation<T> | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export async function getWorkforceSummary(supabase: SupabaseClient, filters: WorkforceReportFilters) {
  const shiftsQuery = supabase
    .from("staff_shifts")
    .select("id, location_id, user_id, scheduled_start, scheduled_end, status, notes, break_minutes, users:user_profiles!staff_shifts_user_id_fkey(full_name), locations(name)")
    .eq("organization_id", filters.organizationId)
    .order("scheduled_start", { ascending: true })
    .limit(200);
  const entriesQuery = supabase
    .from("time_entries")
    .select("id, location_id, user_id, clock_in_at, clock_out_at, status, worked_minutes, unpaid_break_minutes, users:user_profiles!time_entries_user_id_fkey(full_name), locations(name)")
    .eq("organization_id", filters.organizationId)
    .order("clock_in_at", { ascending: false })
    .limit(300);
  const ptoQuery = supabase
    .from("pto_requests")
    .select("id, user_id, start_date, end_date, requested_minutes, status, users:user_profiles!pto_requests_user_id_fkey(full_name), pto_policies(name)")
    .eq("organization_id", filters.organizationId)
    .order("created_at", { ascending: false })
    .limit(100);
  const exceptionsQuery = supabase
    .from("attendance_exceptions")
    .select("id, user_id, location_id, exception_type, status, event_date, minutes_delta, users:user_profiles!attendance_exceptions_user_id_fkey(full_name), locations(name)")
    .eq("organization_id", filters.organizationId)
    .order("event_date", { ascending: false })
    .limit(100);
  const laborQuery = supabase
    .from("labor_cost_records")
    .select("id, location_id, user_id, regular_minutes, overtime_minutes, pto_minutes, total_cost_cents, users:user_profiles!labor_cost_records_user_id_fkey(full_name), locations(name), pay_periods(start_date, end_date)")
    .eq("organization_id", filters.organizationId)
    .order("calculated_at", { ascending: false })
    .limit(200);
  const usageQuery = supabase
    .from("treatment_inventory_usage")
    .select("id, location_id, total_cost_cents, treatment_sessions(provider_id, duration_minutes)")
    .eq("organization_id", filters.organizationId)
    .limit(200);
  const salesQuery = supabase
    .from("sales")
    .select("id, location_id, paid_amount_cents")
    .eq("organization_id", filters.organizationId)
    .limit(200);

  if (filters.locationIds.length > 0) {
    shiftsQuery.in("location_id", filters.locationIds);
    entriesQuery.in("location_id", filters.locationIds);
    exceptionsQuery.in("location_id", filters.locationIds);
    laborQuery.in("location_id", filters.locationIds);
    usageQuery.in("location_id", filters.locationIds);
    salesQuery.in("location_id", filters.locationIds);
  }

  const [{ data: shifts }, { data: entries }, { data: ptoRequests }, { data: exceptions }, { data: laborCosts }, { data: usage }, { data: sales }] = await Promise.all([
    shiftsQuery,
    entriesQuery,
    ptoQuery,
    exceptionsQuery,
    laborQuery,
    usageQuery,
    salesQuery
  ]);

  const workedMinutes = (entries ?? []).reduce((sum, entry) => sum + Number(entry.worked_minutes ?? 0), 0);
  const overtimeMinutes = (laborCosts ?? []).reduce((sum, row) => sum + Number(row.overtime_minutes ?? 0), 0);
  const laborCostCents = (laborCosts ?? []).reduce((sum, row) => sum + Number(row.total_cost_cents ?? 0), 0);
  const revenueCents = (sales ?? []).reduce((sum, sale) => sum + Number(sale.paid_amount_cents ?? 0), 0);
  const inventoryCogsCents = (usage ?? []).reduce((sum, row) => sum + Number(row.total_cost_cents ?? 0), 0);
  const treatmentMinutes = (usage ?? []).reduce((sum, row) => {
    const session = first(row.treatment_sessions);
    return sum + Number(session?.duration_minutes ?? 0);
  }, 0);
  const scheduledMinutes = (shifts ?? []).reduce((sum, shift) => {
    const start = new Date(String(shift.scheduled_start));
    const end = new Date(String(shift.scheduled_end));
    return sum + Math.max(Math.round((end.getTime() - start.getTime()) / 60_000) - Number(shift.break_minutes ?? 0), 0);
  }, 0);

  return {
    shifts: shifts ?? [],
    timeEntries: entries ?? [],
    ptoRequests: ptoRequests ?? [],
    attendanceExceptions: exceptions ?? [],
    laborCosts: laborCosts ?? [],
    summary: {
      scheduledShifts: shifts?.length ?? 0,
      openTimeEntries: (entries ?? []).filter((entry) => entry.status === "open").length,
      pendingPto: (ptoRequests ?? []).filter((request) => request.status === "pending").length,
      attendanceExceptions: exceptions?.length ?? 0,
      workedMinutes,
      overtimeMinutes,
      laborCostCents,
      revenueCents,
      inventoryCogsCents,
      revenuePerLaborHourCents: revenuePerLaborHour(revenueCents, workedMinutes),
      providerUtilization: providerUtilization(treatmentMinutes, scheduledMinutes),
      contribution: contributionBeforeOverhead(revenueCents, inventoryCogsCents, laborCostCents)
    }
  };
}
