import { NextResponse, type NextRequest } from "next/server";
import { recordInboundSms } from "@/lib/communications/conversation-service";
import { validateTwilioRequest } from "@/lib/communications/twilio-client";
import { checkRateLimit, defaultRateLimitRules } from "@/lib/security/rate-limit";
import { rateLimited, requestIp } from "@/lib/security/request-guard";

export async function POST(request: NextRequest) {
  const limit = checkRateLimit(defaultRateLimitRules.webhook, requestIp(request));
  if (!limit.allowed) return rateLimited(limit.resetAt);

  const formData = await request.formData();
  const params = Object.fromEntries(Array.from(formData.entries()).map(([key, value]) => [key, String(value)]));
  const valid = await validateTwilioRequest({
    signature: request.headers.get("x-twilio-signature"),
    url: request.url,
    params
  });

  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  await recordInboundSms({
    from: params.From,
    to: params.To,
    body: params.Body ?? "",
    providerMessageId: params.MessageSid ?? params.SmsSid
  });

  return new NextResponse("", { status: 204 });
}
