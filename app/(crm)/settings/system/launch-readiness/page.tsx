import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { assertSystemAccess } from "@/lib/system/audits";
import { productionReadinessChecks, readinessStatus } from "@/lib/system/production-readiness";

export default async function LaunchReadinessPage() {
  const profile = await requireCurrentProfile();
  assertSystemAccess(profile);
  const supabase = await createClient();
  const { data: seededChecks } = await supabase.from("launch_readiness_checks").select("*").eq("organization_id", profile.organizationId).order("category");
  const runtimeChecks = productionReadinessChecks();
  const runtimeStatus = readinessStatus(runtimeChecks);

  return (
    <div className="page-stack">
      <PageHeader description="Deterministic launch blockers, warnings, and operational checks for controlled production launch." title="Launch Readiness" />
      <section className="panel">
        <div className="panel-header"><h2>Runtime Status</h2><StatusBadge status={runtimeStatus} /></div>
        <div className="record-list">
          {runtimeChecks.map((check) => <article key={check.key}><strong>{check.category}: {check.summary}</strong><p>{check.remediation}</p><StatusBadge status={check.status} /></article>)}
        </div>
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Seeded Deployment Checks</h2><span>{seededChecks?.length ?? 0} rows</span></div>
        <div className="record-list">
          {(seededChecks ?? []).map((check) => <article key={check.id}><strong>{check.category}: {check.summary}</strong><p>{check.remediation}</p><StatusBadge status={check.status} /></article>)}
        </div>
      </section>
    </div>
  );
}

