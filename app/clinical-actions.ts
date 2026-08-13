"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { assertClinicalLocation, assertClinicalPermission } from "@/lib/clinical/permissions";
import { emitDomainEvent } from "@/lib/workflows/server-events";

function required(value: FormDataEntryValue | null, label: string) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function optional(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

function numberValue(value: FormDataEntryValue | null, fallback = 0) {
  const number = Number(String(value ?? "").trim());
  return Number.isFinite(number) ? number : fallback;
}

async function audit(action: string, entityTable: string, entityId: string | null, metadata: Record<string, unknown> = {}) {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  await supabase.from("audit_logs").insert({
    organization_id: profile.organizationId,
    actor_id: profile.id,
    action,
    entity_table: entityTable,
    entity_id: entityId,
    metadata
  });
}

export async function createTreatmentPlan(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertClinicalPermission(profile, "clinical.treatment_plans.write");
  const supabase = await createClient();
  const locationId = required(formData.get("location_id"), "Location");
  assertClinicalLocation(profile, locationId);
  const contactId = required(formData.get("contact_id"), "Contact");

  const { data: plan, error } = await supabase.from("treatment_plans").insert({
    organization_id: profile.organizationId,
    location_id: locationId,
    contact_id: contactId,
    provider_id: optional(formData.get("provider_id")),
    name: required(formData.get("name"), "Plan name"),
    description: optional(formData.get("description")),
    status: optional(formData.get("status")) ?? "active",
    start_date: required(formData.get("start_date"), "Start date"),
    target_completion_date: optional(formData.get("target_completion_date")),
    created_by: profile.id
  }).select("id").single();
  if (error) throw new Error(error.message);

  const serviceId = optional(formData.get("service_id"));
  if (serviceId) {
    const { error: itemError } = await supabase.from("treatment_plan_items").insert({
      treatment_plan_id: plan.id,
      service_id: serviceId,
      package_entitlement_id: optional(formData.get("package_entitlement_id")),
      planned_sessions: Math.max(numberValue(formData.get("planned_sessions"), 1), 1),
      interval_days: numberValue(formData.get("interval_days"), 0),
      notes: optional(formData.get("item_notes"))
    });
    if (itemError) throw new Error(itemError.message);
  }

  await audit("Treatment Plan Created", "treatment_plans", plan.id, { contact_id: contactId });
  revalidatePath(`/contacts/${contactId}`);
  revalidatePath("/clinical");
}

export async function createTreatmentSession(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertClinicalPermission(profile, "clinical.sessions.write");
  const supabase = await createClient();
  const locationId = required(formData.get("location_id"), "Location");
  assertClinicalLocation(profile, locationId);
  const contactId = required(formData.get("contact_id"), "Contact");
  const status = optional(formData.get("status")) ?? "scheduled";

  const { data: session, error } = await supabase.from("treatment_sessions").insert({
    organization_id: profile.organizationId,
    location_id: locationId,
    contact_id: contactId,
    treatment_plan_id: optional(formData.get("treatment_plan_id")),
    treatment_plan_item_id: optional(formData.get("treatment_plan_item_id")),
    package_entitlement_id: optional(formData.get("package_entitlement_id")),
    appointment_id: optional(formData.get("appointment_id")),
    service_id: required(formData.get("service_id"), "Service"),
    provider_id: optional(formData.get("provider_id")) ?? profile.id,
    status,
    scheduled_at: optional(formData.get("scheduled_at")),
    session_number: numberValue(formData.get("session_number"), 1),
    treatment_area: optional(formData.get("treatment_area")),
    clinical_summary: optional(formData.get("clinical_summary")),
    created_by: profile.id
  }).select("id").single();
  if (error) throw new Error(error.message);

  await audit("Treatment Session Created", "treatment_sessions", session.id, { contact_id: contactId });
  await emitDomainEvent({
    organizationId: profile.organizationId,
    eventType: "treatment.session_created",
    entityType: "treatment_session",
    entityId: session.id,
    locationId,
    contactId,
    payload: { treatment_session: { id: session.id, status } }
  });
  revalidatePath(`/contacts/${contactId}`);
  revalidatePath("/clinical");
}

export async function startTreatmentSession(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertClinicalPermission(profile, "clinical.sessions.write");
  const supabase = await createClient();
  const sessionId = required(formData.get("treatment_session_id"), "Treatment session");
  const { data: session } = await supabase.from("treatment_sessions").select("id, contact_id, location_id").eq("id", sessionId).eq("organization_id", profile.organizationId).single();
  if (!session) throw new Error("Treatment session not found");
  assertClinicalLocation(profile, session.location_id);

  const { error } = await supabase.from("treatment_sessions").update({
    status: "in_progress",
    started_at: new Date().toISOString()
  }).eq("id", sessionId).eq("organization_id", profile.organizationId);
  if (error) throw new Error(error.message);

  await audit("Treatment Session Started", "treatment_sessions", sessionId);
  await emitDomainEvent({
    organizationId: profile.organizationId,
    eventType: "treatment.started",
    entityType: "treatment_session",
    entityId: sessionId,
    locationId: session.location_id,
    contactId: session.contact_id,
    payload: { treatment_session: { id: sessionId, status: "in_progress" } }
  });
  revalidatePath(`/clinical/sessions/${sessionId}`);
  revalidatePath(`/contacts/${session.contact_id}`);
}

export async function completeTreatmentSession(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertClinicalPermission(profile, "clinical.sessions.write");
  const supabase = await createClient();
  const sessionId = required(formData.get("treatment_session_id"), "Treatment session");
  const { data: session } = await supabase
    .from("treatment_sessions")
    .select("id, organization_id, location_id, contact_id, package_entitlement_id, service_id, provider_id")
    .eq("id", sessionId)
    .eq("organization_id", profile.organizationId)
    .single();
  if (!session) throw new Error("Treatment session not found");
  assertClinicalLocation(profile, session.location_id);

  const timestamp = new Date().toISOString();
  const { error } = await supabase.from("treatment_sessions").update({
    status: "completed",
    documentation_status: optional(formData.get("documentation_status")) ?? "completed",
    completed_at: timestamp,
    treatment_area: optional(formData.get("treatment_area")),
    clinical_summary: optional(formData.get("clinical_summary")),
    aftercare_plan: optional(formData.get("aftercare_plan")),
    followup_plan: optional(formData.get("followup_plan")),
    documentation_json: {
      treatment_performed: optional(formData.get("treatment_performed")),
      product_device_used: optional(formData.get("product_device_used")),
      lot_reference: optional(formData.get("lot_reference")),
      settings_parameters: optional(formData.get("settings_parameters")),
      amount_quantity: optional(formData.get("amount_quantity")),
      patient_tolerance: optional(formData.get("patient_tolerance")),
      immediate_response: optional(formData.get("immediate_response"))
    }
  }).eq("id", sessionId).eq("organization_id", profile.organizationId);
  if (error) throw new Error(error.message);

  if (session.package_entitlement_id) {
    const { error: eventError } = await supabase.from("treatment_entitlement_events").insert({
      organization_id: profile.organizationId,
      entitlement_id: session.package_entitlement_id,
      treatment_session_id: session.id,
      event_type: "use",
      quantity: 1,
      reason: "Treatment session completed.",
      created_by: profile.id
    });
    if (eventError && !eventError.message.toLowerCase().includes("duplicate")) {
      throw new Error(eventError.message);
    }
  }

  const followupDays = Math.max(numberValue(formData.get("followup_days"), 7), 0);
  if (followupDays > 0) {
    const dueAt = new Date(Date.now() + followupDays * 86_400_000).toISOString();
    await supabase.from("treatment_followups").upsert({
      organization_id: profile.organizationId,
      location_id: session.location_id,
      contact_id: session.contact_id,
      treatment_session_id: session.id,
      provider_id: session.provider_id,
      due_at: dueAt,
      status: "due",
      followup_type: optional(formData.get("followup_type")) ?? "clinical_review",
      notes: optional(formData.get("followup_notes"))
    }, { onConflict: "organization_id,treatment_session_id,followup_type,due_at" });
  }

  await audit("Treatment Session Completed", "treatment_sessions", sessionId, { entitlement_id: session.package_entitlement_id });
  await emitDomainEvent({
    organizationId: profile.organizationId,
    eventType: "treatment.completed",
    entityType: "treatment_session",
    entityId: sessionId,
    locationId: session.location_id,
    contactId: session.contact_id,
    payload: { treatment_session: { id: sessionId, package_entitlement_id: session.package_entitlement_id } }
  });
  revalidatePath(`/clinical/sessions/${sessionId}`);
  revalidatePath(`/contacts/${session.contact_id}`);
  revalidatePath("/clinical");
  revalidatePath("/reports/package-utilization");
}

export async function cancelTreatmentSession(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertClinicalPermission(profile, "clinical.sessions.write");
  const supabase = await createClient();
  const sessionId = required(formData.get("treatment_session_id"), "Treatment session");
  const status = required(formData.get("status"), "Status");
  if (!["cancelled", "no_show"].includes(status)) throw new Error("Only cancelled or no-show statuses are allowed here");
  const { data: session } = await supabase.from("treatment_sessions").select("id, location_id, contact_id").eq("id", sessionId).eq("organization_id", profile.organizationId).single();
  if (!session) throw new Error("Treatment session not found");
  assertClinicalLocation(profile, session.location_id);
  const { error } = await supabase.from("treatment_sessions").update({ status }).eq("id", sessionId).eq("organization_id", profile.organizationId);
  if (error) throw new Error(error.message);
  await audit(status === "cancelled" ? "Treatment Session Cancelled" : "Treatment Session No-Show", "treatment_sessions", sessionId);
  await emitDomainEvent({
    organizationId: profile.organizationId,
    eventType: status === "cancelled" ? "treatment.cancelled" : "treatment.no_show",
    entityType: "treatment_session",
    entityId: sessionId,
    locationId: session.location_id,
    contactId: session.contact_id,
    payload: { treatment_session: { id: sessionId, status } }
  });
  revalidatePath(`/clinical/sessions/${sessionId}`);
  revalidatePath(`/contacts/${session.contact_id}`);
}

export async function createClinicalNote(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertClinicalPermission(profile, "clinical.notes.write");
  const supabase = await createClient();
  const contactId = required(formData.get("contact_id"), "Contact");
  const locationId = optional(formData.get("location_id"));
  assertClinicalLocation(profile, locationId);
  const { data, error } = await supabase.from("clinical_notes").insert({
    organization_id: profile.organizationId,
    location_id: locationId,
    contact_id: contactId,
    treatment_session_id: optional(formData.get("treatment_session_id")),
    treatment_plan_id: optional(formData.get("treatment_plan_id")),
    author_user_id: profile.id,
    note_type: optional(formData.get("note_type")) ?? "general_clinical",
    body: required(formData.get("body"), "Clinical note")
  }).select("id").single();
  if (error) throw new Error(error.message);
  await audit("Clinical Note Created", "clinical_notes", data.id, { contact_id: contactId });
  revalidatePath(`/contacts/${contactId}`);
}

export async function signClinicalNote(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertClinicalPermission(profile, "clinical.notes.sign");
  const supabase = await createClient();
  const noteId = required(formData.get("clinical_note_id"), "Clinical note");
  const timestamp = new Date().toISOString();
  const { data: note, error } = await supabase.from("clinical_notes").update({
    locked_at: timestamp,
    signed_at: timestamp,
    signed_by: profile.id
  }).eq("id", noteId).eq("organization_id", profile.organizationId).select("id, contact_id").single();
  if (error) throw new Error(error.message);
  await audit("Clinical Note Signed", "clinical_notes", noteId);
  revalidatePath(`/contacts/${note.contact_id}`);
}

export async function addClinicalAddendum(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertClinicalPermission(profile, "clinical.notes.write");
  const supabase = await createClient();
  const noteId = required(formData.get("clinical_note_id"), "Clinical note");
  const { data: note } = await supabase.from("clinical_notes").select("id, organization_id, contact_id").eq("id", noteId).eq("organization_id", profile.organizationId).single();
  if (!note) throw new Error("Clinical note not found");
  const { data, error } = await supabase.from("clinical_note_addenda").insert({
    organization_id: profile.organizationId,
    clinical_note_id: note.id,
    author_user_id: profile.id,
    addendum_text: required(formData.get("addendum_text"), "Addendum")
  }).select("id").single();
  if (error) throw new Error(error.message);
  await audit("Clinical Addendum Added", "clinical_note_addenda", data.id, { clinical_note_id: noteId });
  revalidatePath(`/contacts/${note.contact_id}`);
}

export async function signConsentRecord(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertClinicalPermission(profile, "clinical.consents.manage");
  const supabase = await createClient();
  const consentId = required(formData.get("consent_record_id"), "Consent record");
  const { data: consent, error } = await supabase.from("consent_records").update({
    status: "signed",
    signed_by_name: required(formData.get("signed_by_name"), "Signer name"),
    signed_at: new Date().toISOString(),
    signature_reference: optional(formData.get("signature_reference")) ?? "simulated-development-signature",
    simulated_signature: true
  }).eq("id", consentId).eq("organization_id", profile.organizationId).select("id, contact_id, treatment_session_id, location_id").single();
  if (error) throw new Error(error.message);
  await audit("Consent Signed", "consent_records", consentId);
  await emitDomainEvent({
    organizationId: profile.organizationId,
    eventType: "consent.signed",
    entityType: "consent_record",
    entityId: consentId,
    locationId: consent.location_id,
    contactId: consent.contact_id,
    payload: { consent_record: { id: consentId, treatment_session_id: consent.treatment_session_id } }
  });
  revalidatePath(`/contacts/${consent.contact_id}`);
  if (consent.treatment_session_id) revalidatePath(`/clinical/sessions/${consent.treatment_session_id}`);
}

export async function completeTreatmentFollowup(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertClinicalPermission(profile, "clinical.sessions.write");
  const supabase = await createClient();
  const followupId = required(formData.get("followup_id"), "Follow-up");
  const { data, error } = await supabase.from("treatment_followups").update({
    status: "completed",
    completed_at: new Date().toISOString(),
    notes: optional(formData.get("notes"))
  }).eq("id", followupId).eq("organization_id", profile.organizationId).select("id, contact_id, treatment_session_id").single();
  if (error) throw new Error(error.message);
  await audit("Follow-Up Completed", "treatment_followups", followupId);
  revalidatePath("/clinical");
  revalidatePath(`/contacts/${data.contact_id}`);
}

export async function adjustEntitlement(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertClinicalPermission(profile, "clinical.entitlements.adjust");
  const supabase = await createClient();
  const entitlementId = required(formData.get("entitlement_id"), "Entitlement");
  const quantity = numberValue(formData.get("quantity"), 0);
  if (quantity === 0) throw new Error("Adjustment quantity cannot be zero");
  const { data: entitlement } = await supabase.from("package_entitlements").select("id, organization_id, contact_id, location_id").eq("id", entitlementId).eq("organization_id", profile.organizationId).single();
  if (!entitlement) throw new Error("Entitlement not found");
  assertClinicalLocation(profile, entitlement.location_id);
  const { error } = await supabase.from("treatment_entitlement_events").insert({
    organization_id: profile.organizationId,
    entitlement_id: entitlement.id,
    event_type: "adjustment",
    quantity,
    reason: required(formData.get("reason"), "Reason"),
    created_by: profile.id
  });
  if (error) throw new Error(error.message);
  await audit("Entitlement Adjusted", "package_entitlements", entitlementId, { quantity });
  revalidatePath(`/contacts/${entitlement.contact_id}`);
  revalidatePath("/reports/package-utilization");
}

export async function addClinicalPhotoMetadata(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertClinicalPermission(profile, "clinical.photos.write");
  const supabase = await createClient();
  const contactId = required(formData.get("contact_id"), "Contact");
  const locationId = optional(formData.get("location_id"));
  assertClinicalLocation(profile, locationId);
  const { data, error } = await supabase.from("clinical_photos").insert({
    organization_id: profile.organizationId,
    location_id: locationId,
    contact_id: contactId,
    treatment_session_id: optional(formData.get("treatment_session_id")),
    service_id: optional(formData.get("service_id")),
    photo_type: optional(formData.get("photo_type")) ?? "progress",
    body_area: optional(formData.get("body_area")),
    capture_date: required(formData.get("capture_date"), "Capture date"),
    storage_path: required(formData.get("storage_path"), "Private storage path"),
    uploaded_by: profile.id,
    notes: optional(formData.get("notes"))
  }).select("id").single();
  if (error) throw new Error(error.message);
  await audit("Photo Uploaded", "clinical_photos", data.id, { contact_id: contactId });
  revalidatePath(`/contacts/${contactId}`);
}

export async function addClinicalDocumentMetadata(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertClinicalPermission(profile, "clinical.documents.write");
  const supabase = await createClient();
  const contactId = required(formData.get("contact_id"), "Contact");
  const locationId = optional(formData.get("location_id"));
  assertClinicalLocation(profile, locationId);
  const { data, error } = await supabase.from("clinical_documents").insert({
    organization_id: profile.organizationId,
    location_id: locationId,
    contact_id: contactId,
    treatment_session_id: optional(formData.get("treatment_session_id")),
    treatment_plan_id: optional(formData.get("treatment_plan_id")),
    document_type: optional(formData.get("document_type")) ?? "other",
    filename: required(formData.get("filename"), "Filename"),
    storage_path: required(formData.get("storage_path"), "Private storage path"),
    uploaded_by: profile.id,
    description: optional(formData.get("description")),
    sensitive: formData.get("sensitive") !== "off"
  }).select("id").single();
  if (error) throw new Error(error.message);
  await audit("Document Uploaded", "clinical_documents", data.id, { contact_id: contactId });
  revalidatePath(`/contacts/${contactId}`);
}

export async function saveClinicalServiceSetting(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertClinicalPermission(profile, "clinical.templates.manage");
  const supabase = await createClient();
  const id = optional(formData.get("id"));

  const payload = {
    organization_id: profile.organizationId,
    service_id: required(formData.get("service_id"), "Service"),
    requires_clinical_session: formData.get("requires_clinical_session") === "on",
    requires_consent: formData.get("requires_consent") === "on",
    requires_photo_tracking: formData.get("requires_photo_tracking") === "on",
    requires_provider: formData.get("requires_provider") === "on",
    allow_package_entitlement: formData.get("allow_package_entitlement") === "on",
    default_followup_days: numberValue(formData.get("default_followup_days"), 7),
    entitlement_policy: optional(formData.get("entitlement_policy")) ?? "after_successful_payment",
    warning_only_missing_consent: formData.get("warning_only_missing_consent") === "on",
    active: formData.get("active") === "on"
  };

  const query = id
    ? supabase.from("clinical_service_settings").update(payload).eq("id", id).eq("organization_id", profile.organizationId)
    : supabase.from("clinical_service_settings").upsert(payload, { onConflict: "organization_id,service_id" });
  const { error } = await query;
  if (error) throw new Error(error.message);
  await audit("Clinical Service Setting Saved", "clinical_service_settings", id, { service_id: payload.service_id });
  revalidatePath("/settings/clinical/services");
}

export async function saveClinicalTemplate(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertClinicalPermission(profile, "clinical.templates.manage");
  const supabase = await createClient();
  const id = optional(formData.get("id"));
  let schemaJson: unknown = { fields: [] };

  try {
    schemaJson = JSON.parse(required(formData.get("schema_json"), "Template JSON"));
  } catch {
    throw new Error("Template JSON must be valid JSON");
  }

  const payload = {
    organization_id: profile.organizationId,
    service_id: optional(formData.get("service_id")),
    name: required(formData.get("name"), "Template name"),
    template_type: optional(formData.get("template_type")) ?? "treatment_documentation",
    schema_json: schemaJson,
    active: formData.get("active") === "on",
    created_by: profile.id
  };

  const query = id
    ? supabase.from("clinical_templates").update(payload).eq("id", id).eq("organization_id", profile.organizationId)
    : supabase.from("clinical_templates").upsert(payload, { onConflict: "organization_id,service_id,name,template_type" });
  const { error } = await query;
  if (error) throw new Error(error.message);
  await audit("Clinical Template Saved", "clinical_templates", id, { name: payload.name });
  revalidatePath("/settings/clinical/templates");
}

export async function saveConsentTemplate(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertClinicalPermission(profile, "clinical.consents.manage");
  const supabase = await createClient();
  const id = optional(formData.get("id"));
  const payload = {
    organization_id: profile.organizationId,
    service_id: optional(formData.get("service_id")),
    name: required(formData.get("name"), "Consent name"),
    version: Math.max(numberValue(formData.get("version"), 1), 1),
    content_reference: optional(formData.get("content_reference")),
    content_text: optional(formData.get("content_text")),
    consent_type: optional(formData.get("consent_type")) ?? "treatment",
    active: formData.get("active") === "on",
    created_by: profile.id
  };

  const query = id
    ? supabase.from("consent_templates").update(payload).eq("id", id).eq("organization_id", profile.organizationId)
    : supabase.from("consent_templates").upsert(payload, { onConflict: "organization_id,service_id,name,version" });
  const { error } = await query;
  if (error) throw new Error(error.message);
  await audit("Consent Template Saved", "consent_templates", id, { name: payload.name });
  revalidatePath("/settings/clinical/consents");
}
