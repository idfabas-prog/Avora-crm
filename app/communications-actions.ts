"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { normalizePhoneNumber } from "@/lib/communications/phone";
import { renderSmsTemplate } from "@/lib/communications/templates";
import { sendTwilioSms } from "@/lib/communications/twilio-client";

function required(value: FormDataEntryValue | null, label: string) {
  const text = String(value ?? "").trim();
  if (!text) {
    throw new Error(`${label} is required`);
  }
  return text;
}

function optional(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

async function audit(action: string, table: string, id: string | null, metadata: Record<string, unknown> = {}) {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();

  await supabase.from("audit_logs").insert({
    organization_id: profile.organizationId,
    actor_id: profile.id,
    action,
    entity_table: table,
    entity_id: id,
    metadata
  });
}

export async function sendConversationSms(formData: FormData) {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const conversationId = required(formData.get("conversation_id"), "Conversation");
  const templateBody = optional(formData.get("template_body"));
  const typedBody = optional(formData.get("body"));
  const body = templateBody || typedBody;

  if (!body) {
    throw new Error("Message body is required");
  }

  const { data: conversation, error } = await supabase
    .from("conversations")
    .select(`
      id,
      organization_id,
      location_id,
      contact_id,
      contacts(first_name, last_name, phone),
      locations(name)
    `)
    .eq("id", conversationId)
    .eq("organization_id", profile.organizationId)
    .single();

  if (error || !conversation) {
    throw new Error(error?.message ?? "Conversation not found");
  }

  const contact = Array.isArray(conversation.contacts) ? conversation.contacts[0] : conversation.contacts;
  const location = Array.isArray(conversation.locations) ? conversation.locations[0] : conversation.locations;
  const to = normalizePhoneNumber(contact?.phone);

  if (!to) {
    throw new Error("Contact does not have a valid SMS phone number");
  }

  const { data: preference } = await supabase
    .from("contact_communication_preferences")
    .select("allowed, opted_out")
    .eq("contact_id", conversation.contact_id)
    .eq("channel", "sms")
    .maybeSingle();

  if (preference?.opted_out || preference?.allowed === false) {
    throw new Error("This contact is opted out of SMS");
  }

  const { rendered, missing } = renderSmsTemplate(body, {
    first_name: contact?.first_name,
    location_name: location?.name
  });

  if (missing.length > 0) {
    throw new Error(`Template is missing values for: ${missing.join(", ")}`);
  }

  const { data: number } = await supabase
    .from("communication_numbers")
    .select("phone_number, provider")
    .eq("organization_id", profile.organizationId)
    .eq("location_id", conversation.location_id)
    .eq("active", true)
    .eq("supports_sms", true)
    .order("is_primary", { ascending: false })
    .limit(1)
    .single();

  if (!number?.phone_number) {
    throw new Error("No active SMS number is configured for this location");
  }

  const { data: message, error: insertError } = await supabase
    .from("messages")
    .insert({
      organization_id: profile.organizationId,
      location_id: conversation.location_id,
      conversation_id: conversation.id,
      contact_id: conversation.contact_id,
      sender_user_id: profile.id,
      direction: "outbound",
      channel: "sms",
      from_address: number.phone_number,
      to_address: to,
      body: rendered,
      provider: "development",
      status: "sending",
      sent_at: new Date().toISOString()
    })
    .select("id")
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  try {
    const result = await sendTwilioSms({
      to,
      from: number.phone_number,
      body: rendered
    });

    await supabase
      .from("messages")
      .update({
        provider: result.provider,
        provider_message_id: result.providerMessageId,
        status: result.status,
        simulated: result.simulated,
        sent_at: new Date().toISOString()
      })
      .eq("id", message.id);

    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversation.id);

    await audit("SMS Sent", "messages", message.id, { simulated: result.simulated });
  } catch (caught) {
    await supabase
      .from("messages")
      .update({
        status: "failed",
        failed_at: new Date().toISOString(),
        error_message: caught instanceof Error ? caught.message : "Message failed"
      })
      .eq("id", message.id);
    await audit("SMS Failed", "messages", message.id);
    throw caught;
  }

  revalidatePath("/conversations");
  revalidatePath(`/contacts/${conversation.contact_id}`);
}

export async function addInternalConversationNote(formData: FormData) {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const conversationId = required(formData.get("conversation_id"), "Conversation");
  const body = required(formData.get("body"), "Note");

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, organization_id, location_id, contact_id")
    .eq("id", conversationId)
    .eq("organization_id", profile.organizationId)
    .single();

  if (!conversation) {
    throw new Error("Conversation not found");
  }

  await supabase.from("messages").insert({
    organization_id: profile.organizationId,
    location_id: conversation.location_id,
    conversation_id: conversation.id,
    contact_id: conversation.contact_id,
    sender_user_id: profile.id,
    direction: "outbound",
    channel: "sms",
    body,
    provider: "internal",
    status: "delivered",
    is_internal_note: true
  });

  await audit("Conversation Internal Note Added", "conversations", conversation.id);
  revalidatePath("/conversations");
}

export async function updateConversationStatus(formData: FormData) {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const conversationId = required(formData.get("conversation_id"), "Conversation");
  const status = required(formData.get("status"), "Status").toLowerCase();

  const { error } = await supabase
    .from("conversations")
    .update({ status })
    .eq("id", conversationId)
    .eq("organization_id", profile.organizationId);

  if (error) {
    throw new Error(error.message);
  }

  await audit(status === "closed" ? "Conversation Closed" : "Conversation Updated", "conversations", conversationId, { status });
  revalidatePath("/conversations");
}

export async function assignConversation(formData: FormData) {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const conversationId = required(formData.get("conversation_id"), "Conversation");
  const assignedUserId = optional(formData.get("assigned_user_id"));

  const { error } = await supabase
    .from("conversations")
    .update({ assigned_user_id: assignedUserId })
    .eq("id", conversationId)
    .eq("organization_id", profile.organizationId);

  if (error) {
    throw new Error(error.message);
  }

  await audit("Conversation Assigned", "conversations", conversationId, { assigned_user_id: assignedUserId });
  revalidatePath("/conversations");
}

export async function simulateInboundSms(formData: FormData) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Simulator is disabled in production");
  }

  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const conversationId = required(formData.get("conversation_id"), "Conversation");
  const body = `[SIMULATED INBOUND] ${required(formData.get("body"), "Message")}`;

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, organization_id, location_id, contact_id, contacts(phone), communication_numbers:locations(id)")
    .eq("id", conversationId)
    .eq("organization_id", profile.organizationId)
    .single();

  if (!conversation) {
    throw new Error("Conversation not found");
  }

  await supabase.from("messages").insert({
    organization_id: profile.organizationId,
    location_id: conversation.location_id,
    conversation_id: conversation.id,
    contact_id: conversation.contact_id,
    direction: "inbound",
    channel: "sms",
    body,
    provider: "development",
    provider_message_id: `sim_in_${crypto.randomUUID()}`,
    status: "received",
    simulated: true,
    received_at: new Date().toISOString()
  });

  await supabase
    .from("conversations")
    .update({
      status: "open",
      unread_count: 1,
      last_message_at: new Date().toISOString()
    })
    .eq("id", conversation.id);

  revalidatePath("/conversations");
}
