import { PaymentMethodRuleForm } from "@/components/crm/FinancialForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { assertFinancialPermission } from "@/lib/financial/permissions";
import { formatMoney } from "@/lib/financial/money";
import { stripeConfigured, verifyStripeWebhookConfigured } from "@/lib/financial/stripe-service";

export default async function PaymentSettingsPage() {
  const profile = await requireCurrentProfile();
  assertFinancialPermission(profile, "payments.write");
  const supabase = await createClient();
  const { data: rules } = await supabase.from("payment_method_rules").select("*").eq("organization_id", profile.organizationId).order("payment_method");

  return (
    <div className="page-stack">
      <PageHeader description="Configure payment method fees and basis effects. Secret keys are never shown." title="Payment Settings" />
      <section className="metric-grid">
        <StatusCard label="Mode" value={process.env.PAYMENTS_MODE ?? "development"} />
        <StatusCard label="Stripe" value={stripeConfigured() ? "Configured" : "Not Configured"} />
        <StatusCard label="Webhook" value={verifyStripeWebhookConfigured() ? "Configured" : "Not Configured"} />
        <StatusCard label="Live Charges" value={process.env.PAYMENTS_ALLOW_LIVE_CHARGES === "true" ? "Enabled" : "Disabled"} />
      </section>
      <details className="panel"><summary className="summary-action">Create Payment Method Rule</summary><PaymentMethodRuleForm locations={profile.locations} /></details>
      <section className="panel">
        <div className="panel-header"><h2>Payment Method Rules</h2><span>Fee impact preview uses these settings</span></div>
        <div className="record-list">{(rules ?? []).map((rule) => <article key={rule.id}><strong>{rule.payment_method} · {rule.provider}</strong><p>{(Number(rule.fee_percentage) * 100).toFixed(2)}% + {formatMoney(rule.fee_fixed_cents)} · {rule.active ? "active" : "inactive"}</p><span>Commission basis {rule.affects_commission_basis ? "net after fee" : "gross collected"} · Royalty basis {rule.affects_royalty_basis ? "net after fee" : "gross collected"}</span><details><summary className="summary-action">Edit</summary><PaymentMethodRuleForm locations={profile.locations} rule={rule} /></details></article>)}</div>
      </section>
    </div>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return <section className="stat-card"><p>{label}</p><strong>{value}</strong><span>Financial configuration</span></section>;
}
