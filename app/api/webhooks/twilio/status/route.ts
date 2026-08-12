import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapTwilioMessageStatus } from "@/lib/communications/message-status";
import { validateTwilioRequest } from "@/lib/communications/twilio-client";

export async function POST(request: NextRequest) {
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

  const sid = params.MessageSid ?? params.SmsSid;
  if (!sid) {
    return NextResponse.json({ error: "Missing MessageSid" }, { status: 400 });
  }

  const status = mapTwilioMessageStatus(params.MessageStatus ?? params.SmsStatus ?? "sent");
  const updates: Record<string, string | null> = {
    status,
    error_code: params.ErrorCode ?? null,
    error_message: params.ErrorMessage ?? null
  };

  if (status === "delivered") updates.delivered_at = new Date().toISOString();
  if (status === "failed" || status === "undelivered") updates.failed_at = new Date().toISOString();

  await createAdminClient()
    .from("messages")
    .update(updates)
    .eq("provider", "twilio")
    .eq("provider_message_id", sid);

  return new NextResponse("", { status: 204 });
}
