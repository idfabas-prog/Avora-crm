import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { assertWorkflowPermission } from "@/lib/workflows/permissions";
import {
  activeDefinition,
  buildEnrollmentPayload,
  firstExecutableNode,
  jobRunAtForNode,
  nextNode,
  workflowAllowsEventLocation,
  type ProcessableWorkflow
} from "@/lib/workflows/executor";
import { jobIdempotencyKey } from "@/lib/workflows/scheduler";
import { workflowMatchesEvent } from "@/lib/workflows/triggers";
import type { DomainEvent, WorkflowDefinition, WorkflowNode } from "@/lib/workflows/types";

type QueryResult = { data: unknown[] | null; error: { message: string } | null };
type SingleResult = { data: Record<string, unknown> | null; error: { message: string } | null };
type LooseQuery = PromiseLike<QueryResult> & {
  eq: (column: string, value: string) => LooseQuery;
  is: (column: string, value: null) => LooseQuery;
  in: (column: string, values: string[]) => LooseQuery;
  order: (column: string, options?: { ascending?: boolean }) => LooseQuery;
  limit: (count: number) => LooseQuery;
  select: (columns: string) => LooseQuery;
  single: () => Promise<SingleResult>;
};
type LooseTable = {
  select: (columns: string) => LooseQuery;
  insert: (payload: unknown) => LooseQuery & { select: (columns: string) => LooseQuery };
  update: (payload: unknown) => LooseQuery;
  upsert: (payload: unknown, options?: Record<string, unknown>) => LooseQuery & { select: (columns: string) => LooseQuery };
};
type LooseSupabase = {
  from: (table: string) => LooseTable;
  rpc: (name: string, args?: Record<string, unknown>) => Promise<QueryResult>;
};

function asDomainEvent(row: Record<string, unknown>): DomainEvent {
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  return {
    organizationId: String(row.organization_id),
    eventType: String(row.event_type),
    entityType: String(row.entity_type),
    entityId: row.entity_id ? String(row.entity_id) : null,
    locationId: payload.locationId ? String(payload.locationId) : payload.location_id ? String(payload.location_id) : null,
    contactId: payload.contactId ? String(payload.contactId) : payload.contact_id ? String(payload.contact_id) : null,
    opportunityId: payload.opportunityId ? String(payload.opportunityId) : payload.opportunity_id ? String(payload.opportunity_id) : null,
    appointmentId: payload.appointmentId ? String(payload.appointmentId) : payload.appointment_id ? String(payload.appointment_id) : null,
    saleId: payload.saleId ? String(payload.saleId) : payload.sale_id ? String(payload.sale_id) : null,
    payload
  };
}

async function processEvents(db: LooseSupabase, organizationId: string) {
  const [{ data: events }, { data: workflows }] = await Promise.all([
    db.from("domain_events").select("*").eq("organization_id", organizationId).is("processed_at", null).order("occurred_at").limit(25),
    db.from("workflows").select("id, organization_id, status, active_version_id, enrollment_policy, location_scope, workflow_locations(location_id), workflow_versions!workflows_active_version_id_fkey(definition_json)").eq("organization_id", organizationId).eq("status", "active")
  ]);

  let enrollments = 0;

  for (const eventRow of (events ?? []) as Record<string, unknown>[]) {
    const event = asDomainEvent(eventRow);
    for (const workflow of (workflows ?? []) as unknown as ProcessableWorkflow[]) {
      const definition = activeDefinition(workflow);
      if (!definition || !workflow.active_version_id) continue;
      if (!workflowAllowsEventLocation(workflow, event)) continue;
      if (!workflowMatchesEvent(definition, event)) continue;

      const payload = buildEnrollmentPayload(workflow, event, String(eventRow.id));
      const { data: enrollmentResult, error } = await db
        .from("workflow_enrollments")
        .upsert(payload, { onConflict: "organization_id,workflow_id,enrollment_key" })
        .select("id")
        .single();

      if (error || !enrollmentResult?.id) continue;

      const enrollmentId = String(enrollmentResult.id);
      const firstNode = firstExecutableNode(definition);
      await db.from("workflow_event_logs").insert({
        organization_id: organizationId,
        workflow_id: workflow.id,
        enrollment_id: enrollmentId,
        event_type: "Enrollment Created",
        message: `Enrolled from ${event.eventType}.`,
        metadata: { domain_event_id: eventRow.id }
      });

      if (firstNode) {
        await db.from("workflow_scheduled_jobs").upsert({
          organization_id: organizationId,
          workflow_id: workflow.id,
          workflow_version_id: workflow.active_version_id,
          enrollment_id: enrollmentId,
          node_id: firstNode.id,
          run_at: jobRunAtForNode(firstNode).toISOString(),
          status: "scheduled",
          idempotency_key: jobIdempotencyKey(enrollmentId, firstNode.id)
        }, { onConflict: "organization_id,idempotency_key" });
      }
      enrollments += 1;
    }
    await db.from("domain_events").update({ processed_at: new Date().toISOString() }).eq("id", String(eventRow.id));
  }

  return { events: events?.length ?? 0, enrollments };
}

async function completeJob(db: LooseSupabase, job: Record<string, unknown>, node: WorkflowNode | null, definition: WorkflowDefinition | null) {
  const now = new Date().toISOString();
  if (!node || !definition) {
    await db.from("workflow_scheduled_jobs").update({ status: "failed", last_error: "Workflow node was not found", completed_at: now }).eq("id", String(job.id));
    return "failed";
  }

  await db.from("workflow_execution_steps").insert({
    enrollment_id: job.enrollment_id,
    node_id: node.id,
    node_type: node.type,
    status: node.type === "wait" ? "waiting" : "completed",
    started_at: now,
    completed_at: now,
    attempt_number: Number(job.attempts ?? 1),
    input_snapshot: { scheduled_job_id: job.id },
    output_snapshot: { simulated: true, configuration: node.configuration },
    idempotency_key: `step:${job.enrollment_id}:${node.id}:${job.attempts ?? 1}`
  });

  await db.from("workflow_event_logs").insert({
    organization_id: job.organization_id,
    workflow_id: job.workflow_id,
    enrollment_id: job.enrollment_id,
    event_type: node.type === "wait" ? "Wait Resumed" : "Node Completed",
    message: `${node.type} node ${node.id} processed by development worker.`,
    metadata: { node_type: node.type }
  });

  if (node.type === "action") {
    await db.from("workflow_action_executions").upsert({
      organization_id: job.organization_id,
      enrollment_id: job.enrollment_id,
      node_id: node.id,
      action_type: String(node.configuration.action_type ?? "unknown"),
      idempotency_key: `action:${job.enrollment_id}:${node.id}`,
      status: "completed",
      result: { simulated: true },
      completed_at: now
    }, { onConflict: "organization_id,idempotency_key" });
  }

  const next = nextNode(definition, node.id);
  if (next) {
    await db.from("workflow_scheduled_jobs").upsert({
      organization_id: job.organization_id,
      workflow_id: job.workflow_id,
      workflow_version_id: job.workflow_version_id,
      enrollment_id: job.enrollment_id,
      node_id: next.id,
      run_at: jobRunAtForNode(next).toISOString(),
      status: "scheduled",
      idempotency_key: jobIdempotencyKey(String(job.enrollment_id), next.id)
    }, { onConflict: "organization_id,idempotency_key" });
    await db.from("workflow_enrollments").update({ status: next.type === "wait" ? "waiting" : "active", current_node_id: next.id }).eq("id", String(job.enrollment_id));
  } else {
    await db.from("workflow_enrollments").update({ status: "completed", completed_at: now, current_node_id: node.id }).eq("id", String(job.enrollment_id));
    await db.from("workflow_event_logs").insert({
      organization_id: job.organization_id,
      workflow_id: job.workflow_id,
      enrollment_id: job.enrollment_id,
      event_type: "Workflow Completed",
      message: "Workflow reached the end of its current version.",
      metadata: {}
    });
  }

  await db.from("workflow_scheduled_jobs").update({ status: "completed", completed_at: now }).eq("id", String(job.id));
  return "completed";
}

async function processJobs(db: LooseSupabase) {
  const { data: claimed } = await db.rpc("claim_due_workflow_jobs", { batch_size: 10, worker_id: "next-route-development-worker" });
  let completed = 0;
  let failed = 0;

  for (const job of (claimed ?? []) as Record<string, unknown>[]) {
    const { data: versionRows } = await db.from("workflow_versions").select("definition_json").eq("id", String(job.workflow_version_id)).limit(1);
    const version = (versionRows?.[0] ?? null) as { definition_json?: WorkflowDefinition } | null;
    const definition = version?.definition_json ?? null;
    const node = definition?.nodes.find((item) => item.id === job.node_id) ?? null;
    const result = await completeJob(db, job, node, definition);
    if (result === "completed") completed += 1;
    else failed += 1;
  }

  return { claimed: claimed?.length ?? 0, completed, failed };
}

export async function GET(request: NextRequest) {
  const profile = await requireCurrentProfile();
  assertWorkflowPermission(profile, "workflows.edit");
  const supabase = await createClient();
  const db = supabase as unknown as LooseSupabase;
  const mode = request.nextUrl.searchParams.get("mode") ?? "all";
  const events = mode === "jobs" ? { events: 0, enrollments: 0 } : await processEvents(db, profile.organizationId);
  const jobs = mode === "events" ? { claimed: 0, completed: 0, failed: 0 } : await processJobs(db);
  return Response.json({ events, jobs });
}
