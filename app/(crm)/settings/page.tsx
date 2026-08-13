import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { formatPhoneNumber } from "@/lib/communications/phone";
import { formatMoney } from "@/lib/financial/money";
import { stripeConfigured, verifyStripeWebhookConfigured } from "@/lib/financial/stripe-service";

export default async function SettingsPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const [{ data: numbers }, { data: settings }, { data: paymentRules }, { data: commissionRules }, { data: royaltyRules }] = await Promise.all([
    supabase.from("communication_numbers").select("id, location_id, provider, phone_number, friendly_name, supports_sms, supports_voice, active, is_primary, is_test_number").eq("organization_id", profile.organizationId).order("friendly_name"),
    supabase.from("communication_settings").select("id, location_id, messaging_enabled, missed_call_text_back_enabled, appointment_confirmation_enabled, reminder_24h_enabled, reminder_1h_enabled").eq("organization_id", profile.organizationId),
    supabase.from("payment_method_rules").select("id, payment_method, provider, fee_percentage, fee_fixed_cents, affects_commission_basis, affects_royalty_basis, active").eq("organization_id", profile.organizationId).order("payment_method"),
    supabase.from("commission_rules").select("id, rate, basis, active, user_profiles(full_name), services(name), packages(name), category").eq("organization_id", profile.organizationId).order("created_at"),
    supabase.from("royalty_rules").select("id, rate, basis, active, category, services(name), packages(name)").eq("organization_id", profile.organizationId).order("created_at")
  ]);

  return (
    <div className="page-stack">
      <PageHeader
        description="Communication and financial controls by location. Secrets are never displayed here."
        title="Settings"
      />
      <section className="settings-nav">
        <Link href="/settings/services">Services</Link>
        <Link href="/settings/packages">Packages</Link>
        <Link href="/settings/payments">Payment Rules</Link>
        <Link href="/settings/commissions">Commission Rules</Link>
        <Link href="/settings/royalties">Royalty Rules</Link>
        <Link href="/settings/financial-health">Financial Health</Link>
        <Link href="/settings/clinical/services">Clinical Services</Link>
        <Link href="/settings/clinical/templates">Clinical Templates</Link>
        <Link href="/settings/clinical/consents">Consent Templates</Link>
        <Link href="/settings/ai">AI Settings</Link>
        <Link href="/settings/audit-log">Audit Log</Link>
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Communications</h2><span>Configured / Not Configured</span></div>
        <div className="settings-grid">
          {profile.locations.map((location) => {
            const number = numbers?.find((item) => item.location_id === location.id);
            const locationSettings = settings?.find((item) => item.location_id === location.id);

            return (
              <article className="settings-card" key={location.id}>
                <div>
                  <h2>{location.name}</h2>
                  <StatusBadge status={number?.active ? "Configured" : "Not Configured"} />
                </div>
                <dl>
                  <div><dt>SMS Number</dt><dd>{number ? formatPhoneNumber(number.phone_number) : "Not configured"}</dd></div>
                  <div><dt>Voice Number</dt><dd>{number?.supports_voice ? formatPhoneNumber(number.phone_number) : "Not configured"}</dd></div>
                  <div><dt>Provider</dt><dd>{number?.provider ?? "none"}{number?.is_test_number ? " · NON-LIVE" : ""}</dd></div>
                  <div><dt>Messaging</dt><dd>{locationSettings?.messaging_enabled ? "Enabled" : "Off"}</dd></div>
                  <div><dt>Missed-call text-back</dt><dd>{locationSettings?.missed_call_text_back_enabled ? "Enabled" : "Off"}</dd></div>
                  <div><dt>Appointment confirmation</dt><dd>{locationSettings?.appointment_confirmation_enabled ? "Enabled" : "Off"}</dd></div>
                  <div><dt>24-hour reminder</dt><dd>{locationSettings?.reminder_24h_enabled ? "Enabled" : "Off"}</dd></div>
                  <div><dt>1-hour reminder</dt><dd>{locationSettings?.reminder_1h_enabled ? "Enabled" : "Off"}</dd></div>
                </dl>
              </article>
            );
          })}
        </div>
      </section>
      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Payments</h2><span>Development safe by default</span></div>
          <dl className="settings-list">
            <div><dt>Stripe</dt><dd>{stripeConfigured() ? "Configured" : "Not Configured"}</dd></div>
            <div><dt>Stripe Webhook</dt><dd>{verifyStripeWebhookConfigured() ? "Configured" : "Not Configured"}</dd></div>
            <div><dt>Live Payments</dt><dd>{process.env.PAYMENTS_ALLOW_LIVE_CHARGES === "true" ? "Enabled" : "Disabled"}</dd></div>
            <div><dt>Mode</dt><dd>{process.env.PAYMENTS_MODE ?? "development"}</dd></div>
          </dl>
          <div className="record-list">
            {(paymentRules ?? []).map((rule) => <article key={rule.id}><strong>{rule.payment_method} · {rule.provider}</strong><p>{rule.active ? "Active" : "Inactive"} · fee {(Number(rule.fee_percentage) * 100).toFixed(2)}% + {formatMoney(rule.fee_fixed_cents)}</p><span>Commission basis {rule.affects_commission_basis ? "affected" : "not affected"} · Royalty basis {rule.affects_royalty_basis ? "affected" : "not affected"}</span></article>)}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Commissions</h2><span>Rule precedence lives in the financial engine</span></div>
          <div className="record-list">
            {(commissionRules ?? []).map((rule) => {
              const user = Array.isArray(rule.user_profiles) ? rule.user_profiles[0] : rule.user_profiles;
              const service = Array.isArray(rule.services) ? rule.services[0] : rule.services;
              const pack = Array.isArray(rule.packages) ? rule.packages[0] : rule.packages;
              return <article key={rule.id}><strong>{user?.full_name ?? "Organization default"}</strong><p>{service?.name ?? pack?.name ?? rule.category ?? "Default"} · {(Number(rule.rate) * 100).toFixed(2)}% · {rule.basis}</p><span>{rule.active ? "Active" : "Inactive"}</span></article>;
            })}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Royalties</h2><span>Configurable, not hardcoded</span></div>
          <div className="record-list">
            {(royaltyRules ?? []).map((rule) => {
              const service = Array.isArray(rule.services) ? rule.services[0] : rule.services;
              const pack = Array.isArray(rule.packages) ? rule.packages[0] : rule.packages;
              return <article key={rule.id}><strong>{service?.name ?? pack?.name ?? rule.category ?? "Default"}</strong><p>{(Number(rule.rate) * 100).toFixed(2)}% · {rule.basis}</p><span>{rule.active ? "Active" : "Inactive"}</span></article>;
            })}
          </div>
        </section>
      </section>
    </div>
  );
}
