import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentProfile } from "@/lib/auth/profile";
import { formatMoney } from "@/lib/financial/money";

type CountQuery = PromiseLike<{ count: number | null; error: { message: string } | null }>;
type Relation<T> = T | T[] | null;
type PaymentRow = { amount_cents: number | null; status: string | null };
export type MobileTaskRow = { id: string; title: string; status: string; due_at: string | null; contacts: Relation<{ first_name: string; last_name: string }> };
export type MobileAppointmentRow = { id: string; start_at: string; status: string; contacts: Relation<{ first_name: string; last_name: string }>; appointment_types: Relation<{ name: string }> };
export type MobileCallRow = { id: string; started_at: string | null; direction: string; status: string; disposition: string | null; contacts: Relation<{ first_name: string; last_name: string }> };
export type MobileNotificationRow = { id: string; title: string; body_safe: string; status: string; deep_link: string | null; created_at: string };
export type MobileSessionRow = { id: string; status: string; session_date: string | null; contacts: Relation<{ first_name: string; last_name: string }>; services: Relation<{ name: string }> };
export type MobileConsentRow = { id: string; status: string; contacts: Relation<{ first_name: string; last_name: string }>; consent_templates: Relation<{ name: string }> };
export type MobileInventoryAlertRow = { id: string; alert_type: string; status: string; message: string };

function first<T>(value: Relation<T> | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function count(query: CountQuery) {
  const result = await query;
  if (result.error) throw new Error(result.error.message);
  return result.count ?? 0;
}

function applyLocations<T>(query: T, locationIds: string[]): T {
  return locationIds.length > 0 ? (query as T & { in: (column: string, values: string[]) => T }).in("location_id", locationIds) : query;
}

export async function getMobileHomeReport(supabase: SupabaseClient, profile: CurrentProfile, locationIds: string[]) {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const tomorrow = new Date(todayStart);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [
    todayAppointments,
    openTasks,
    unreadConversations,
    missedCalls,
    newLeads,
    hotOpportunities,
    payments,
    tasksResult,
    appointmentsResult,
    callsResult,
    notificationsResult
  ] = await Promise.all([
    count(applyLocations(supabase.from("appointments").select("*", { count: "exact", head: true }).eq("organization_id", profile.organizationId).gte("start_at", todayStart.toISOString()).lt("start_at", tomorrow.toISOString()), locationIds)),
    count(applyLocations(supabase.from("tasks").select("*", { count: "exact", head: true }).eq("organization_id", profile.organizationId).in("status", ["open", "in_progress"]), locationIds)),
    count(applyLocations(supabase.from("messages").select("*", { count: "exact", head: true }).eq("organization_id", profile.organizationId).eq("direction", "inbound").is("read_at", null), locationIds)),
    count(applyLocations(supabase.from("calls").select("*", { count: "exact", head: true }).eq("organization_id", profile.organizationId).eq("status", "missed"), locationIds)),
    count(applyLocations(supabase.from("contacts").select("*", { count: "exact", head: true }).eq("organization_id", profile.organizationId).eq("status", "new_lead").gte("created_at", monthStart), locationIds)),
    count(applyLocations(supabase.from("opportunities").select("*", { count: "exact", head: true }).eq("organization_id", profile.organizationId).in("status", ["open", "proposal_sent"]), locationIds)),
    applyLocations(supabase.from("payments").select("amount_cents, status").eq("organization_id", profile.organizationId).gte("received_at", monthStart).limit(1000), locationIds),
    applyLocations(supabase.from("tasks").select("id, title, status, due_at, contacts(first_name, last_name)").eq("organization_id", profile.organizationId).in("status", ["open", "in_progress"]).order("due_at", { ascending: true }).limit(8), locationIds),
    applyLocations(supabase.from("appointments").select("id, start_at, status, contacts(first_name, last_name), appointment_types(name), provider:user_profiles!appointments_provider_id_fkey(full_name)").eq("organization_id", profile.organizationId).gte("start_at", todayStart.toISOString()).lt("start_at", tomorrow.toISOString()).order("start_at").limit(8), locationIds),
    applyLocations(supabase.from("calls").select("id, started_at, direction, status, disposition, contacts(first_name, last_name)").eq("organization_id", profile.organizationId).order("started_at", { ascending: false }).limit(6), locationIds),
    supabase.from("mobile_notifications").select("id, title, body_safe, status, deep_link, created_at").eq("organization_id", profile.organizationId).eq("user_id", profile.id).order("created_at", { ascending: false }).limit(5)
  ]);

  const paymentRows = (payments.data ?? []) as PaymentRow[];
  const collectedCents = paymentRows.filter((payment) => payment.status === "succeeded").reduce((sum: number, payment: PaymentRow) => sum + Number(payment.amount_cents ?? 0), 0);

  return {
    metrics: [
      { label: "Today", value: String(todayAppointments), detail: "Appointments" },
      { label: "Tasks", value: String(openTasks), detail: "Open work" },
      { label: "Messages", value: String(unreadConversations), detail: "Unread inbound" },
      { label: "Missed Calls", value: String(missedCalls), detail: "Need callback" },
      { label: "Leads", value: String(newLeads), detail: "New this month" },
      { label: "Pipeline", value: String(hotOpportunities), detail: "Open opportunities" },
      { label: "MTD Cash", value: formatMoney(collectedCents), detail: "Succeeded payments" }
    ],
    tasks: (tasksResult.data ?? []) as MobileTaskRow[],
    appointments: (appointmentsResult.data ?? []) as MobileAppointmentRow[],
    calls: (callsResult.data ?? []) as MobileCallRow[],
    notifications: (notificationsResult.data ?? []) as MobileNotificationRow[]
  };
}

export async function getMobileContacts(supabase: SupabaseClient, profile: CurrentProfile, locationIds: string[], search: string | null) {
  let query = supabase
    .from("contacts")
    .select("id, first_name, last_name, phone, email, status, last_activity_at, locations(name)")
    .eq("organization_id", profile.organizationId)
    .order("last_activity_at", { ascending: false })
    .limit(40);
  if (locationIds.length > 0) query = query.in("location_id", locationIds);
  if (search) query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((contact) => ({ ...contact, locationName: first(contact.locations)?.name ?? "No location" }));
}

export async function getMobileProviderReport(supabase: SupabaseClient, profile: CurrentProfile, locationIds: string[]) {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const tomorrow = new Date(todayStart);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [appointments, sessions, consents, alerts] = await Promise.all([
    applyLocations(supabase.from("appointments").select("id, start_at, status, contacts(first_name, last_name), appointment_types(name)").eq("organization_id", profile.organizationId).eq("provider_id", profile.id).gte("start_at", todayStart.toISOString()).lt("start_at", tomorrow.toISOString()).order("start_at"), locationIds),
    applyLocations(supabase.from("treatment_sessions").select("id, status, session_date, contacts(first_name, last_name), services(name)").eq("organization_id", profile.organizationId).eq("provider_id", profile.id).order("session_date", { ascending: false }).limit(8), locationIds),
    applyLocations(supabase.from("consent_records").select("id, status, contacts(first_name, last_name), consent_templates(name)").eq("organization_id", profile.organizationId).in("status", ["sent", "viewed"]).limit(8), locationIds),
    applyLocations(supabase.from("inventory_alerts").select("id, alert_type, status, message").eq("organization_id", profile.organizationId).eq("status", "open").limit(6), locationIds)
  ]);

  return {
    appointments: (appointments.data ?? []) as MobileAppointmentRow[],
    sessions: (sessions.data ?? []) as MobileSessionRow[],
    consents: (consents.data ?? []) as MobileConsentRow[],
    inventoryAlerts: (alerts.data ?? []) as MobileInventoryAlertRow[]
  };
}

export async function getNotificationCenter(supabase: SupabaseClient, profile: CurrentProfile) {
  const { data, error } = await supabase
    .from("mobile_notifications")
    .select("id, notification_type, title, body_safe, status, deep_link, created_at")
    .eq("organization_id", profile.organizationId)
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<MobileNotificationRow & { notification_type: string }>;
}
