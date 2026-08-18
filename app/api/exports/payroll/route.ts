import { requireCurrentProfile } from "@/lib/auth/profile";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { csvMoney, rowsToCsv } from "@/lib/financial/csv";
import { createClient } from "@/lib/supabase/server";
import { assertWorkforcePermission } from "@/lib/workforce/permissions";

type Relation<T> = T | T[] | null;

function first<T>(value: Relation<T> | undefined) {
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

export async function GET() {
  const profile = await requireCurrentProfile();
  assertWorkforcePermission(profile, "workforce.payroll_export");
  const supabase = await createClient();
  const selectedLocationId = await getSelectedLocationId(profile);
  const locationIds = allowedLocationIds(profile, selectedLocationId);
  const query = supabase
    .from("labor_cost_records")
    .select("regular_minutes, overtime_minutes, pto_minutes, regular_cost_cents, overtime_cost_cents, pto_cost_cents, total_cost_cents, users:user_profiles!labor_cost_records_user_id_fkey(full_name, email), locations(name), pay_periods(start_date, end_date)")
    .eq("organization_id", profile.organizationId)
    .order("calculated_at", { ascending: false })
    .limit(1000);
  if (locationIds.length > 0) query.in("location_id", locationIds);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []).map((row) => {
    const user = first(row.users);
    const location = first(row.locations);
    const period = first(row.pay_periods);
    return [
      user?.full_name,
      user?.email,
      location?.name,
      period?.start_date,
      period?.end_date,
      row.regular_minutes,
      row.overtime_minutes,
      row.pto_minutes,
      csvMoney(row.regular_cost_cents),
      csvMoney(row.overtime_cost_cents),
      csvMoney(row.pto_cost_cents),
      csvMoney(row.total_cost_cents)
    ];
  });
  return download(rowsToCsv(["employee", "email", "location", "period_start", "period_end", "regular_minutes", "overtime_minutes", "pto_minutes", "regular_cost", "overtime_cost", "pto_cost", "total_cost"], rows), "avora-payroll-support.csv");
}
