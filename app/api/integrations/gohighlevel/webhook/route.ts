import { checkRateLimit, defaultRateLimitRules } from "@/lib/security/rate-limit";
import { rateLimited, requestIp } from "@/lib/security/request-guard";
import { queueGhlWebhookSync } from "@/lib/integrations/gohighlevel/importer";
import { handleGhlOAuthLifecycleEvent } from "@/lib/integrations/gohighlevel/oauth";
import { GHL_SUPPORTED_WEBHOOK_EVENTS, hashWebhookPayload, normalizeWebhookEvent, verifyWebhookSignature } from "@/lib/integrations/gohighlevel/webhooks";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GhlConnection } from "@/lib/integrations/gohighlevel/types";

function safeWebhookError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 300) : "GoHighLevel webhook failed";
}

function signatureConfigurationPresent() {
  return Boolean(process.env.GHL_WEBHOOK_PUBLIC_KEY || process.env.GHL_WEBHOOK_LEGACY_PUBLIC_KEY || process.env.GHL_WEBHOOK_SECRET);
}

export async function POST(request: Request) {
  const limit = checkRateLimit(defaultRateLimitRules.webhook, requestIp(request));
  if (!limit.allowed) return rateLimited(limit.resetAt);

  const rawBody = await request.text();
  const payloadHash = hashWebhookPayload(rawBody);
  const verification = verifyWebhookSignature(rawBody, request.headers.get("x-highlevel-signature") ?? request.headers.get("x-leadconnector-signature"), process.env.GHL_WEBHOOK_SECRET, {
    ghlSignature: request.headers.get("x-ghl-signature"),
    ghlPublicKey: process.env.GHL_WEBHOOK_PUBLIC_KEY,
    legacySignature: request.headers.get("x-wh-signature"),
    legacyPublicKey: process.env.GHL_WEBHOOK_LEGACY_PUBLIC_KEY
  });

  if (!signatureConfigurationPresent()) {
    return Response.json({ ok: false, error: "GoHighLevel webhook signature verification is not configured" }, { status: 503 });
  }
  if (!verification.verified) {
    return Response.json({ ok: false, error: "Invalid GoHighLevel webhook signature", reason: verification.reason }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON webhook payload" }, { status: 400 });
  }

  const event = normalizeWebhookEvent(payload);
  const supabase = createAdminClient();
  const { data: oauthInstallation } = event.locationId
    ? await supabase
      .from("ghl_oauth_installations")
      .select("id, ghl_connection_id, status, webhook_ready")
      .eq("ghl_location_id", event.locationId)
      .maybeSingle()
    : { data: null };
  const { data: connection } = oauthInstallation?.ghl_connection_id
    ? await supabase.from("ghl_connections").select("*").eq("id", oauthInstallation.ghl_connection_id).neq("connection_type", "mock").maybeSingle()
    : event.locationId
      ? await supabase.from("ghl_connections").select("*").eq("ghl_location_id", event.locationId).neq("connection_type", "mock").maybeSingle()
      : { data: null };

  if (!connection) {
    return Response.json({ ok: true, ignored: true, reason: "unknown_connection" });
  }

  const connectionRow = connection as GhlConnection;
  if (event.providerEventId) {
    const { data: duplicate } = await supabase
      .from("ghl_webhook_events")
      .select("id")
      .eq("connection_id", connectionRow.id)
      .eq("provider_event_id", event.providerEventId)
      .maybeSingle();
    if (duplicate?.id) return Response.json({ ok: true, duplicate: true, eventId: duplicate.id });
  }

  const { data: hashDuplicate } = await supabase
    .from("ghl_webhook_events")
    .select("id")
    .eq("connection_id", connectionRow.id)
    .eq("payload_hash", payloadHash)
    .maybeSingle();
  if (hashDuplicate?.id) return Response.json({ ok: true, duplicate: true, eventId: hashDuplicate.id });

  const supportedEvent = GHL_SUPPORTED_WEBHOOK_EVENTS.some((name) => event.eventType.toLowerCase().includes(name.toLowerCase().replace(/create$/, "").replace(/update$/, "")));
  const lifecycleHandled = await handleGhlOAuthLifecycleEvent(supabase, { eventType: event.eventType, locationId: event.locationId, providerEventId: event.providerEventId });
  const oauthWebhookDisabled = Boolean(oauthInstallation && oauthInstallation.webhook_ready === false && !lifecycleHandled);
  const canQueue = supportedEvent && !oauthWebhookDisabled && Boolean(event.objectType && event.externalObjectId);
  const { data: stored, error } = await supabase.from("ghl_webhook_events").insert({
    organization_id: connectionRow.organization_id,
    connection_id: connectionRow.id,
    provider_event_id: event.providerEventId,
    event_type: event.eventType,
    external_object_id: event.externalObjectId,
    payload_hash: payloadHash,
    status: canQueue || lifecycleHandled ? "received" : "ignored",
    error_summary: canQueue || lifecycleHandled ? null : oauthWebhookDisabled ? "OAuth installation is not webhook-ready." : "Webhook event has no supported read-only follow-up target.",
    metadata_safe: {
      phase: "21B",
      verification: verification.reason,
      location_id: event.locationId,
      object_type: event.objectType,
      oauth_installation_id: oauthInstallation?.id ?? null,
      oauth_installation_status: oauthInstallation?.status ?? null,
      calendar_id: event.calendarId,
      conversation_id: event.conversationId,
      provider_timestamp: event.timestamp,
      lifecycle_handled: lifecycleHandled
    }
  }).select("id").single();
  if (error) return Response.json({ ok: false, error: "Webhook storage failed" }, { status: 500 });

  let runId: string | null = null;
  if (canQueue && event.objectType) {
    try {
      runId = await queueGhlWebhookSync(supabase, connectionRow, {
        webhookEventId: String(stored.id),
        eventType: event.eventType,
        objectType: event.objectType,
        externalObjectId: event.externalObjectId,
        calendarId: event.calendarId,
        conversationId: event.conversationId,
        providerTimestamp: event.timestamp
      });
      await supabase.from("ghl_webhook_events").update({ metadata_safe: { phase: "21B", queued_run_id: runId, verification: verification.reason } }).eq("id", stored.id);
    } catch (error) {
      await supabase.from("ghl_webhook_events").update({ status: "failed", error_summary: safeWebhookError(error) }).eq("id", stored.id);
      return Response.json({ ok: false, error: safeWebhookError(error), eventId: stored.id }, { status: 500 });
    }
  }

  await supabase.from("ghl_connections").update({ last_webhook_at: new Date().toISOString() }).eq("id", connectionRow.id);
  return Response.json({ ok: true, eventId: stored.id, queuedRunId: runId, readOnly: true, writesToGhl: false });
}
