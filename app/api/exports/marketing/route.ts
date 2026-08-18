import { requireCurrentProfile } from "@/lib/auth/profile";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { getMarketingDateRange } from "@/lib/marketing/date-ranges";
import { hasMarketingPermission } from "@/lib/marketing/permissions";
import { getMarketingReport } from "@/lib/marketing/reports";
import { createClient } from "@/lib/supabase/server";

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows: Array<Record<string, unknown>>) {
  const headers = Object.keys(rows[0] ?? { empty: "" });
  return [headers.join(","), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))].join("\n");
}

export async function GET(request: Request) {
  const profile = await requireCurrentProfile();
  if (!hasMarketingPermission(profile, "marketing.reports.read")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(request.url);
  const supabase = await createClient();
  const selectedLocationId = await getSelectedLocationId(profile);
  const locationIds = allowedLocationIds(profile, selectedLocationId);
  const range = getMarketingDateRange("this_month");
  const report = await getMarketingReport(supabase, {
    organizationId: profile.organizationId,
    locationIds,
    startDate: range.start.toISOString(),
    endDate: range.end.toISOString(),
    attributionModel: "primary_attribution"
  });
  const type = url.searchParams.get("type") ?? "campaigns";
  const source = type === "sources";
  const rows = (source ? report.sourceRows : report.campaignRows).map((row) => ({
    name: row.name,
    source: row.source ?? row.name,
    location: row.location ?? "",
    service: row.serviceCategory ?? "",
    spend_cents: row.metrics.spendCents,
    leads: row.metrics.leads,
    booked: row.metrics.booked,
    showed: row.metrics.showed,
    sales: row.metrics.sales,
    net_collected_cents: row.metrics.netCollectedRevenueCents,
    cpl_cents: row.metrics.cplCents,
    cac_cents: row.metrics.cacCents,
    roas: row.metrics.netCollectedRoas
  }));
  return new Response(toCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="avora-marketing-${source ? "sources" : "campaigns"}.csv"`
    }
  });
}
