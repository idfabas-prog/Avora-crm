import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhoneNumber } from "./phone";
import { isSmsOptOut } from "./opt-out";

type InboundSmsInput = {
  from: string;
  to: string;
  body: string;
  providerMessageId: string;
};

export async function recordInboundSms(input: InboundSmsInput) {
  const supabase = createAdminClient();
  const from = normalizePhoneNumber(input.from);
  const to = normalizePhoneNumber(input.to);

  if (!from || !to) {
    throw new Error("Invalid inbound phone number");
  }

  const { data: number } = await supabase
    .from("communication_numbers")
    .select("organization_id, location_id")
    .eq("phone_number", to)
    .eq("active", true)
    .single();

  if (!number) {
    throw new Error("Unknown receiving communication number");
  }

  let { data: contact } = await supabase
    .from("contacts")
    .select("id, first_name, last_name")
    .eq("organization_id", number.organization_id)
    .eq("phone", from)
    .maybeSingle();

  if (!contact) {
    const { data: createdContact, error: contactError } = await supabase
      .from("contacts")
      .insert({
        organization_id: number.organization_id,
        location_id: number.location_id,
        first_name: "Inbound",
        last_name: "SMS Lead",
        phone: from,
        lead_source: "Inbound SMS",
        status: "new_lead",
        last_activity_at: new Date().toISOString()
      })
      .select("id, first_name, last_name")
      .single();

    if (contactError) {
      throw new Error(contactError.message);
    }

    contact = createdContact;
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("organization_id", number.organization_id)
    .eq("contact_id", contact.id)
    .eq("channel", "sms")
    .maybeSingle();

  const conversationId =
    conversation?.id ??
    (
      await supabase
        .from("conversations")
        .insert({
          organization_id: number.organization_id,
          location_id: number.location_id,
          contact_id: contact.id,
          status: "open",
          channel: "sms",
          last_message_at: new Date().toISOString(),
          unread_count: 1
        })
        .select("id")
        .single()
    ).data?.id;

  if (!conversationId) {
    throw new Error("Could not create conversation");
  }

  const { data: existing } = await supabase
    .from("messages")
    .select("id")
    .eq("provider", "twilio")
    .eq("provider_message_id", input.providerMessageId)
    .maybeSingle();

  if (existing) {
    return { messageId: existing.id, duplicate: true };
  }

  const optedOut = isSmsOptOut(input.body);

  const { data: message, error: messageError } = await supabase
    .from("messages")
    .insert({
      organization_id: number.organization_id,
      location_id: number.location_id,
      conversation_id: conversationId,
      contact_id: contact.id,
      direction: "inbound",
      channel: "sms",
      from_address: from,
      to_address: to,
      body: input.body,
      provider: "twilio",
      provider_message_id: input.providerMessageId,
      status: "received",
      received_at: new Date().toISOString()
    })
    .select("id")
    .single();

  if (messageError) {
    throw new Error(messageError.message);
  }

  await supabase
    .from("conversations")
    .update({
      status: "open",
      last_message_at: new Date().toISOString(),
      unread_count: 1
    })
    .eq("id", conversationId);

  if (optedOut) {
    await supabase.from("contact_communication_preferences").upsert({
      organization_id: number.organization_id,
      contact_id: contact.id,
      channel: "sms",
      allowed: false,
      opted_out: true,
      opt_out_at: new Date().toISOString(),
      consent_source: "Twilio inbound opt-out keyword"
    });
  }

  return { messageId: message.id, duplicate: false, optedOut };
}
