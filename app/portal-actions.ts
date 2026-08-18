"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { requireCurrentPatient } from "@/lib/portal/patient";
import { hasPortalPermission } from "@/lib/portal/permissions";
import { buildPaymentPlanSchedule } from "@/lib/portal/payment-plans";
import { dollarsToCents } from "@/lib/financial/money";
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

function checked(value: FormDataEntryValue | null) {
  return String(value ?? "") === "on" || String(value ?? "") === "true";
}

async function staffAudit(action: string, entityTable: string, entityId: string | null, metadata: Record<string, unknown> = {}) {
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

function assertStaffPortalPermission(permission: string) {
  return async () => {
    const profile = await requireCurrentProfile();
    if (!hasPortalPermission(profile, permission)) {
      throw new Error("You do not have permission for this portal action");
    }
    return profile;
  };
}

export async function updatePatientPortalProfile(formData: FormData) {
  await requireCurrentPatient();
  const supabase = await createClient();

  const { error } = await supabase.rpc("update_patient_safe_profile", {
    p_first_name: required(formData.get("first_name"), "First name"),
    p_last_name: required(formData.get("last_name"), "Last name"),
    p_phone: optional(formData.get("phone")),
    p_sms_reminders: checked(formData.get("sms_reminders")),
    p_email_reminders: checked(formData.get("email_reminders")),
    p_billing_notifications: checked(formData.get("billing_notifications"))
  });

  if (error) throw new Error(error.message);

  revalidatePath("/portal");
  revalidatePath("/portal/profile");
}

export async function requestPortalAppointmentChange(formData: FormData) {
  const patient = await requireCurrentPatient();
  const supabase = await createClient();
  const appointmentId = required(formData.get("appointment_id"), "Appointment");

  const { data: appointment, error: appointmentError } = await supabase
    .from("appointments")
    .select("id, organization_id, contact_id")
    .eq("id", appointmentId)
    .eq("contact_id", patient.contactId)
    .single();

  if (appointmentError || !appointment) {
    throw new Error(appointmentError?.message ?? "Appointment was not found");
  }

  const { data, error } = await supabase
    .from("portal_appointment_requests")
    .insert({
      organization_id: patient.organizationId,
      contact_id: patient.contactId,
      appointment_id: appointment.id,
      request_type: required(formData.get("request_type"), "Request type"),
      requested_start_at: optional(formData.get("requested_start_at")),
      reason: optional(formData.get("reason"))
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  await emitDomainEvent({
    organizationId: patient.organizationId,
    eventType: required(formData.get("request_type"), "Request type") === "cancel" ? "portal.appointment_cancel_requested" : "portal.appointment_reschedule_requested",
    entityType: "portal_appointment_request",
    entityId: data.id,
    contactId: patient.contactId,
    appointmentId: appointment.id,
    payload: { portal_request_id: data.id }
  });

  revalidatePath("/portal/appointments");
}

export async function signPortalConsent(formData: FormData) {
  await requireCurrentPatient();
  const supabase = await createClient();
  const consentId = required(formData.get("consent_id"), "Consent");

  const { error } = await supabase.rpc("sign_patient_consent", {
    target_consent_id: consentId,
    signer_name: required(formData.get("signer_name"), "Signer name")
  });

  if (error) throw new Error(error.message);

  revalidatePath("/portal");
  revalidatePath("/portal/consents");
}

export async function simulatePortalBalancePayment(formData: FormData) {
  await requireCurrentPatient();
  const supabase = await createClient();
  const amountCents = dollarsToCents(required(formData.get("amount"), "Amount"));

  const { error } = await supabase.rpc("record_patient_simulated_payment", {
    target_sale_id: required(formData.get("sale_id"), "Sale"),
    p_amount_cents: amountCents
  });

  if (error) throw new Error(error.message);

  revalidatePath("/portal");
  revalidatePath("/portal/payments");
}

export async function markPortalNotification(formData: FormData) {
  const patient = await requireCurrentPatient();
  const supabase = await createClient();
  const status = required(formData.get("status"), "Status");

  const { error } = await supabase
    .from("patient_notifications")
    .update({ status, read_at: status === "read" ? new Date().toISOString() : null })
    .eq("id", required(formData.get("notification_id"), "Notification"))
    .eq("contact_id", patient.contactId);

  if (error) throw new Error(error.message);
  revalidatePath("/portal");
}

export async function invitePatientToPortal(formData: FormData) {
  const profile = await assertStaffPortalPermission("portal.manage")();
  const supabase = await createClient();
  const contactId = required(formData.get("contact_id"), "Contact");

  const { data, error } = await supabase
    .from("patient_accounts")
    .upsert({
      organization_id: profile.organizationId,
      contact_id: contactId,
      status: "invited",
      invited_at: new Date().toISOString()
    }, { onConflict: "organization_id,contact_id" })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  await staffAudit("Portal Invite Sent", "patient_accounts", data.id, { contact_id: contactId, simulated: true });
  await emitDomainEvent({
    organizationId: profile.organizationId,
    eventType: "portal.invited",
    entityType: "patient_account",
    entityId: data.id,
    contactId,
    payload: { simulated: true }
  });
  revalidatePath(`/contacts/${contactId}`);
}

export async function disablePatientPortal(formData: FormData) {
  const profile = await assertStaffPortalPermission("portal.manage")();
  const supabase = await createClient();
  const accountId = required(formData.get("patient_account_id"), "Portal account");
  const contactId = required(formData.get("contact_id"), "Contact");

  const { error } = await supabase
    .from("patient_accounts")
    .update({ status: "disabled" })
    .eq("id", accountId)
    .eq("organization_id", profile.organizationId);

  if (error) throw new Error(error.message);

  await staffAudit("Portal Disabled", "patient_accounts", accountId, { contact_id: contactId });
  revalidatePath(`/contacts/${contactId}`);
}

export async function upsertPortalSettings(formData: FormData) {
  const profile = await assertStaffPortalPermission("portal.settings.manage")();
  const supabase = await createClient();

  const { error } = await supabase.from("portal_settings").upsert({
    organization_id: profile.organizationId,
    portal_enabled: checked(formData.get("portal_enabled")),
    brand_name: required(formData.get("brand_name"), "Brand name"),
    support_email: optional(formData.get("support_email")),
    support_phone: optional(formData.get("support_phone")),
    reschedule_minimum_notice_hours: Number(required(formData.get("reschedule_minimum_notice_hours"), "Reschedule notice")),
    cancellation_minimum_notice_hours: Number(required(formData.get("cancellation_minimum_notice_hours"), "Cancellation notice")),
    allow_balance_payments: checked(formData.get("allow_balance_payments")),
    allow_memberships: checked(formData.get("allow_memberships")),
    allow_payment_plans: checked(formData.get("allow_payment_plans")),
    development_mode: checked(formData.get("development_mode"))
  }, { onConflict: "organization_id" });

  if (error) throw new Error(error.message);

  await staffAudit("Portal Settings Updated", "portal_settings", null);
  revalidatePath("/settings/portal");
}

export async function upsertMembershipPlan(formData: FormData) {
  const profile = await assertStaffPortalPermission("memberships.manage")();
  const supabase = await createClient();
  const benefits = String(formData.get("included_benefits_json") ?? "[]");

  const payload = {
    id: optional(formData.get("membership_plan_id")) ?? undefined,
    organization_id: profile.organizationId,
    name: required(formData.get("name"), "Plan name"),
    description: optional(formData.get("description")),
    billing_interval: required(formData.get("billing_interval"), "Billing interval"),
    price_cents: dollarsToCents(required(formData.get("price"), "Price")),
    currency: "USD",
    active: checked(formData.get("active")),
    stripe_price_id: optional(formData.get("stripe_price_id")),
    included_benefits_json: JSON.parse(benefits)
  };

  const { data, error } = await supabase.from("membership_plans").upsert(payload).select("id").single();
  if (error) throw new Error(error.message);

  await staffAudit("Membership Plan Saved", "membership_plans", data.id);
  revalidatePath("/settings/memberships");
  revalidatePath("/portal/memberships");
}

export async function enrollPatientMembership(formData: FormData) {
  const profile = await assertStaffPortalPermission("memberships.manage")();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("patient_memberships")
    .insert({
      organization_id: profile.organizationId,
      contact_id: required(formData.get("contact_id"), "Contact"),
      membership_plan_id: required(formData.get("membership_plan_id"), "Membership plan"),
      status: required(formData.get("status"), "Status"),
      start_date: required(formData.get("start_date"), "Start date"),
      next_billing_date: optional(formData.get("next_billing_date")),
      billing_status: "simulated",
      metadata: { demo: true }
    })
    .select("id, contact_id")
    .single();

  if (error) throw new Error(error.message);

  await staffAudit("Membership Enrolled", "patient_memberships", data.id, { contact_id: data.contact_id, simulated: true });
  await emitDomainEvent({
    organizationId: profile.organizationId,
    eventType: "membership.started",
    entityType: "patient_membership",
    entityId: data.id,
    contactId: data.contact_id,
    payload: { simulated: true }
  });
  revalidatePath(`/contacts/${data.contact_id}`);
  revalidatePath("/settings/memberships");
}

export async function createPatientPaymentPlan(formData: FormData) {
  const profile = await assertStaffPortalPermission("payment_plans.manage")();
  const supabase = await createClient();
  const saleId = required(formData.get("sale_id"), "Sale");
  const totalAmountCents = dollarsToCents(required(formData.get("total_amount"), "Total amount"));
  const downPaymentCents = dollarsToCents(optional(formData.get("down_payment")) ?? "0");
  const installmentCount = Number(required(formData.get("installment_count"), "Installment count"));
  const frequency = required(formData.get("frequency"), "Frequency") as "weekly" | "biweekly" | "monthly" | "custom";
  const startDate = required(formData.get("start_date"), "Start date");

  const { data: sale, error: saleError } = await supabase
    .from("sales")
    .select("id, organization_id, contact_id, location_id")
    .eq("id", saleId)
    .eq("organization_id", profile.organizationId)
    .single();

  if (saleError || !sale) throw new Error(saleError?.message ?? "Sale was not found");

  const schedule = buildPaymentPlanSchedule({ totalAmountCents, downPaymentCents, installmentCount, frequency, startDate });
  const { data: plan, error } = await supabase
    .from("payment_plans")
    .insert({
      organization_id: profile.organizationId,
      contact_id: sale.contact_id,
      sale_id: sale.id,
      total_amount_cents: totalAmountCents,
      down_payment_cents: downPaymentCents,
      installment_amount_cents: schedule[0]?.amountCents ?? 0,
      installment_count: schedule.length,
      frequency,
      status: "active",
      start_date: startDate,
      next_due_date: schedule[0]?.dueDate,
      provider: "simulated",
      created_by: profile.id,
      metadata: { demo: true }
    })
    .select("id, contact_id")
    .single();

  if (error) throw new Error(error.message);

  const { error: installmentError } = await supabase.from("payment_plan_installments").insert(
    schedule.map((item) => ({
      payment_plan_id: plan.id,
      installment_number: item.installmentNumber,
      due_date: item.dueDate,
      amount_cents: item.amountCents,
      status: item.installmentNumber === 1 ? "due" : "scheduled"
    }))
  );

  if (installmentError) throw new Error(installmentError.message);

  await staffAudit("Payment Plan Created", "payment_plans", plan.id, { contact_id: plan.contact_id, sale_id: sale.id, simulated: true });
  await emitDomainEvent({
    organizationId: profile.organizationId,
    eventType: "payment_plan.created",
    entityType: "payment_plan",
    entityId: plan.id,
    contactId: plan.contact_id,
    saleId: sale.id,
    payload: { simulated: true, installment_count: schedule.length }
  });
  revalidatePath(`/contacts/${plan.contact_id}`);
  revalidatePath("/payments");
}
