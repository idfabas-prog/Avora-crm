import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { assertSystemAccess } from "@/lib/system/audits";
import { updateFeatureGate } from "@/app/system-actions";

const highRiskGates = ["live_payments", "live_telephony", "live_campaigns", "live_accounting", "live_push", "live_ai_provider"];

export default async function FeatureGatePage() {
  const profile = await requireCurrentProfile();
  assertSystemAccess(profile);
  const supabase = await createClient();
  const { data: flags } = await supabase.from("system_feature_flags").select("*").eq("organization_id", profile.organizationId).order("feature_key");

  return (
    <div className="page-stack">
      <PageHeader description="Master live-write gates. Credentials alone never enable money movement, calls, messaging, accounting, push, or live AI." title="Feature Gates" />
      <section className="settings-grid">
        {(flags ?? []).map((flag) => (
          <article className="settings-card" key={flag.id}>
            <div><h2>{flag.feature_key}</h2><StatusBadge status={flag.live_enabled ? "warning" : flag.status} /></div>
            <p>{flag.description}</p>
            {highRiskGates.includes(flag.feature_key) ? (
              <form action={updateFeatureGate} className="stack-form">
                <input name="feature_key" type="hidden" value={flag.feature_key} />
                <label><input defaultChecked={Boolean(flag.live_enabled)} name="live_enabled" type="checkbox" /> Live enabled</label>
                <button className="secondary-button" type="submit">Update Gate</button>
              </form>
            ) : null}
          </article>
        ))}
      </section>
    </div>
  );
}

