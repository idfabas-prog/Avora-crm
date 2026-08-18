"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { assertCallPermission, callLocationAllowed } from "@/lib/calls/permissions";
import { callbackTaskIdempotencyKey } from "@/lib/calls/metrics";
import { getTelephonyAdapter } from "@/lib/integrations/telephony";
import { createClient } from "@/lib/supabase/server";

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function createSimulatedOutboundCall(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertCallPermission(profile, "calls.make");
  const supabase = await createClient();
  const contactId = formString(formData, "contact_id");
  const toNumber = formString(formData, "to_number");
  const locationId = formString(formData, "location_id");

  if (!contactId && !toNumber) {
    throw new Error("Choose a contact or enter a number to call");
  }
  if (!callLocationAllowed(profile, locationId)) {
    throw new Error("Selected location is not available for this user");
  }

  const { data: contact } = contactId
    ? await supabase
      .from("contacts")
      .select("id, phone, location_id")
      .eq("organization_id", profile.organizationId)
      .eq("id", contactId)
      .maybeSingle()
    : { data: null };
  const targetNumber = toNumber ?? contact?.phone;

  if (!targetNumber) {
    throw new Error("The selected contact does not have a phone number");
  }

  const fromNumber = formString(formData, "from_number") ?? "+13055550101";
  const adapter = getTelephonyAdapter();
  const call = await adapter.createCall({
    organizationId: profile.organizationId,
    locationId: locationId ?? contact?.location_id ?? null,
    contactId: contact?.id ?? null,
    fromNumber,
    toNumber: targetNumber,
    idempotencyKey: formString(formData, "idempotency_key") ?? `${profile.id}:${contact?.id ?? targetNumber}:${Date.now()}`
  });

  const { error } = await supabase.from("calls").upsert({
    organization_id: profile.organizationId,
    location_id: locationId ?? contact?.location_id ?? null,
    contact_id: contact?.id ?? null,
    direction: "outbound",
    provider: call.provider,
    provider_call_id: call.providerCallId,
    from_number: fromNumber,
    to_number: targetNumber,
    status: call.status,
    assigned_user_id: profile.id,
    handled_by_user_id: profile.id,
    started_at: new Date().toISOString(),
    simulated: true,
    metadata: { phase: 15, click_to_call: true, simulated: true }
  }, { onConflict: "provider,provider_call_id" });

  if (error) throw new Error(error.message);
  revalidatePath("/calls");
  revalidatePath("/calls/dashboard");
}

export async function updateCallDisposition(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertCallPermission(profile, "calls.manage");
  const supabase = await createClient();
  const callId = formString(formData, "call_id");
  const dispositionId = formString(formData, "disposition_id");
  const disposition = formString(formData, "disposition");

  if (!callId || (!dispositionId && !disposition)) {
    throw new Error("Call and disposition are required");
  }

  const resolvedDisposition = dispositionId
    ? await supabase
      .from("call_dispositions")
      .select("name")
      .eq("organization_id", profile.organizationId)
      .eq("id", dispositionId)
      .maybeSingle()
    : { data: null };

  const { error } = await supabase
    .from("calls")
    .update({ disposition_id: dispositionId, disposition: resolvedDisposition.data?.name ?? disposition, updated_at: new Date().toISOString() })
    .eq("organization_id", profile.organizationId)
    .eq("id", callId);

  if (error) throw new Error(error.message);
  revalidatePath("/calls");
  revalidatePath(`/calls/${callId}`);
}

export async function assignMissedCallCallback(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertCallPermission(profile, "calls.answer");
  const supabase = await createClient();
  const callId = formString(formData, "call_id");
  const assignedTo = formString(formData, "assigned_to") ?? profile.id;

  if (!callId) {
    throw new Error("Call is required");
  }

  const { data: call } = await supabase
    .from("calls")
    .select("id, organization_id, location_id, contact_id, assigned_user_id")
    .eq("organization_id", profile.organizationId)
    .eq("id", callId)
    .maybeSingle();

  if (!call) {
    throw new Error("Call not found");
  }
  if (!callLocationAllowed(profile, call.location_id)) {
    throw new Error("Selected call is outside your allowed locations");
  }

  const { error } = await supabase.from("missed_call_callbacks").upsert({
    organization_id: profile.organizationId,
    location_id: call.location_id,
    call_id: call.id,
    contact_id: call.contact_id,
    assigned_to: assignedTo,
    status: "assigned",
    priority: 80,
    due_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    idempotency_key: callbackTaskIdempotencyKey(call.id)
  }, { onConflict: "call_id" });

  if (error) throw new Error(error.message);
  revalidatePath("/calls");
  revalidatePath("/calls/callbacks");
}

export async function addCallNote(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertCallPermission(profile, "calls.answer");
  const supabase = await createClient();
  const callId = formString(formData, "call_id");
  const contactId = formString(formData, "contact_id");
  const body = formString(formData, "body");

  if (!callId || !body) {
    throw new Error("Call note text is required");
  }

  const { error } = await supabase.from("call_notes").insert({
    organization_id: profile.organizationId,
    call_id: callId,
    contact_id: contactId,
    author_id: profile.id,
    body
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/calls/${callId}`);
}

export async function progressCallListMember(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertCallPermission(profile, "calls.make");
  const supabase = await createClient();
  const callListId = formString(formData, "call_list_id");
  const contactId = formString(formData, "contact_id");
  const status = formString(formData, "status");

  if (!callListId || !contactId || !status) {
    throw new Error("Call list member and status are required");
  }

  const { error } = await supabase
    .from("call_list_members")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("call_list_id", callListId)
    .eq("contact_id", contactId);

  if (error) throw new Error(error.message);
  revalidatePath("/calls");
  revalidatePath("/calls/callbacks");
}
