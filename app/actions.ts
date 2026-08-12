"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { locationCookieName } from "@/lib/crm/location";
import { toDbStatus } from "@/lib/crm/constants";
import { emitDomainEvent } from "@/lib/workflows/server-events";

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

function optionalNumberCents(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) {
    return 0;
  }

  return Math.round(Number(text.replace(/[$,]/g, "")) * 100);
}

function ensureAllowedLocation(locationId: string | null, allowedIds: string[]) {
  if (!locationId) {
    return null;
  }

  if (!allowedIds.includes(locationId)) {
    throw new Error("Selected location is not available for this user");
  }

  return locationId;
}

async function writeAudit(
  action: string,
  entityTable: string,
  entityId: string | null,
  metadata: Record<string, unknown> = {}
) {
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

export async function updateSelectedLocation(formData: FormData) {
  const profile = await requireCurrentProfile();
  const requestedLocationId = String(formData.get("location_id") ?? "all");
  const locationId =
    requestedLocationId !== "all" &&
    profile.locations.some((location) => location.id === requestedLocationId)
      ? requestedLocationId
      : "all";
  const cookieStore = await cookies();

  cookieStore.set(locationCookieName, locationId, {
    path: "/",
    sameSite: "lax"
  });

  revalidatePath("/");
}

export async function createContact(formData: FormData) {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const locationId = ensureAllowedLocation(optional(formData.get("location_id")), profile.locations.map((item) => item.id));
  const notes = optional(formData.get("notes"));

  const { data, error } = await supabase
    .from("contacts")
    .insert({
      organization_id: profile.organizationId,
      location_id: locationId,
      assigned_to: optional(formData.get("assigned_to")),
      first_name: required(formData.get("first_name"), "First name"),
      last_name: required(formData.get("last_name"), "Last name"),
      phone: optional(formData.get("phone")),
      email: optional(formData.get("email")),
      lead_source: optional(formData.get("lead_source")),
      status: toDbStatus(required(formData.get("status"), "Status")),
      lifetime_value_cents: optionalNumberCents(formData.get("lifetime_value")),
      last_activity_at: new Date().toISOString()
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (notes) {
    await supabase.from("contact_notes").insert({
      organization_id: profile.organizationId,
      contact_id: data.id,
      author_id: profile.id,
      body: notes
    });
  }

  await writeAudit("Contact Created", "contacts", data.id, { location_id: locationId });
  await emitDomainEvent({
    organizationId: profile.organizationId,
    eventType: "contact.created",
    entityType: "contact",
    entityId: data.id,
    locationId,
    contactId: data.id,
    payload: { contact: { id: data.id, location_id: locationId, status: toDbStatus(required(formData.get("status"), "Status")), lead_source: optional(formData.get("lead_source")) } }
  });
  revalidatePath("/contacts");
  revalidatePath("/dashboard");
}

export async function updateContact(formData: FormData) {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const contactId = required(formData.get("contact_id"), "Contact");
  const locationId = ensureAllowedLocation(optional(formData.get("location_id")), profile.locations.map((item) => item.id));

  const newStatus = toDbStatus(required(formData.get("status"), "Status"));
  const { error } = await supabase
    .from("contacts")
    .update({
      location_id: locationId,
      assigned_to: optional(formData.get("assigned_to")),
      first_name: required(formData.get("first_name"), "First name"),
      last_name: required(formData.get("last_name"), "Last name"),
      phone: optional(formData.get("phone")),
      email: optional(formData.get("email")),
      lead_source: optional(formData.get("lead_source")),
      status: newStatus,
      last_activity_at: new Date().toISOString()
    })
    .eq("id", contactId)
    .eq("organization_id", profile.organizationId);

  if (error) {
    throw new Error(error.message);
  }

  await writeAudit("Contact Updated", "contacts", contactId);
  await emitDomainEvent({
    organizationId: profile.organizationId,
    eventType: "contact.updated",
    entityType: "contact",
    entityId: contactId,
    locationId,
    contactId,
    payload: { contact: { id: contactId, location_id: locationId, status: newStatus } }
  });
  await emitDomainEvent({
    organizationId: profile.organizationId,
    eventType: "contact.status_changed",
    entityType: "contact",
    entityId: contactId,
    locationId,
    contactId,
    payload: { contact: { id: contactId, status: newStatus } }
  });
  revalidatePath("/contacts");
  revalidatePath(`/contacts/${contactId}`);
}

export async function createContactNote(formData: FormData) {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const contactId = required(formData.get("contact_id"), "Contact");

  const { data, error } = await supabase
    .from("contact_notes")
    .insert({
      organization_id: profile.organizationId,
      contact_id: contactId,
      author_id: profile.id,
      body: required(formData.get("body"), "Note")
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await supabase
    .from("contacts")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", contactId)
    .eq("organization_id", profile.organizationId);

  await writeAudit("Note Added", "contact_notes", data.id, { contact_id: contactId });
  revalidatePath(`/contacts/${contactId}`);
}

export async function createOpportunity(formData: FormData) {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const locationId = ensureAllowedLocation(optional(formData.get("location_id")), profile.locations.map((item) => item.id));

  const { data, error } = await supabase
    .from("opportunities")
    .insert({
      organization_id: profile.organizationId,
      location_id: locationId,
      contact_id: required(formData.get("contact_id"), "Contact"),
      pipeline_id: required(formData.get("pipeline_id"), "Pipeline"),
      stage_id: required(formData.get("stage_id"), "Stage"),
      assigned_to: optional(formData.get("assigned_to")),
      name: required(formData.get("name"), "Opportunity name"),
      value_cents: optionalNumberCents(formData.get("value")),
      status: optional(formData.get("status")) ?? "open",
      last_activity_at: new Date().toISOString()
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await writeAudit("Opportunity Created", "opportunities", data.id, { location_id: locationId });
  await emitDomainEvent({
    organizationId: profile.organizationId,
    eventType: "opportunity.created",
    entityType: "opportunity",
    entityId: data.id,
    locationId,
    contactId: required(formData.get("contact_id"), "Contact"),
    opportunityId: data.id,
    payload: { opportunity: { id: data.id, location_id: locationId, stage_id: required(formData.get("stage_id"), "Stage") } }
  });
  revalidatePath("/opportunities");
  revalidatePath("/dashboard");
}

export async function moveOpportunityStage(formData: FormData) {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const opportunityId = required(formData.get("opportunity_id"), "Opportunity");
  const stageId = required(formData.get("stage_id"), "Stage");

  const { error } = await supabase
    .from("opportunities")
    .update({
      stage_id: stageId,
      last_activity_at: new Date().toISOString()
    })
    .eq("id", opportunityId)
    .eq("organization_id", profile.organizationId);

  if (error) {
    throw new Error(error.message);
  }

  await writeAudit("Opportunity Stage Changed", "opportunities", opportunityId, { stage_id: stageId });
  await emitDomainEvent({
    organizationId: profile.organizationId,
    eventType: "opportunity.stage_changed",
    entityType: "opportunity",
    entityId: opportunityId,
    opportunityId,
    payload: { opportunity: { id: opportunityId, stage_id: stageId } }
  });
  revalidatePath("/opportunities");
  revalidatePath("/dashboard");
}

export async function createAppointment(formData: FormData) {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const locationId = ensureAllowedLocation(required(formData.get("location_id"), "Location"), profile.locations.map((item) => item.id));
  const start = new Date(`${required(formData.get("date"), "Date")}T${required(formData.get("start_time"), "Start time")}`);
  const duration = Number(required(formData.get("duration_minutes"), "Duration"));
  const end = new Date(start.getTime() + duration * 60_000);
  const providerId = optional(formData.get("provider_id"));

  if (Number.isNaN(start.getTime()) || duration <= 0) {
    throw new Error("Choose a valid appointment time");
  }

  if (providerId) {
    const { data: conflicts, error: conflictError } = await supabase
      .from("appointments")
      .select("id")
      .eq("provider_id", providerId)
      .not("status", "in", "(cancelled,no_show)")
      .lt("start_at", end.toISOString())
      .gt("end_at", start.toISOString());

    if (conflictError) {
      throw new Error(conflictError.message);
    }

    if (conflicts && conflicts.length > 0) {
      throw new Error("Provider already has an appointment at that time");
    }
  }

  const { data, error } = await supabase
    .from("appointments")
    .insert({
      organization_id: profile.organizationId,
      location_id: locationId,
      contact_id: required(formData.get("contact_id"), "Contact"),
      provider_id: providerId,
      appointment_type_id: required(formData.get("appointment_type_id"), "Appointment type"),
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      status: toDbStatus(required(formData.get("status"), "Status")),
      notes: optional(formData.get("notes")),
      created_by: profile.id
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await writeAudit("Appointment Created", "appointments", data.id, { location_id: locationId });
  await emitDomainEvent({
    organizationId: profile.organizationId,
    eventType: "appointment.created",
    entityType: "appointment",
    entityId: data.id,
    locationId,
    contactId: required(formData.get("contact_id"), "Contact"),
    appointmentId: data.id,
    payload: { appointment: { id: data.id, location_id: locationId, status: toDbStatus(required(formData.get("status"), "Status")), start_at: start.toISOString() } }
  });
  revalidatePath("/calendar");
}

export async function updateAppointmentStatus(formData: FormData) {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const appointmentId = required(formData.get("appointment_id"), "Appointment");
  const status = required(formData.get("status"), "Status");

  const { error } = await supabase
    .from("appointments")
    .update({ status: toDbStatus(status) })
    .eq("id", appointmentId)
    .eq("organization_id", profile.organizationId);

  if (error) {
    throw new Error(error.message);
  }

  await writeAudit(status === "Cancelled" ? "Appointment Cancelled" : "Appointment Updated", "appointments", appointmentId, { status });
  await emitDomainEvent({
    organizationId: profile.organizationId,
    eventType: status === "No Show" ? "appointment.no_show" : status === "Cancelled" ? "appointment.cancelled" : status === "Completed" ? "appointment.completed" : status === "Checked In" ? "appointment.checked_in" : status === "Confirmed" ? "appointment.confirmed" : "appointment.rescheduled",
    entityType: "appointment",
    entityId: appointmentId,
    appointmentId,
    payload: { appointment: { id: appointmentId, status: toDbStatus(status) } }
  });
  revalidatePath("/calendar");
}

export async function createTask(formData: FormData) {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const locationId = ensureAllowedLocation(optional(formData.get("location_id")), profile.locations.map((item) => item.id));

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      organization_id: profile.organizationId,
      location_id: locationId,
      contact_id: optional(formData.get("contact_id")),
      opportunity_id: optional(formData.get("opportunity_id")),
      assigned_to: optional(formData.get("assigned_to")),
      title: required(formData.get("title"), "Task title"),
      status: toDbStatus(required(formData.get("status"), "Status")),
      due_at: optional(formData.get("due_at"))
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await writeAudit("Task Created", "tasks", data.id, { location_id: locationId });
  await emitDomainEvent({
    organizationId: profile.organizationId,
    eventType: "task.created",
    entityType: "task",
    entityId: data.id,
    locationId,
    contactId: optional(formData.get("contact_id")),
    opportunityId: optional(formData.get("opportunity_id")),
    payload: { task: { id: data.id, title: required(formData.get("title"), "Task title") } }
  });
  revalidatePath("/dashboard");
  revalidatePath("/contacts");
}

export async function updateTaskStatus(formData: FormData) {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const taskId = required(formData.get("task_id"), "Task");
  const status = required(formData.get("status"), "Status");

  const { error } = await supabase
    .from("tasks")
    .update({ status: toDbStatus(status) })
    .eq("id", taskId)
    .eq("organization_id", profile.organizationId);

  if (error) {
    throw new Error(error.message);
  }

  await writeAudit(status === "Completed" ? "Task Completed" : "Task Updated", "tasks", taskId, { status });
  if (status === "Completed") {
    await emitDomainEvent({
      organizationId: profile.organizationId,
      eventType: "task.completed",
      entityType: "task",
      entityId: taskId,
      payload: { task: { id: taskId, status: toDbStatus(status) } }
    });
  }
  revalidatePath("/dashboard");
  revalidatePath("/contacts");
}
