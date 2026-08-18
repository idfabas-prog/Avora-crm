"use client";

import { createPatientPaymentPlan, disablePatientPortal, enrollPatientMembership, invitePatientToPortal, upsertMembershipPlan, upsertPortalSettings } from "@/app/portal-actions";
import { ActionForm } from "@/components/crm/ActionForm";
import { APP_DISPLAY_NAME } from "@/lib/config/branding";

type Option = { id: string; name: string };

export function PatientPortalInviteForm({ contactId }: { contactId: string }) {
  return (
    <ActionForm action={invitePatientToPortal} className="inline-form" submitLabel="Invite" successMessage="Portal invite recorded">
      <input name="contact_id" type="hidden" value={contactId} />
    </ActionForm>
  );
}

export function PatientPortalDisableForm({ accountId, contactId }: { accountId: string; contactId: string }) {
  return (
    <ActionForm action={disablePatientPortal} className="inline-form" submitLabel="Disable" successMessage="Portal disabled">
      <input name="patient_account_id" type="hidden" value={accountId} />
      <input name="contact_id" type="hidden" value={contactId} />
    </ActionForm>
  );
}

export function PortalSettingsForm({ settings }: { settings?: Record<string, string | number | boolean | null> }) {
  return (
    <ActionForm action={upsertPortalSettings} submitLabel="Save Portal Settings" successMessage="Portal settings saved">
      <div className="form-grid two">
        <label><span>Brand Name</span><input defaultValue={String(settings?.brand_name ?? APP_DISPLAY_NAME)} name="brand_name" required /></label>
        <label><span>Support Email</span><input defaultValue={String(settings?.support_email ?? "")} name="support_email" type="email" /></label>
        <label><span>Support Phone</span><input defaultValue={String(settings?.support_phone ?? "")} name="support_phone" /></label>
        <label><span>Reschedule Notice Hours</span><input defaultValue={String(settings?.reschedule_minimum_notice_hours ?? 48)} min="0" name="reschedule_minimum_notice_hours" type="number" /></label>
        <label><span>Cancellation Notice Hours</span><input defaultValue={String(settings?.cancellation_minimum_notice_hours ?? 24)} min="0" name="cancellation_minimum_notice_hours" type="number" /></label>
      </div>
      <div className="checkbox-grid">
        <label><input defaultChecked={Boolean(settings?.portal_enabled ?? true)} name="portal_enabled" type="checkbox" /> Portal enabled</label>
        <label><input defaultChecked={Boolean(settings?.allow_balance_payments ?? true)} name="allow_balance_payments" type="checkbox" /> Balance payments</label>
        <label><input defaultChecked={Boolean(settings?.allow_memberships ?? true)} name="allow_memberships" type="checkbox" /> Memberships</label>
        <label><input defaultChecked={Boolean(settings?.allow_payment_plans ?? true)} name="allow_payment_plans" type="checkbox" /> Payment plans</label>
        <label><input defaultChecked={Boolean(settings?.development_mode ?? true)} name="development_mode" type="checkbox" /> Development-safe billing</label>
      </div>
    </ActionForm>
  );
}

export function MembershipPlanForm({ plan }: { plan?: Record<string, string | number | boolean | object | null> }) {
  return (
    <ActionForm action={upsertMembershipPlan} submitLabel={plan?.id ? "Save Plan" : "Create Plan"} successMessage="Membership plan saved">
      {plan?.id ? <input name="membership_plan_id" type="hidden" value={String(plan.id)} /> : null}
      <div className="form-grid two">
        <label><span>Name</span><input defaultValue={String(plan?.name ?? "")} name="name" required /></label>
        <label><span>Billing</span><select defaultValue={String(plan?.billing_interval ?? "monthly")} name="billing_interval"><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option><option value="custom">Custom</option></select></label>
        <label><span>Price</span><input defaultValue={((Number(plan?.price_cents ?? 0)) / 100).toFixed(2)} name="price" required /></label>
        <label><span>Stripe Price ID</span><input defaultValue={String(plan?.stripe_price_id ?? "")} name="stripe_price_id" /></label>
      </div>
      <label><span>Description</span><textarea defaultValue={String(plan?.description ?? "")} name="description" rows={3} /></label>
      <label><span>Benefits JSON</span><textarea defaultValue={JSON.stringify(plan?.included_benefits_json ?? [{ key: "consultation", label: "Included consultation", quantity: 1 }], null, 2)} name="included_benefits_json" rows={6} /></label>
      <label className="checkbox-row"><input defaultChecked={Boolean(plan?.active ?? true)} name="active" type="checkbox" /> Active</label>
    </ActionForm>
  );
}

export function MembershipEnrollmentForm({ contactId, plans }: { contactId: string; plans: Option[] }) {
  return (
    <ActionForm action={enrollPatientMembership} submitLabel="Enroll Membership" successMessage="Membership enrolled">
      <input name="contact_id" type="hidden" value={contactId} />
      <div className="form-grid two">
        <label><span>Plan</span><select name="membership_plan_id" required>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
        <label><span>Status</span><select name="status"><option value="trial">Trial</option><option value="active">Active</option><option value="paused">Paused</option></select></label>
        <label><span>Start Date</span><input defaultValue={new Date().toISOString().slice(0, 10)} name="start_date" type="date" /></label>
        <label><span>Next Billing</span><input name="next_billing_date" type="date" /></label>
      </div>
    </ActionForm>
  );
}

export function PaymentPlanForm({ sales }: { sales: Array<Option & { balanceCents: number }> }) {
  return (
    <ActionForm action={createPatientPaymentPlan} submitLabel="Create Payment Plan" successMessage="Payment plan created">
      <div className="form-grid two">
        <label><span>Sale</span><select name="sale_id" required>{sales.map((sale) => <option key={sale.id} value={sale.id}>{sale.name}</option>)}</select></label>
        <label><span>Total Financed</span><input defaultValue={((sales[0]?.balanceCents ?? 0) / 100).toFixed(2)} name="total_amount" required /></label>
        <label><span>Down Payment</span><input defaultValue="0.00" name="down_payment" /></label>
        <label><span>Installments</span><input defaultValue="3" min="1" name="installment_count" type="number" /></label>
        <label><span>Frequency</span><select name="frequency"><option value="monthly">Monthly</option><option value="biweekly">Biweekly</option><option value="weekly">Weekly</option></select></label>
        <label><span>Start Date</span><input defaultValue={new Date().toISOString().slice(0, 10)} name="start_date" type="date" /></label>
      </div>
    </ActionForm>
  );
}
