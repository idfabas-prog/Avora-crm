import { requireCurrentProfile } from "@/lib/auth/profile";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { rowsToCsv } from "@/lib/financial/csv";
import { hasReputationPermission } from "@/lib/reputation/permissions";
import { getReputationReport } from "@/lib/reputation/reports";
import { createClient } from "@/lib/supabase/server";

function first<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export async function GET(request: Request) {
  const profile = await requireCurrentProfile();
  if (!hasReputationPermission(profile, "reputation.reports.read")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "feedback";
  const supabase = await createClient();
  const selectedLocationId = await getSelectedLocationId(profile);
  const report = await getReputationReport(supabase, { organizationId: profile.organizationId, locationIds: allowedLocationIds(profile, selectedLocationId) });
  let headers: string[];
  let rows: unknown[][];

  if (type === "reviews") {
    headers = ["patient", "location", "channel", "status", "source", "sent_at", "completed_at"];
    rows = report.reviewRequests.map((row) => {
      const contact = first(row.contacts);
      return [`${contact?.first_name ?? ""} ${contact?.last_name ?? ""}`, first(row.locations)?.name, row.request_channel, row.status, first(row.review_sources)?.name, row.sent_at, row.completed_at];
    });
  } else if (type === "referrals") {
    headers = ["referring_contact", "referred_contact", "status", "location", "paid_amount_cents"];
    rows = report.referrals.map((row) => [`${first(row.referring)?.first_name ?? ""} ${first(row.referring)?.last_name ?? ""}`, `${first(row.referred)?.first_name ?? ""} ${first(row.referred)?.last_name ?? ""}`, row.status, first(row.locations)?.name, first(row.sales)?.paid_amount_cents ?? 0]);
  } else if (type === "rewards") {
    headers = ["event_type", "reward_type", "amount_cents", "reason", "created_at"];
    rows = report.rewardEvents.map((row) => [row.event_type, row.reward_type, row.amount_cents, row.reason, row.created_at]);
  } else if (type === "reactivation") {
    headers = ["campaign", "status", "targeted", "reactivated", "booked", "sold", "collected_revenue_cents"];
    rows = report.campaigns.map((row) => [row.name, row.status, row.contacts_targeted, row.contacts_reactivated, row.bookings_generated, row.sales_generated, row.collected_revenue_cents]);
  } else {
    headers = ["patient", "location", "provider", "service", "nps_score", "csat_rating", "nps_category", "submitted_at", "response_text"];
    rows = report.feedbackResponses.map((row) => {
      const contact = first(row.contacts);
      return [`${contact?.first_name ?? ""} ${contact?.last_name ?? ""}`, first(row.locations)?.name, first(row.provider)?.full_name, first(row.services)?.name, row.score, row.rating, row.nps_category, row.submitted_at, row.response_text];
    });
  }

  return new Response(rowsToCsv(headers, rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="avora-reputation-${type}.csv"`
    }
  });
}
