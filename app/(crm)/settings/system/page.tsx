import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { APP_DISPLAY_NAME } from "@/lib/config/branding";
import { createClient } from "@/lib/supabase/server";
import { assertSystemAccess } from "@/lib/system/audits";
import { validateEnvironment, getAppVersion } from "@/lib/config/environment";
import { integrationGateSummary } from "@/lib/security/feature-gates";
import { updateSystemMode } from "@/app/system-actions";

export default async function SystemSettingsPage() {
  const profile = await requireCurrentProfile();
  assertSystemAccess(profile);
  const supabase = await createClient();
  const [{ data: settings }, { data: health }, { data: failures }] = await Promise.all([
    supabase.from("system_settings").select("*").eq("organization_id", profile.organizationId).maybeSingle(),
    supabase.from("system_health_checks").select("*").eq("organization_id", profile.organizationId).order("category"),
    supabase.from("system_job_failures").select("*").eq("organization_id", profile.organizationId).order("created_at", { ascending: false }).limit(5)
  ]);
  const env = validateEnvironment();
  const gates = integrationGateSummary();

  return (
    <div className="page-stack">
      <PageHeader description="Operational controls for production hardening, readiness, jobs, and integrations." title="System" />
      <section className="settings-nav">
        <Link href="/settings/system">Status</Link>
        <Link href="/settings/system/health">System Health</Link>
        <Link href="/settings/system/deployment">Deployment</Link>
        <Link href="/settings/system/workers">Workers</Link>
        <Link href="/settings/system/incidents">Incidents</Link>
        <Link href="/settings/system/sync-health">Sync Health</Link>
        <Link href="/settings/system/features">Feature Gates</Link>
        <Link href="/settings/system/jobs">Jobs</Link>
        <Link href="/settings/system/security">Security</Link>
        <Link href="/settings/system/access-review">Access Review</Link>
        <Link href="/settings/system/launch-readiness">Launch Readiness</Link>
      </section>
      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-header"><h2>Environment</h2><StatusBadge status={env.ok ? "pass" : "fail"} /></div>
          <dl className="settings-list">
            <div><dt>Environment</dt><dd>{env.environment}</dd></div>
            <div><dt>Version</dt><dd>{getAppVersion()}</dd></div>
            <div><dt>Missing Variables</dt><dd>{env.missing.length ? env.missing.join(", ") : "None"}</dd></div>
            <div><dt>Warnings</dt><dd>{env.warnings.length ? env.warnings.join("; ") : "None"}</dd></div>
          </dl>
        </article>
        <article className="panel">
          <div className="panel-header"><h2>System Modes</h2><StatusBadge status={settings?.read_only_mode || settings?.maintenance_mode ? "warning" : "pass"} /></div>
          <form action={updateSystemMode} className="stack-form">
            <label><input defaultChecked={Boolean(settings?.maintenance_mode)} name="maintenance_mode" type="checkbox" /> Maintenance mode</label>
            <label><input defaultChecked={Boolean(settings?.read_only_mode)} name="read_only_mode" type="checkbox" /> Emergency read-only mode</label>
            <label>Support message<input defaultValue={settings?.support_message ?? `${APP_DISPLAY_NAME} is operating normally.`} name="support_message" /></label>
            <button className="primary-button" type="submit">Save Modes</button>
          </form>
        </article>
      </section>
      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-header"><h2>Live Gates</h2><span>Default off</span></div>
          <div className="record-list">
            {gates.map((gate) => <article key={gate.gate}><strong>{gate.gate}</strong><p>{gate.envVar}</p><StatusBadge status={gate.liveEnabled ? "warning" : "disabled"} /></article>)}
          </div>
        </article>
        <article className="panel">
          <div className="panel-header"><h2>Health Checks</h2><span>{health?.length ?? 0} checks</span></div>
          <div className="record-list">
            {(health ?? []).map((check) => <article key={check.id}><strong>{check.category}: {check.check_key}</strong><p>{check.summary}</p><StatusBadge status={check.status} /></article>)}
          </div>
        </article>
        <article className="panel">
          <div className="panel-header"><h2>Recent Job Failures</h2><span>{failures?.length ?? 0} rows</span></div>
          <div className="record-list">
            {(failures ?? []).map((failure) => <article key={failure.id}><strong>{failure.job_type}</strong><p>{failure.last_error_safe}</p><StatusBadge status={failure.status} /></article>)}
          </div>
        </article>
      </section>
    </div>
  );
}
