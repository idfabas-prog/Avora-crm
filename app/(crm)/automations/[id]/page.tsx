import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AddWorkflowNodeForm,
  ManualEnrollmentForm,
  NodeReorderControls,
  RetryEnrollmentForm,
  StopEnrollmentForm,
  WorkflowDefinitionForm,
  WorkflowSettingsForm,
  WorkflowTestForm,
  WorkflowTopActions
} from "@/components/crm/WorkflowForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { categoryLabels, nodeLabels, statusLabels } from "@/lib/workflows/constants";
import { previewAction } from "@/lib/workflows/actions";
import { describeWait } from "@/lib/workflows/waits";
import { assertWorkflowPermission, hasWorkflowPermission } from "@/lib/workflows/permissions";
import { validateWorkflowDefinition } from "@/lib/workflows/validation";
import { workflowSummary } from "@/lib/workflows/engine";
import type { WorkflowDefinition, WorkflowNode } from "@/lib/workflows/types";

type WorkflowDetail = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  status: string;
  version: number | null;
  active_version_id: string | null;
  location_scope: string | null;
  enrollment_policy: string | null;
  re_enrollment_policy: string | null;
  failure_policy: string | null;
  test_mode: boolean | null;
  max_sms_per_minute: number | null;
  max_enrollments_per_batch: number | null;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  respect_business_days: boolean | null;
  published_at: string | null;
};

type VersionRow = { id: string; version_number: number; status: string; definition_json: WorkflowDefinition; validation_snapshot: unknown; created_at: string | null; published_at: string | null };
type EnrollmentRow = {
  id: string;
  status: string | null;
  current_node_id: string | null;
  enrolled_at: string | null;
  completed_at: string | null;
  stopped_at: string | null;
  stop_reason: string | null;
  contacts: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null;
  workflow_scheduled_jobs: Array<{ run_at: string | null; status: string | null }> | null;
};
type LogRow = { id: string; event_type: string | null; message: string | null; created_at: string | null; metadata: unknown };
type TestRunRow = { id: string; status: string | null; output_snapshot: { steps?: Array<{ nodeId: string; status: string; message: string }> } | null; created_at: string | null; contacts: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null };

function firstRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function nodePreview(node: WorkflowNode) {
  if (node.type === "trigger") return `When ${String(node.configuration.trigger_type).replaceAll("_", " ")}`;
  if (node.type === "action") return previewAction(node);
  if (node.type === "wait") return describeWait(node.configuration);
  if (node.type === "condition") return `If ${String(node.configuration.field)} ${String(node.configuration.operator).replaceAll("_", " ")} ${String(node.configuration.value ?? "")}`;
  if (node.type === "goal") return `Goal: ${String(node.configuration.goal_type ?? "configured goal")}`;
  if (node.type === "stop") return `Stop: ${String(node.configuration.reason ?? "configured stop")}`;
  return nodeLabels[node.type] ?? node.type;
}

export default async function WorkflowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireCurrentProfile();
  assertWorkflowPermission(profile, "workflows.read");
  const supabase = await createClient();

  const [
    { data: workflow },
    { data: versions },
    { data: locations },
    { data: contacts },
    { data: enrollments },
    { data: logs },
    { data: testRuns }
  ] = await Promise.all([
    supabase.from("workflows").select("*").eq("id", id).eq("organization_id", profile.organizationId).single(),
    supabase.from("workflow_versions").select("id, version_number, status, definition_json, validation_snapshot, created_at, published_at").eq("workflow_id", id).order("version_number", { ascending: false }),
    supabase.from("workflow_locations").select("location_id").eq("workflow_id", id).eq("organization_id", profile.organizationId),
    supabase.from("contacts").select("id, first_name, last_name").eq("organization_id", profile.organizationId).order("last_name").limit(200),
    supabase.from("workflow_enrollments").select("id, status, current_node_id, enrolled_at, completed_at, stopped_at, stop_reason, contacts(first_name, last_name), workflow_scheduled_jobs(run_at, status)").eq("workflow_id", id).eq("organization_id", profile.organizationId).order("created_at", { ascending: false }).limit(50),
    supabase.from("workflow_event_logs").select("id, event_type, message, created_at, metadata").eq("workflow_id", id).eq("organization_id", profile.organizationId).order("created_at", { ascending: false }).limit(100),
    supabase.from("workflow_test_runs").select("id, status, output_snapshot, created_at, contacts(first_name, last_name)").eq("workflow_id", id).eq("organization_id", profile.organizationId).order("created_at", { ascending: false }).limit(10)
  ]);

  if (!workflow) notFound();
  const workflowRow = workflow as unknown as WorkflowDetail;
  const versionRows = (versions ?? []) as unknown as VersionRow[];
  const draft = versionRows.find((version) => version.status === "draft") ?? versionRows[0];
  const definition = draft?.definition_json ?? { nodes: [], edges: [] };
  const validation = validateWorkflowDefinition(definition);
  const summary = workflowSummary(definition);
  const selectedLocationIds = (locations ?? []).map((location) => location.location_id);
  const contactOptions = (contacts ?? []).map((contact) => ({ id: contact.id, name: `${contact.first_name} ${contact.last_name}` }));
  const enrollmentRows = (enrollments ?? []) as unknown as EnrollmentRow[];
  const logRows = (logs ?? []) as unknown as LogRow[];
  const testRunRows = (testRuns ?? []) as unknown as TestRunRow[];

  return (
    <div className="page-stack">
      <PageHeader
        action={<WorkflowTopActions status={workflowRow.status} workflowId={workflowRow.id} />}
        description={workflowRow.description ?? "Workflow builder, test runner, enrollment monitor, and execution history."}
        title={workflowRow.name}
      />
      <section className="metric-grid">
        <StatCard detail={categoryLabels[workflowRow.category] ?? workflowRow.category} label="Category" value={statusLabels[workflowRow.status] ?? workflowRow.status} />
        <StatCard detail="Active definition" label="Version" value={String(workflowRow.version ?? 1)} />
        <StatCard detail="Configured definition" label="SMS Actions" value={String(summary.smsActions)} />
        <StatCard detail="Configured definition" label="Waits" value={String(summary.waits)} />
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Live Safety Summary</h2><span>Publish does not enroll historical contacts</span></div>
        <div className="placeholder-metrics compact">
          <div><strong>{workflowRow.location_scope === "all" ? "All Allowed" : selectedLocationIds.length}</strong><span>Locations</span></div>
          <div><strong>{summary.smsActions}</strong><span>SMS actions</span></div>
          <div><strong>{summary.smsActions}</strong><span>Max messages per enrollment</span></div>
          <div><strong>{workflowRow.test_mode ? "Simulated" : "Live-ready"}</strong><span>Communication mode</span></div>
        </div>
      </section>
      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Builder</h2><span>{validation.ok ? "Validatable" : `${validation.errors.length} errors`}</span></div>
          <div className="workflow-flow">
            {definition.nodes.map((node, index) => (
              <article className={`workflow-node ${node.type}`} key={node.id}>
                <div>
                  <span>{index + 1}</span>
                  <strong>{nodeLabels[node.type] ?? node.type}</strong>
                </div>
                <p>{nodePreview(node)}</p>
                <NodeReorderControls nodeId={node.id} workflowId={workflowRow.id} />
              </article>
            ))}
          </div>
          <details className="panel nested-panel"><summary className="summary-action">Add Trigger / Step / Condition / Wait / Action</summary><AddWorkflowNodeForm workflowId={workflowRow.id} /></details>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Validate Workflow</h2><span>Pre-publish checks</span></div>
          {validation.errors.length ? <div className="record-list">{validation.errors.map((error) => <article key={error}><strong>Error</strong><p>{error}</p></article>)}</div> : <p className="form-success">Validation passed.</p>}
          {validation.warnings.length ? <div className="record-list">{validation.warnings.map((warning) => <article key={warning}><strong>Warning</strong><p>{warning}</p></article>)}</div> : null}
          <div className="placeholder-metrics compact">
            <div><strong>{String(summary.trigger)}</strong><span>Trigger</span></div>
            <div><strong>{summary.conditions}</strong><span>Conditions</span></div>
            <div><strong>{summary.waits}</strong><span>Waits</span></div>
            <div><strong>{validation.summary.estimatedMaxDurationMinutes}</strong><span>Estimated minutes</span></div>
          </div>
        </section>
      </section>
      {hasWorkflowPermission(profile, "workflows.edit") ? (
        <section className="dashboard-grid">
          <section className="panel">
            <div className="panel-header"><h2>Test Mode</h2><span>No live SMS</span></div>
            <WorkflowTestForm contacts={contactOptions} workflowId={workflowRow.id} />
            <div className="record-list">
              {testRunRows.map((run) => {
                const contact = firstRelation(run.contacts);
                return <article key={run.id}><strong>{contact?.first_name} {contact?.last_name} - {run.status}</strong><p>{formatDate(run.created_at)}</p><span>{run.output_snapshot?.steps?.map((step) => `${step.nodeId}: ${step.status}`).join(" | ")}</span></article>;
              })}
            </div>
          </section>
          <section className="panel">
            <div className="panel-header"><h2>Definition JSON</h2><span>Version-safe draft editing</span></div>
            <WorkflowDefinitionForm definition={definition} workflowId={workflowRow.id} />
          </section>
        </section>
      ) : null}
      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Enrollments</h2><span>{enrollmentRows.length} latest</span></div>
          {workflowRow.status === "active" && hasWorkflowPermission(profile, "workflows.enroll") ? <details><summary className="summary-action">Manual Enrollment</summary><ManualEnrollmentForm contacts={contactOptions} workflowId={workflowRow.id} /></details> : null}
          <div className="record-list">
            {enrollmentRows.map((enrollment) => {
              const contact = firstRelation(enrollment.contacts);
              const nextJob = (enrollment.workflow_scheduled_jobs ?? []).find((job) => job.status === "scheduled");
              return (
                <article key={enrollment.id}>
                  <strong>{contact?.first_name ?? "Unknown"} {contact?.last_name ?? ""}</strong>
                  <p>{statusLabels[String(enrollment.status)] ?? enrollment.status} - started {formatDate(enrollment.enrolled_at)}</p>
                  <span>Current step {enrollment.current_node_id ?? "not started"} - next scheduled {formatDate(nextJob?.run_at ?? null)}</span>
                  {enrollment.status === "failed" ? <RetryEnrollmentForm enrollmentId={enrollment.id} /> : null}
                  {["active", "waiting", "failed"].includes(String(enrollment.status)) ? <details><summary className="summary-action">Stop</summary><StopEnrollmentForm enrollmentId={enrollment.id} /></details> : null}
                </article>
              );
            })}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Execution Logs</h2><span>Latest 100</span></div>
          <div className="record-list">
            {logRows.map((log) => <article key={log.id}><strong>{log.event_type}</strong><p>{log.message}</p><span>{formatDate(log.created_at)}</span></article>)}
          </div>
        </section>
      </section>
      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Version History</h2><span>Published versions are immutable</span></div>
          <div className="record-list">{versionRows.map((version) => <article key={version.id}><strong>Version {version.version_number}</strong><p>{version.status} - created {formatDate(version.created_at)} - published {formatDate(version.published_at)}</p></article>)}</div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Settings</h2><span>Enrollment, rate limits, quiet hours</span></div>
          <WorkflowSettingsForm locations={profile.locations} selectedLocationIds={selectedLocationIds} workflow={workflowRow as unknown as Record<string, string | number | boolean | null>} />
        </section>
      </section>
      <Link className="strong-link" href="/automations">Back to automations</Link>
    </div>
  );
}
