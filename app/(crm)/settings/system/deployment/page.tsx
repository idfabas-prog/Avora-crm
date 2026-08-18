import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { assertSystemAccess } from "@/lib/system/audits";
import { productionReadinessChecks, readinessStatus } from "@/lib/system/production-readiness";
import { deploymentDiagnostics, validatePhase22ProductionEnvironment } from "@/lib/system/operations";

export default async function DeploymentPage() {
  const profile = await requireCurrentProfile();
  assertSystemAccess(profile);
  const checks = productionReadinessChecks();
  const status = readinessStatus(checks);
  const env = validatePhase22ProductionEnvironment();
  const diagnostics = deploymentDiagnostics();

  return (
    <div className="page-stack">
      <PageHeader description="Deployment readiness, environment gates, and runbook links for staging and production." title="Deployment" />
      <section className="settings-nav">
        <Link href="/settings/system/health">System Health</Link>
        <Link href="/settings/system/workers">Workers</Link>
        <Link href="/settings/system/incidents">Incidents</Link>
        <Link href="/settings/system/sync-health">Sync Health</Link>
      </section>
      <section className="stats-grid">
        <div className="stat-card"><span>Launch Status</span><strong>{status}</strong></div>
        <div className="stat-card"><span>Environment</span><strong>{env.environment}</strong></div>
        <div className="stat-card"><span>Version</span><strong>{diagnostics.appVersion}</strong></div>
      </section>
      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-header"><h2>Required Gates</h2><StatusBadge status={env.ok ? "healthy" : "degraded"} /></div>
          <dl className="settings-list">
            <div><dt>APP_URL</dt><dd>{diagnostics.appUrlPresent ? "Present" : "Missing"}</dd></div>
            <div><dt>CRON_SECRET</dt><dd>{diagnostics.cronSecretPresent ? "Present" : "Missing"}</dd></div>
            <div><dt>SUPABASE_SERVICE_ROLE_KEY</dt><dd>{diagnostics.serviceRolePresent ? "Present" : "Missing"}</dd></div>
            <div><dt>GHL_MIAMI_PRIVATE_TOKEN</dt><dd>{diagnostics.ghlMiamiTokenPresent ? "Present" : "Missing"}</dd></div>
            <div><dt>GHL_ALLOW_WRITES</dt><dd>{diagnostics.ghlWritesAllowed ? "Enabled - block production" : "Disabled"}</dd></div>
            <div><dt>ALLOW_DEMO_SEED</dt><dd>{diagnostics.demoSeedAllowed ? "Enabled - block production" : "Disabled"}</dd></div>
          </dl>
        </article>
        <article className="panel">
          <div className="panel-header"><h2>Runbooks</h2><span>Manual steps</span></div>
          <div className="record-list">
            <article><strong>Deployment Checklist</strong><p>docs/production/deployment-checklist.md</p></article>
            <article><strong>Supabase Backup / Restore</strong><p>docs/production/supabase-backup-restore.md</p></article>
            <article><strong>Disaster Recovery</strong><p>docs/production/disaster-recovery.md</p></article>
          </div>
        </article>
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Readiness Checks</h2><StatusBadge status={status} /></div>
        <div className="record-list">
          {checks.map((check) => (
            <article key={check.key}>
              <strong>{check.category} · {check.key}</strong>
              <p>{check.summary}</p>
              <span>{check.remediation}</span>
              <StatusBadge status={check.status} />
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
