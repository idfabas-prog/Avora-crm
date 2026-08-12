import Link from "next/link";
import { CreateWorkflowForm } from "@/components/crm/WorkflowForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { categoryLabels, statusLabels, workflowCategories } from "@/lib/workflows/constants";
import { assertWorkflowPermission, hasWorkflowPermission } from "@/lib/workflows/permissions";

type WorkflowRow = {
  id: string;
  name: string;
  category: string;
  status: string;
  version: number | null;
  published_at: string | null;
  location_scope: string | null;
  workflow_enrollments: Array<{ status: string | null }> | null;
  workflow_event_logs: Array<{ created_at: string | null }> | null;
};

function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function AutomationsPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; category?: string; location?: string }>;
}) {
  const profile = await requireCurrentProfile();
  assertWorkflowPermission(profile, "workflows.read");
  const filters = await searchParams;
  const supabase = await createClient();
  const selectedLocationId = await getSelectedLocationId(profile);
  const scopedLocationIds = filters.location ? [filters.location] : allowedLocationIds(profile, selectedLocationId);

  let query = supabase
    .from("workflows")
    .select("id, name, category, status, version, published_at, location_scope, workflow_enrollments(status), workflow_event_logs(created_at)")
    .eq("organization_id", profile.organizationId)
    .order("updated_at", { ascending: false });

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.category) query = query.eq("category", filters.category);

  const { data } = await query;
  const workflows = (data ?? []) as unknown as WorkflowRow[];
  const visibleWorkflows = filters.location
    ? workflows.filter((workflow) => workflow.location_scope === "all" || scopedLocationIds.length > 0)
    : workflows;
  const totalEnrollments = visibleWorkflows.reduce((sum, workflow) => sum + (workflow.workflow_enrollments?.length ?? 0), 0);
  const activeEnrollments = visibleWorkflows.reduce((sum, workflow) => sum + (workflow.workflow_enrollments?.filter((item) => ["active", "waiting"].includes(String(item.status))).length ?? 0), 0);
  const failedEnrollments = visibleWorkflows.reduce((sum, workflow) => sum + (workflow.workflow_enrollments?.filter((item) => item.status === "failed").length ?? 0), 0);

  return (
    <div className="page-stack">
      <PageHeader
        description="Visual workflow automation for triggers, waits, branches, safe communication actions, enrollments, logs, and testing."
        title="Automations"
      />
      <section className="metric-grid">
        <StatCard detail="Definitions" label="Workflows" value={String(visibleWorkflows.length)} />
        <StatCard detail="All runs" label="Enrollments" value={String(totalEnrollments)} />
        <StatCard detail="Active or waiting" label="In Progress" value={String(activeEnrollments)} />
        <StatCard detail="Needs attention" label="Failed" value={String(failedEnrollments)} />
      </section>
      <section className="panel">
        <form className="query-toolbar">
          <label className="filter-control"><span>Status</span><select defaultValue={filters.status ?? ""} name="status"><option value="">All</option>{["draft", "active", "paused", "archived"].map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label>
          <label className="filter-control"><span>Category</span><select defaultValue={filters.category ?? ""} name="category"><option value="">All</option>{workflowCategories.map((category) => <option key={category} value={category}>{categoryLabels[category]}</option>)}</select></label>
          <label className="filter-control"><span>Location</span><select defaultValue={filters.location ?? ""} name="location"><option value="">Current scope</option>{profile.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
          <button type="submit">Filter</button>
        </form>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Name</th><th>Category</th><th>Status</th><th>Version</th><th>Enrolled</th><th>Active</th><th>Completed</th><th>Failed</th><th>Last Published</th><th>Last Run</th></tr>
            </thead>
            <tbody>
              {visibleWorkflows.map((workflow) => {
                const enrollments = workflow.workflow_enrollments ?? [];
                const lastRun = (workflow.workflow_event_logs ?? []).map((log) => log.created_at).filter(Boolean).sort().at(-1) ?? null;
                return (
                  <tr key={workflow.id}>
                    <td><Link className="strong-link" href={`/automations/${workflow.id}`}>{workflow.name}</Link></td>
                    <td>{categoryLabels[workflow.category] ?? workflow.category}</td>
                    <td><StatusBadge status={statusLabels[workflow.status] ?? workflow.status} /></td>
                    <td>{workflow.version ?? 1}</td>
                    <td>{enrollments.length}</td>
                    <td>{enrollments.filter((item) => ["active", "waiting"].includes(String(item.status))).length}</td>
                    <td>{enrollments.filter((item) => item.status === "completed").length}</td>
                    <td>{enrollments.filter((item) => item.status === "failed").length}</td>
                    <td>{formatDate(workflow.published_at)}</td>
                    <td>{formatDate(lastRun)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      {hasWorkflowPermission(profile, "workflows.create") ? (
        <details className="panel">
          <summary className="summary-action">New Workflow</summary>
          <CreateWorkflowForm />
        </details>
      ) : null}
    </div>
  );
}
