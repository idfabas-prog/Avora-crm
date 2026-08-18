import Link from "next/link";
import { GhlRetryFailedRecordsForm } from "@/components/crm/GoHighLevelForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { formatDateTime } from "@/lib/crm/constants";
import { getGhlDashboardReport, sanitizeGhlDiagnosticText } from "@/lib/integrations/gohighlevel/reports";
import { createClient } from "@/lib/supabase/server";

function jobStatusCounts(jobs: { status?: string | null }[]) {
  return jobs.reduce<Record<string, number>>((counts, job) => {
    const status = String(job.status ?? "unknown");
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {});
}

function jobCounts(job: { metadata_safe?: Record<string, unknown> | null }) {
  const counts = job.metadata_safe?.counts;
  return counts && typeof counts === "object" ? counts as Record<string, unknown> : null;
}

function jobNextPage(job: { metadata_safe?: Record<string, unknown> | null }) {
  const completedPage = job.metadata_safe?.completed_page;
  const page = completedPage && typeof completedPage === "object" ? completedPage as Record<string, unknown> : null;
  return String(page?.next_page_token ?? page?.nextPageToken ?? "unknown");
}

function jobErrorSummary(job: { last_error?: string | null; metadata_safe?: Record<string, unknown> | null }) {
  const terminal = job.metadata_safe?.terminal_safe_error;
  const last = job.metadata_safe?.last_safe_error;
  const safeError = terminal && typeof terminal === "object" ? terminal as Record<string, unknown> : last && typeof last === "object" ? last as Record<string, unknown> : null;
  const pieces = [
    safeError?.httpStatus ? `HTTP ${String(safeError.httpStatus)}` : null,
    safeError?.endpoint ? `endpoint ${String(safeError.endpoint)}` : null,
    safeError?.safeProviderMessage ? String(safeError.safeProviderMessage) : null,
    job.last_error ? String(job.last_error) : null
  ].filter(Boolean);
  return sanitizeGhlDiagnosticText(pieces.join(" - ") || "No job-level error recorded");
}

function appointmentStatusBackfillReport(metadata: Record<string, unknown>) {
  const report = metadata.appointment_status_backfill_dry_run;
  return report && typeof report === "object" ? report as Record<string, unknown> : null;
}

function appointmentStatusBackfillApplyReport(metadata: Record<string, unknown>) {
  const report = metadata.appointment_status_backfill_apply;
  return report && typeof report === "object" ? report as Record<string, unknown> : null;
}

function countDetails(value: unknown) {
  if (!value || typeof value !== "object") return "";
  return Object.entries(value as Record<string, unknown>)
    .map(([key, count]) => `${key}: ${String(count)}`)
    .join("; ");
}

export default async function GoHighLevelRunsPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const report = await getGhlDashboardReport(supabase, profile);

  return (
    <div className="page-stack">
      <PageHeader action={<Link className="secondary-button" href="/integrations/gohighlevel">Dashboard</Link>} description="Historical import, dry-run, webhook, and reconciliation run history." title="GHL Sync Runs" />
      <section className="panel wide-panel">
        <div className="record-list">
          {report.runs.map((run) => {
            const jobs = report.jobsByRun[run.id] ?? [];
            const currentJob = jobs.find((job) => ["queued", "locked", "running"].includes(String(job.status))) ?? jobs[0];
            const counts = jobStatusCounts(jobs);
            const deadLetterJobs = jobs.filter((job) => String(job.status) === "dead_letter");
            const exceptionBreakdown = report.exceptionBreakdownByRun[run.id] ?? [];
            const metadata = run.metadata_safe && typeof run.metadata_safe === "object" ? run.metadata_safe as Record<string, unknown> : {};
            const statusBackfill = appointmentStatusBackfillReport(metadata);
            const statusBackfillApply = appointmentStatusBackfillApplyReport(metadata);
            return (
              <article key={run.id}>
                <strong>{run.sync_type}{run.object_type ? ` - ${run.object_type}` : ""}</strong>
                <p>
                  Object {String(metadata.current_object ?? currentJob?.object_type ?? "n/a")} -
                  Fetched {run.records_fetched}; created {run.records_created}; updated {run.records_updated}; matched {run.records_unchanged}; skipped {run.records_skipped}; failed {run.records_failed}
                </p>
                <p>Cursor {String(metadata.current_cursor ?? currentJob?.page_token ?? "none")} - page {String(metadata.current_page ?? currentJob?.page_token ?? "first")} - progress {run.progress_percent ?? 0}%</p>
                <p>
                  Jobs queued {counts.queued ?? 0}; running {counts.running ?? 0}; locked {counts.locked ?? 0}; failed {counts.failed ?? 0}; dead {counts.dead_letter ?? 0}; completed {counts.completed ?? 0}
                </p>
                {exceptionBreakdown.length ? (
                  <div className="mini-list">
                    {exceptionBreakdown.slice(0, 6).map((item) => (
                      <span key={`${item.reason}-${item.exceptionType}-${item.objectType}`}>
                        {item.count}x {item.objectType} - {item.reason}: {item.summary}
                      </span>
                    ))}
                  </div>
                ) : null}
                {deadLetterJobs.length ? (
                  <div className="mini-list">
                    {deadLetterJobs.map((job) => {
                      const countsForJob = jobCounts(job);
                      return (
                        <span key={String(job.id)}>
                          Dead-letter {String(job.object_type ?? "unknown")} page {String(job.page_token ?? "first")} cursor {String(job.cursor_value ?? "none")} next {jobNextPage(job)} - attempts {String(job.attempts ?? 0)} - fetched {String(countsForJob?.fetched ?? "n/a")}; skipped {String(countsForJob?.skipped ?? "n/a")}; failed {String(countsForJob?.failed ?? "n/a")} - {jobErrorSummary(job)}
                        </span>
                      );
                    })}
                  </div>
                ) : null}
                {statusBackfill ? (
                  <div className="mini-list">
                    <span>Appointment status dry run: mappings {String(statusBackfill.mappingsRead ?? 0)}; provider events {String(statusBackfill.providerAppointmentsFetched ?? 0)}; calendars {String(statusBackfill.calendarsChecked ?? 0)}; would change {String(statusBackfill.wouldChangeCount ?? 0)}; unresolved {String(statusBackfill.unresolvedCount ?? 0)}</span>
                    <span>Raw statuses: {countDetails(statusBackfill.rawStatusBreakdown)}</span>
                    <span>Proposed normalized statuses: {countDetails(statusBackfill.proposedNormalizedBreakdown)}</span>
                    <span>No business records written; no GHL writes performed.</span>
                  </div>
                ) : null}
                {statusBackfillApply ? (
                  <div className="mini-list">
                    <span>Appointment status backfill applied: total {String((statusBackfillApply.reconciliation as Record<string, unknown> | undefined)?.total ?? 0)}; candidates {String(statusBackfillApply.applyCandidateCount ?? statusBackfillApply.wouldChangeCount ?? 0)}; changed {String(statusBackfillApply.appointmentStatusChangedCount ?? 0)}; metadata updated {String(statusBackfillApply.mappingMetadataUpdatedCount ?? 0)}; failed {String(statusBackfillApply.failedCount ?? 0)}</span>
                    <span>Status-only reconciliation: {countDetails(statusBackfillApply.reconciliation)}</span>
                    <span>Raw statuses preserved: {countDetails(statusBackfillApply.rawStatusBreakdown)}</span>
                    <span>No GHL writes performed; no date, time, contact, calendar, provider, payment, note, or ID fields changed.</span>
                  </div>
                ) : null}
                <span>
                  Current job {currentJob ? `${currentJob.object_type ?? "unknown"} / ${currentJob.status ?? "unknown"}` : "none"} - Started {formatDateTime(run.started_at)} - last progress {metadata.last_progress_at ? formatDateTime(String(metadata.last_progress_at)) : "n/a"} - <StatusBadge status={run.status} />
                </span>
                {String(run.sync_type) === "full_import" && (counts.dead_letter || run.status === "partial") ? (
                  <div className="inline-actions">
                    <GhlRetryFailedRecordsForm connectionId={String(run.connection_id)} runId={String(run.id)} />
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
