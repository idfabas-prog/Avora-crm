import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { assertExecutivePermission } from "@/lib/executive/permissions";
import { createClient } from "@/lib/supabase/server";

export default async function ExecutiveSettingsPage() {
  const profile = await requireCurrentProfile();
  assertExecutivePermission(profile, "executive.targets.read");
  const supabase = await createClient();
  const [{ count: targetCount }, { count: alertCount }, { count: weightCount }, { count: profileCount }] = await Promise.all([
    supabase.from("executive_targets").select("id", { count: "exact", head: true }).eq("organization_id", profile.organizationId),
    supabase.from("executive_alert_settings").select("id", { count: "exact", head: true }).eq("organization_id", profile.organizationId),
    supabase.from("executive_scorecard_weights").select("id", { count: "exact", head: true }).eq("organization_id", profile.organizationId),
    supabase.from("location_operating_profiles").select("id", { count: "exact", head: true }).eq("organization_id", profile.organizationId)
  ]);

  return (
    <div className="page-stack">
      <PageHeader
        action={<Link className="primary-button" href="/settings/executive/targets">Manage Targets</Link>}
        description="Owner-level settings for targets, alerts, scorecards, forecasts, and location maturity."
        title="Executive Settings"
      />
      <section className="settings-nav">
        <Link href="/settings/executive/targets">Targets</Link>
        <Link href="/executive/alerts">Alert Thresholds</Link>
        <Link href="/executive">Scorecard Weights</Link>
        <Link href="/executive">Forecast Settings</Link>
        <Link href="/executive">Location Maturity</Link>
      </section>
      <section className="metric-grid">
        <StatCard detail="Historical targets are preserved" label="Targets" value={String(targetCount ?? 0)} />
        <StatCard detail="Deterministic threshold rules" label="Alert Settings" value={String(alertCount ?? 0)} />
        <StatCard detail="Financial, sales, marketing, ops, retention" label="Score Weights" value={String(weightCount ?? 0)} />
        <StatCard detail="Location maturity metadata" label="Operating Profiles" value={String(profileCount ?? 0)} />
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Executive Controls</h2><span>Phase 13 foundation</span></div>
        <div className="record-list">
          <article><strong>Targets</strong><p>Company or location-specific targets with effective dates and warning/critical thresholds.</p></article>
          <article><strong>Alerts</strong><p>Owner attention rules dedupe by deterministic identity and do not send live messages automatically.</p></article>
          <article><strong>Forecasts</strong><p>Run-rate estimates only. They are labeled by confidence and never treated as accounting forecasts.</p></article>
          <article><strong>Privacy</strong><p>Executive views show aggregate labor and clinical operations data, not individual pay rates or private clinical notes.</p></article>
        </div>
      </section>
    </div>
  );
}
