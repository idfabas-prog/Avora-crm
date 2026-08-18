import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { assertSystemAccess } from "@/lib/system/audits";
import { classifyJobStatus, summarizeJobs } from "@/lib/system/jobs";

export default async function JobsPage() {
  const profile = await requireCurrentProfile();
  assertSystemAccess(profile);
  const supabase = await createClient();
  const { data: failures } = await supabase.from("system_job_failures").select("*").eq("organization_id", profile.organizationId).order("created_at", { ascending: false }).limit(50);
  const statuses = (failures ?? []).map((failure) => classifyJobStatus(failure.status, failure.updated_at));
  const summary = summarizeJobs(statuses, failures?.[0]?.created_at ?? null);

  return (
    <div className="page-stack">
      <PageHeader description="Background job visibility for workflow, campaign, AI, accounting, and future scheduled workers." title="Job Health" />
      <section className="stats-grid">
        <div className="stat-card"><span>Failed</span><strong>{summary.failed}</strong></div>
        <div className="stat-card"><span>Dead Letter</span><strong>{summary.deadLetter}</strong></div>
        <div className="stat-card"><span>Stuck</span><strong>{summary.stuck}</strong></div>
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Failure Queue</h2><span>Safe metadata only</span></div>
        <div className="record-list">
          {(failures ?? []).map((failure) => <article key={failure.id}><strong>{failure.job_type}</strong><p>{failure.last_error_safe}</p><StatusBadge status={failure.status} /></article>)}
        </div>
      </section>
    </div>
  );
}

