import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, defaultRateLimitRules } from "@/lib/security/rate-limit";
import { rateLimited, requestIp } from "@/lib/security/request-guard";

function verifyStripeSignature(payload: string, signature: string | null) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return process.env.PAYMENTS_MODE !== "production";
  }

  if (!signature) return false;

  const parts = Object.fromEntries(signature.split(",").map((part) => {
    const [key, value] = part.split("=");
    return [key, value];
  }));
  const timestamp = parts.t;
  const expected = parts.v1;
  if (!timestamp || !expected) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const digest = createHmac("sha256", secret).update(signedPayload).digest("hex");
  const left = Buffer.from(digest);
  const right = Buffer.from(expected);

  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  const limit = checkRateLimit(defaultRateLimitRules.webhook, requestIp(request));
  if (!limit.allowed) return rateLimited(limit.resetAt);

  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!verifyStripeSignature(payload, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(payload) as {
    id: string;
    type: string;
    data?: { object?: Record<string, unknown> };
  };
  const supabase = createAdminClient();

  const { error } = await supabase.from("stripe_webhook_events").insert({
    provider_event_id: event.id,
    event_type: event.type,
    payload: event,
    processed_at: new Date().toISOString()
  });

  if (error && !error.message.toLowerCase().includes("duplicate")) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    received: true,
    idempotent: Boolean(error),
    supported: ["payment_intent.succeeded", "payment_intent.payment_failed", "charge.refunded", "refund.updated"].includes(event.type)
  });
}
