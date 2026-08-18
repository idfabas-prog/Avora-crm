import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { APP_DISPLAY_NAME } from "@/lib/config/branding";

export type CurrentPatient = {
  accountId: string;
  organizationId: string;
  contactId: string;
  organizationName: string;
  fullName: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  locationName: string | null;
  smsRemindersEnabled: boolean;
  emailRemindersEnabled: boolean;
  billingNotificationsEnabled: boolean;
  settings: {
    brandName: string;
    supportEmail: string | null;
    supportPhone: string | null;
    developmentMode: boolean;
    allowBalancePayments: boolean;
    allowMemberships: boolean;
    allowPaymentPlans: boolean;
    rescheduleMinimumNoticeHours: number;
    cancellationMinimumNoticeHours: number;
  };
};

function firstRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export async function getCurrentPatient(): Promise<CurrentPatient | null> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  await supabase.rpc("activate_patient_account_for_current_user");

  const { data: account } = await supabase
    .from("patient_accounts")
    .select(`
      id,
      organization_id,
      contact_id,
      sms_reminders_enabled,
      email_reminders_enabled,
      billing_notifications_enabled,
      contacts(id, first_name, last_name, email, phone, locations(name)),
      organizations(name)
    `)
    .eq("auth_user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!account) {
    return null;
  }

  const contact = firstRelation(account.contacts);
  const organization = firstRelation(account.organizations);
  const location = firstRelation(contact?.locations);
  const { data: settings } = await supabase
    .from("portal_settings")
    .select("brand_name, support_email, support_phone, development_mode, allow_balance_payments, allow_memberships, allow_payment_plans, reschedule_minimum_notice_hours, cancellation_minimum_notice_hours")
    .eq("organization_id", account.organization_id)
    .maybeSingle();

  if (!contact) {
    return null;
  }

  return {
    accountId: account.id,
    organizationId: account.organization_id,
    contactId: account.contact_id,
    organizationName: organization?.name ?? APP_DISPLAY_NAME,
    fullName: `${contact.first_name} ${contact.last_name}`,
    firstName: contact.first_name,
    lastName: contact.last_name,
    email: contact.email,
    phone: contact.phone,
    locationName: location?.name ?? null,
    smsRemindersEnabled: account.sms_reminders_enabled,
    emailRemindersEnabled: account.email_reminders_enabled,
    billingNotificationsEnabled: account.billing_notifications_enabled,
    settings: {
      brandName: settings?.brand_name ?? APP_DISPLAY_NAME,
      supportEmail: settings?.support_email ?? null,
      supportPhone: settings?.support_phone ?? null,
      developmentMode: settings?.development_mode ?? true,
      allowBalancePayments: settings?.allow_balance_payments ?? true,
      allowMemberships: settings?.allow_memberships ?? true,
      allowPaymentPlans: settings?.allow_payment_plans ?? true,
      rescheduleMinimumNoticeHours: settings?.reschedule_minimum_notice_hours ?? 48,
      cancellationMinimumNoticeHours: settings?.cancellation_minimum_notice_hours ?? 24
    }
  };
}

export async function requireCurrentPatient() {
  const patient = await getCurrentPatient();

  if (!patient) {
    redirect("/portal/login");
  }

  return patient;
}
