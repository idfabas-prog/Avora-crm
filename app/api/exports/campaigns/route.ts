import { requireCurrentProfile } from "@/lib/auth/profile";
import { hasCampaignPermission } from "@/lib/campaigns/permissions";
import { createClient } from "@/lib/supabase/server";

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows: Array<Record<string, unknown>>) {
  const headers = Object.keys(rows[0] ?? { empty: "" });
  return [headers.join(","), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))].join("\n");
}

function first<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export async function GET(request: Request) {
  const profile = await requireCurrentProfile();
  if (!hasCampaignPermission(profile, "campaigns.analytics.read")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "results";
  const supabase = await createClient();

  if (type === "recipients") {
    const { data, error } = await supabase
      .from("campaign_recipients")
      .select("id, status, eligibility_status, exclusion_reason, scheduled_send_at, sent_at, delivered_at, replied_at, booked_at, sold_at, revenue_cents, campaigns(name), contacts(first_name, last_name, phone), locations(name), campaign_variants(name)")
      .eq("organization_id", profile.organizationId)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) return Response.json({ error: error.message }, { status: 400 });
    const rows = (data ?? []).map((recipient) => {
      const campaign = first(recipient.campaigns);
      const contact = first(recipient.contacts);
      const location = first(recipient.locations);
      const variant = first(recipient.campaign_variants);
      return {
        campaign: campaign?.name ?? "",
        contact: contact ? `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim() : "",
        phone: contact?.phone ?? "",
        location: location?.name ?? "",
        variant: variant?.name ?? "",
        status: recipient.status,
        eligibility_status: recipient.eligibility_status,
        exclusion_reason: recipient.exclusion_reason ?? "",
        scheduled_send_at: recipient.scheduled_send_at ?? "",
        sent_at: recipient.sent_at ?? "",
        delivered_at: recipient.delivered_at ?? "",
        replied_at: recipient.replied_at ?? "",
        booked_at: recipient.booked_at ?? "",
        sold_at: recipient.sold_at ?? "",
        revenue_cents: recipient.revenue_cents ?? 0
      };
    });
    return new Response(toCsv(rows), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="avora-campaign-recipients.csv"'
      }
    });
  }

  const { data, error } = await supabase
    .from("campaigns")
    .select("id, name, campaign_type, status, channel, message_classification, launched_at, completed_at, segments(name), campaign_runs(recipients_total, recipients_eligible, recipients_skipped, sent, failed, replied, booked, sold, collected_revenue_cents)")
    .eq("organization_id", profile.organizationId)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) return Response.json({ error: error.message }, { status: 400 });
  const rows = (data ?? []).map((campaign) => {
    const segment = first(campaign.segments);
    const runs = campaign.campaign_runs ?? [];
    return {
      campaign: campaign.name,
      type: campaign.campaign_type,
      status: campaign.status,
      channel: campaign.channel,
      classification: campaign.message_classification,
      segment: segment?.name ?? "",
      runs: runs.length,
      recipients: runs.reduce((sum, run) => sum + Number(run.recipients_total ?? 0), 0),
      eligible: runs.reduce((sum, run) => sum + Number(run.recipients_eligible ?? 0), 0),
      skipped: runs.reduce((sum, run) => sum + Number(run.recipients_skipped ?? 0), 0),
      sent: runs.reduce((sum, run) => sum + Number(run.sent ?? 0), 0),
      failed: runs.reduce((sum, run) => sum + Number(run.failed ?? 0), 0),
      replied: runs.reduce((sum, run) => sum + Number(run.replied ?? 0), 0),
      booked: runs.reduce((sum, run) => sum + Number(run.booked ?? 0), 0),
      sold: runs.reduce((sum, run) => sum + Number(run.sold ?? 0), 0),
      revenue_cents: runs.reduce((sum, run) => sum + Number(run.collected_revenue_cents ?? 0), 0),
      launched_at: campaign.launched_at ?? "",
      completed_at: campaign.completed_at ?? ""
    };
  });
  return new Response(toCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="avora-campaign-results.csv"'
    }
  });
}
