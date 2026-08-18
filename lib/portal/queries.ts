import { createClient } from "@/lib/supabase/server";
import type { CurrentPatient } from "./patient";

export async function getPortalDashboardData(patient: CurrentPatient) {
  const supabase = await createClient();
  const now = new Date().toISOString();

  const [
    { data: upcomingAppointments },
    { data: pastAppointments },
    { data: sales },
    { data: payments },
    { data: refunds },
    { data: entitlements },
    { data: treatmentSessions },
    { data: consentRecords },
    { data: documents },
    { data: memberships },
    { data: benefitEvents },
    { data: paymentPlans },
    { data: installments },
    { data: notifications },
    { data: appointmentRequests }
  ] = await Promise.all([
    supabase.from("appointments").select("id, start_at, end_at, status, appointment_types(name), locations(name), provider:user_profiles!appointments_provider_id_fkey(full_name)").eq("contact_id", patient.contactId).gte("start_at", now).order("start_at").limit(20),
    supabase.from("appointments").select("id, start_at, end_at, status, appointment_types(name), locations(name), provider:user_profiles!appointments_provider_id_fkey(full_name)").eq("contact_id", patient.contactId).lt("start_at", now).order("start_at", { ascending: false }).limit(30),
    supabase.from("sales").select("id, sale_date, status, total_amount_cents, paid_amount_cents, refunded_amount_cents, balance_due_cents, currency, sale_items(description)").eq("contact_id", patient.contactId).order("sale_date", { ascending: false }),
    supabase.from("payments").select("id, sale_id, amount_cents, currency, payment_method, payment_provider, payment_purpose, status, received_at, simulated").eq("contact_id", patient.contactId).order("received_at", { ascending: false }).limit(50),
    supabase.from("refunds").select("id, sale_id, payment_id, amount_cents, status, refunded_at, reason").eq("contact_id", patient.contactId).order("refunded_at", { ascending: false }).limit(30),
    supabase.from("package_entitlements").select("id, total_quantity, used_quantity, remaining_quantity, status, purchased_at, expires_at, services(name), packages(name), locations(name)").eq("contact_id", patient.contactId).order("created_at", { ascending: false }),
    supabase.from("treatment_sessions").select("id, status, scheduled_at, completed_at, session_number, treatment_area, clinical_summary, services(name), locations(name)").eq("contact_id", patient.contactId).order("scheduled_at", { ascending: false }).limit(30),
    supabase.from("consent_records").select("id, status, signed_by_name, signed_at, consent_template_version, consent_templates(name, version, consent_type, content_text)").eq("contact_id", patient.contactId).order("created_at", { ascending: false }),
    supabase.from("clinical_documents").select("id, document_type, filename, uploaded_at, portal_description, description").eq("contact_id", patient.contactId).eq("patient_visible", true).eq("status", "active").order("uploaded_at", { ascending: false }),
    supabase.from("patient_memberships").select("id, status, start_date, end_date, next_billing_date, billing_status, cancel_at_period_end, membership_plans(name, description, billing_interval, price_cents, currency, included_benefits_json)").eq("contact_id", patient.contactId).order("created_at", { ascending: false }),
    supabase.from("membership_benefit_events").select("id, patient_membership_id, benefit_key, event_type, quantity, balance_after, reason, created_at").eq("contact_id", patient.contactId).order("created_at", { ascending: false }),
    supabase.from("payment_plans").select("id, sale_id, total_amount_cents, down_payment_cents, installment_amount_cents, installment_count, frequency, status, start_date, next_due_date, provider").eq("contact_id", patient.contactId).order("created_at", { ascending: false }),
    supabase.from("payment_plan_installments").select("id, payment_plan_id, installment_number, due_date, amount_cents, status, paid_at").order("due_date"),
    supabase.from("patient_notifications").select("id, type, title, body, status, action_url, created_at").eq("contact_id", patient.contactId).order("created_at", { ascending: false }).limit(20),
    supabase.from("portal_appointment_requests").select("id, appointment_id, request_type, requested_start_at, reason, status, created_at, resolution_notes").eq("contact_id", patient.contactId).order("created_at", { ascending: false }).limit(20)
  ]);

  const ownPlanIds = new Set((paymentPlans ?? []).map((plan) => plan.id));

  return {
    upcomingAppointments: upcomingAppointments ?? [],
    pastAppointments: pastAppointments ?? [],
    sales: sales ?? [],
    payments: payments ?? [],
    refunds: refunds ?? [],
    entitlements: entitlements ?? [],
    treatmentSessions: treatmentSessions ?? [],
    consentRecords: consentRecords ?? [],
    documents: documents ?? [],
    memberships: memberships ?? [],
    benefitEvents: benefitEvents ?? [],
    paymentPlans: paymentPlans ?? [],
    installments: (installments ?? []).filter((installment) => ownPlanIds.has(installment.payment_plan_id)),
    notifications: notifications ?? [],
    appointmentRequests: appointmentRequests ?? []
  };
}
