import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhoneNumber } from "@/lib/communications/phone";
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

  const supabase = createAdminClient();
  const to = normalizePhoneNumber(params.To);
  const from = normalizePhoneNumber(params.From);
  const callSid = params.CallSid;

  if (!callSid) {
    return NextResponse.json({ error: "Missing CallSid" }, { status: 400 });
  }

  const { data: number } = to
    ? await supabase.from("communication_numbers").select("organization_id, location_id").eq("phone_number", to).maybeSingle()
    : { data: null };

  if (!number) {
    return NextResponse.json({ error: "Unknown receiving communication number" }, { status: 202 });
  }

  await supabase.from("calls").upsert({
    organization_id: number.organization_id,
    location_id: number.location_id,
    provider: "twilio",
    provider_call_sid: callSid,
    direction: params.Direction?.includes("inbound") ? "inbound" : "outbound",
    from_number: from,
    to_number: to,
    status: (params.CallStatus ?? "initiated").replaceAll("-", "_"),
    started_at: params.Timestamp ? new Date(params.Timestamp).toISOString() : new Date().toISOString()
  }, { onConflict: "provider_call_sid" });

  return new NextResponse("", { status: 204 });
}
