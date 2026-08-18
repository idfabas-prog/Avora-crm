import { requireCurrentProfile } from "@/lib/auth/profile";
import { hasCampaignPermission } from "@/lib/campaigns/permissions";
import { APP_DISPLAY_NAME } from "@/lib/config/branding";
import { retryableFailure } from "@/lib/campaigns/safety";
import { createClient } from "@/lib/supabase/server";
import { recordDomainEvent } from "@/lib/workflows/events";

function first<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function renderBody(template: string, contact: { first_name: string | null; last_name: string | null }) {
  return template
    .replaceAll("{{first_name}}", contact.first_name ?? "there")
    .replaceAll("{{last_name}}", contact.last_name ?? "")
    .replaceAll("{{full_name}}", `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim());
}

export async function POST(request: Request) {
  const profile = await requireCurrentProfile();
  if (!hasCampaignPermission(profile, "campaigns.launch")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(request.url);
  const batchSize = Math.min(Number(url.searchParams.get("batch") ?? "25") || 25, 100);
  const supabase = await createClient();
  const { data: jobs, error: claimError } = await supabase.rpc("claim_campaign_jobs", { batch_size: batchSize });
  if (claimError) return Response.json({ error: claimError.message }, { status: 400 });

  const results: Array<{ jobId: string; recipientId: string | null; status: string; error?: string }> = [];
  const touchedRunIds = new Set<string>();
  for (const job of jobs ?? []) {
    try {
      const { data: recipient, error: recipientError } = await supabase
        .from("campaign_recipients")
        .select("id, organization_id, location_id, contact_id, campaign_id, campaign_run_id, status, scheduled_send_at, provider_message_id, contacts(first_name, last_name, phone), campaigns(name, status), campaign_variants(message_body)")
        .eq("organization_id", profile.organizationId)
        .eq("id", job.campaign_recipient_id)
        .single();
      if (recipientError || !recipient) throw new Error(recipientError?.message ?? "Recipient not found");
      if (recipient.campaign_run_id) touchedRunIds.add(recipient.campaign_run_id);
      const campaign = first(recipient.campaigns);
      if (campaign?.status !== "running") throw new Error("Campaign is not running");
      const contact = first(recipient.contacts);
      if (!contact?.phone) throw new Error("Recipient has no SMS phone");
      const variant = first(recipient.campaign_variants);
      const body = renderBody(variant?.message_body ?? `Hi {{first_name}}, this is a simulated ${APP_DISPLAY_NAME} campaign message from ${campaign?.name ?? APP_DISPLAY_NAME}.`, contact);
      const providerMessageId = recipient.provider_message_id ?? `sim-campaign:${recipient.id}`;

      const { data: existingConversation } = await supabase
        .from("conversations")
        .select("id")
        .eq("organization_id", profile.organizationId)
        .eq("contact_id", recipient.contact_id)
        .eq("channel", "sms")
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      let conversationId = existingConversation?.id;
      if (!conversationId) {
        const { data: createdConversation, error: conversationError } = await supabase
          .from("conversations")
          .insert({
            organization_id: profile.organizationId,
            location_id: recipient.location_id,
            contact_id: recipient.contact_id,
            status: "open",
            channel: "sms",
            last_message_at: new Date().toISOString()
          })
          .select("id")
          .single();
        if (conversationError || !createdConversation) throw new Error(conversationError?.message ?? "Conversation could not be created");
        conversationId = createdConversation.id;
      }

      const now = new Date().toISOString();
      const { error: messageError } = await supabase.from("messages").upsert({
        organization_id: profile.organizationId,
        location_id: recipient.location_id,
        conversation_id: conversationId,
        contact_id: recipient.contact_id,
        sender_user_id: profile.id,
        direction: "outbound",
        channel: "sms",
        to_address: contact.phone,
        body,
        provider: "campaign_simulator",
        provider_message_id: providerMessageId,
        status: "delivered",
        simulated: true,
        sent_at: now,
        delivered_at: now
      }, { onConflict: "provider,provider_message_id" });
      if (messageError) throw new Error(messageError.message);

      const { error: recipientUpdateError } = await supabase
        .from("campaign_recipients")
        .update({ status: "delivered", provider: "campaign_simulator", provider_message_id: providerMessageId, sent_at: now, delivered_at: now })
        .eq("organization_id", profile.organizationId)
        .eq("id", recipient.id);
      if (recipientUpdateError) throw new Error(recipientUpdateError.message);
      await supabase.from("conversations").update({ last_message_at: now }).eq("id", conversationId);
      await supabase.from("campaign_events").upsert([
        { organization_id: profile.organizationId, campaign_id: recipient.campaign_id, campaign_run_id: recipient.campaign_run_id, campaign_recipient_id: recipient.id, contact_id: recipient.contact_id, event_type: "sent", event_at: now, idempotency_key: `campaign-event:${recipient.id}:sent` },
        { organization_id: profile.organizationId, campaign_id: recipient.campaign_id, campaign_run_id: recipient.campaign_run_id, campaign_recipient_id: recipient.id, contact_id: recipient.contact_id, event_type: "delivered", event_at: now, idempotency_key: `campaign-event:${recipient.id}:delivered` }
      ], { onConflict: "organization_id,idempotency_key" });
      await recordDomainEvent(supabase, {
        organizationId: profile.organizationId,
        locationId: recipient.location_id,
        contactId: recipient.contact_id,
        eventType: "campaign.delivered",
        entityType: "campaign_recipient",
        entityId: recipient.id,
        payload: { campaign_id: recipient.campaign_id, campaign_run_id: recipient.campaign_run_id, provider_message_id: providerMessageId, simulated: true },
        occurredAt: new Date(now)
      });
      await supabase.rpc("complete_campaign_job", { target_job_id: job.id, succeeded: true, error_message: null });
      results.push({ jobId: job.id, recipientId: recipient.id, status: "completed" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown campaign processing error";
      const terminal = !retryableFailure(message);
      await supabase.rpc("complete_campaign_job", { target_job_id: job.id, succeeded: false, error_message: message });
      if (terminal) {
        await supabase.from("campaign_jobs").update({ status: "cancelled", last_error: message }).eq("id", job.id).eq("organization_id", profile.organizationId);
      }
      results.push({ jobId: job.id, recipientId: job.campaign_recipient_id ?? null, status: terminal ? "cancelled" : "failed", error: message });
    }
  }

  for (const runId of touchedRunIds) {
    const { data: rows } = await supabase
      .from("campaign_recipients")
      .select("status, replied_at, booked_at, sold_at, revenue_cents")
      .eq("organization_id", profile.organizationId)
      .eq("campaign_run_id", runId);
    await supabase.from("campaign_runs").update({
      sent: (rows ?? []).filter((row) => ["sent", "delivered", "replied", "converted"].includes(row.status)).length,
      failed: (rows ?? []).filter((row) => row.status === "failed").length,
      replied: (rows ?? []).filter((row) => Boolean(row.replied_at)).length,
      booked: (rows ?? []).filter((row) => Boolean(row.booked_at)).length,
      sold: (rows ?? []).filter((row) => Boolean(row.sold_at)).length,
      collected_revenue_cents: (rows ?? []).reduce((sum, row) => sum + Number(row.revenue_cents ?? 0), 0)
    }).eq("organization_id", profile.organizationId).eq("id", runId);
  }

  return Response.json({ processed: results.length, results, mode: "simulated" });
}
