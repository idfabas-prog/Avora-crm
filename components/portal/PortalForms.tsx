"use client";

import { ActionForm } from "@/components/crm/ActionForm";
import { markPortalNotification, requestPortalAppointmentChange, signPortalConsent, simulatePortalBalancePayment, updatePatientPortalProfile } from "@/app/portal-actions";

type AppointmentOption = { id: string; name: string };

export function PortalProfileForm({
  firstName,
  lastName,
  phone,
  sms,
  email,
  billing
}: {
  firstName: string;
  lastName: string;
  phone: string | null;
  sms: boolean;
  email: boolean;
  billing: boolean;
}) {
  return (
    <ActionForm action={updatePatientPortalProfile} submitLabel="Save Profile" successMessage="Profile saved">
      <div className="form-grid two">
        <label><span>First Name</span><input defaultValue={firstName} name="first_name" required /></label>
        <label><span>Last Name</span><input defaultValue={lastName} name="last_name" required /></label>
        <label><span>Phone</span><input defaultValue={phone ?? ""} name="phone" /></label>
      </div>
      <div className="checkbox-grid">
        <label><input defaultChecked={sms} name="sms_reminders" type="checkbox" /> SMS reminders</label>
        <label><input defaultChecked={email} name="email_reminders" type="checkbox" /> Email reminders</label>
        <label><input defaultChecked={billing} name="billing_notifications" type="checkbox" /> Billing notifications</label>
      </div>
    </ActionForm>
  );
}

export function AppointmentRequestForm({ appointments }: { appointments: AppointmentOption[] }) {
  return (
    <ActionForm action={requestPortalAppointmentChange} submitLabel="Send Request" successMessage="Request sent">
      <div className="form-grid two">
        <label><span>Appointment</span><select name="appointment_id" required>{appointments.map((appointment) => <option key={appointment.id} value={appointment.id}>{appointment.name}</option>)}</select></label>
        <label><span>Request</span><select name="request_type"><option value="reschedule">Reschedule</option><option value="cancel">Cancel</option></select></label>
        <label><span>Preferred New Time</span><input name="requested_start_at" type="datetime-local" /></label>
      </div>
      <label><span>Reason</span><textarea name="reason" rows={3} /></label>
    </ActionForm>
  );
}

export function ConsentSignatureForm({ consentId, defaultName }: { consentId: string; defaultName: string }) {
  return (
    <ActionForm action={signPortalConsent} className="inline-form" submitLabel="Sign" successMessage="Consent signed">
      <input name="consent_id" type="hidden" value={consentId} />
      <input name="signer_name" defaultValue={defaultName} required />
    </ActionForm>
  );
}

export function PortalPaymentForm({ saleId, balanceCents }: { saleId: string; balanceCents: number }) {
  return (
    <ActionForm action={simulatePortalBalancePayment} className="inline-form" submitLabel="Simulate Payment" successMessage="Payment simulated">
      <input name="sale_id" type="hidden" value={saleId} />
      <input defaultValue={(balanceCents / 100).toFixed(2)} min="1" name="amount" required />
    </ActionForm>
  );
}

export function NotificationStatusForm({ notificationId, status }: { notificationId: string; status: "read" | "dismissed" }) {
  return (
    <ActionForm action={markPortalNotification} className="inline-form" submitLabel={status === "read" ? "Mark Read" : "Dismiss"} successMessage="Updated">
      <input name="notification_id" type="hidden" value={notificationId} />
      <input name="status" type="hidden" value={status} />
    </ActionForm>
  );
}
