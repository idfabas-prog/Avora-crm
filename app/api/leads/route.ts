import { NextRequest } from "next/server";
import { normalizeSourceAlias, parseUtmCapture } from "@/lib/marketing/attribution";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, defaultRateLimitRules } from "@/lib/security/rate-limit";
import { rateLimited, requestIp } from "@/lib/security/request-guard";

function badRequest(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function cleanText(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

export async function POST(request: NextRequest) {
  const limit = checkRateLimit(defaultRateLimitRules.search, requestIp(request));
  if (!limit.allowed) return rateLimited(limit.resetAt);

  const expectedToken = process.env.LEAD_CAPTURE_API_TOKEN;
  if (!expectedToken) {
    return badRequest("Lead capture is not configured", 503);
  }

  const token = request.headers.get("x-avora-lead-token");
  if (token !== expectedToken) {
    return badRequest("Unauthorized", 401);
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return badRequest("Invalid JSON");

  const firstName = cleanText(body.first_name ?? body.firstName, 80);
  const lastName = cleanText(body.last_name ?? body.lastName, 80);
  const phone = cleanText(body.phone, 40);
  const email = cleanText(body.email, 160).toLowerCase();
  const locationSlug = cleanText(body.location_slug ?? body.locationSlug, 80).toLowerCase();
  if (!firstName || !lastName || (!phone && !email)) {
    return badRequest("first_name, last_name, and phone or email are required");
  }

  const supabase = createAdminClient();
  const { data: org } = await supabase.from("organizations").select("id").eq("slug", cleanText(body.organization_slug ?? "avora").toLowerCase()).single();
  if (!org) return badRequest("Organization not found", 404);
  const { data: location } = locationSlug
    ? await supabase.from("locations").select("id").eq("organization_id", org.id).eq("slug", locationSlug).maybeSingle()
    : { data: null };

  const sourceAlias = normalizeSourceAlias(cleanText(body.utm_source ?? body.source ?? "unknown", 100));
  const { data: alias } = await supabase
    .from("marketing_source_aliases")
    .select("source_id")
    .eq("organization_id", org.id)
    .eq("normalized_alias", sourceAlias)
    .maybeSingle();
  const { data: unknownSource } = !alias
    ? await supabase.from("marketing_sources").select("id").eq("organization_id", org.id).eq("name", "Direct / Unknown").maybeSingle()
    : { data: null };
  const sourceId = alias?.source_id ?? unknownSource?.id ?? null;

  const campaignName = cleanText(body.utm_campaign ?? body.campaign, 180);
  const { data: campaign } = campaignName
    ? await supabase.from("marketing_campaigns").select("id").eq("organization_id", org.id).ilike("name", `%${campaignName.replaceAll("%", "")}%`).limit(1).maybeSingle()
    : { data: null };

  const existingQuery = supabase.from("contacts").select("id, location_id").eq("organization_id", org.id).limit(1);
  const { data: existingRows } = email
    ? await existingQuery.eq("email", email)
    : await existingQuery.eq("phone", phone);
  let contactId = existingRows?.[0]?.id as string | undefined;
  let contactLocationId = existingRows?.[0]?.location_id as string | null | undefined;
  if (!contactId) {
    const { data: contact, error } = await supabase.from("contacts").insert({
      organization_id: org.id,
      location_id: location?.id ?? null,
      first_name: firstName,
      last_name: lastName,
      phone: phone || null,
      email: email || null,
      lead_source: cleanText(body.source ?? body.utm_source ?? "Website", 120),
      status: "new_lead",
      last_activity_at: new Date().toISOString()
    }).select("id, location_id").single();
    if (error) return badRequest(error.message, 500);
    contactId = contact.id;
    contactLocationId = contact.location_id;
  }

  const capture = parseUtmCapture({
    url: cleanText(body.landing_page ?? body.landingPage, 1000),
    referrer: cleanText(body.referrer, 1000)
  });
  const { error: attributionError } = await supabase.from("contact_attributions").insert({
    organization_id: org.id,
    location_id: contactLocationId ?? location?.id ?? null,
    contact_id: contactId,
    source_id: sourceId,
    campaign_id: campaign?.id ?? null,
    attribution_type: "lead_creation",
    ...capture,
    external_click_id: cleanText(body.gclid ?? body.fbclid ?? body.external_click_id, 200) || null,
    is_primary: false,
    metadata: { public_capture: true, user_agent: request.headers.get("user-agent")?.slice(0, 200) ?? null }
  });
  if (attributionError) return badRequest(attributionError.message, 500);

  return Response.json({ ok: true, contact_id: contactId });
}
