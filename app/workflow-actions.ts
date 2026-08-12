"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { assertWorkflowPermission } from "@/lib/workflows/permissions";
import { categoryLabels } from "@/lib/workflows/constants";
import { enrollmentKeyFor } from "@/lib/workflows/enrollment";
import { executeWorkflowTest } from "@/lib/workflows/engine";
import { validateWorkflowDefinition } from "@/lib/workflows/validation";
import type { WorkflowDefinition, WorkflowNode, WorkflowNodeType } from "@/lib/workflows/types";

function required(value: FormDataEntryValue | null, label: string) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function optional(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

function parseJsonDefinition(value: FormDataEntryValue | null): WorkflowDefinition {
  const text = required(value, "Definition JSON");
  const parsed = JSON.parse(text) as WorkflowDefinition;
  return { nodes: parsed.nodes ?? [], edges: parsed.edges ?? [] };
}

function emptyDefinition(triggerType = "manual.enrolled"): WorkflowDefinition {
  return {
    nodes: [
      {
        id: "trigger_manual",
        type: "trigger",
        position: { x: 360, y: 40 },
        configuration: { trigger_type: triggerType, filters: [] }
      }
    ],
    edges: []
  };
}

function nextNodeId(type: string, key: string) {
  return `${type}_${key.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}_${crypto.randomUUID().slice(0, 8)}`;
}

function nodeFromForm(formData: FormData, index: number): WorkflowNode {
  const nodeType = required(formData.get("node_type"), "Node type") as WorkflowNodeType;
  const libraryKey = required(formData.get("library_key"), "Node");
  const id = nextNodeId(nodeType, libraryKey);
  const position = { x: nodeType === "condition" ? 480 : 360, y: 40 + index * 130 };

  if (nodeType === "trigger") {
    return { id, type: nodeType, position, configuration: { trigger_type: libraryKey, filters: [] } };
  }
  if (nodeType === "wait") {
    return {
      id,
      type: nodeType,
      position,
      configuration: {
        wait_type: libraryKey,
        amount: Number(optional(formData.get("wait_amount")) ?? "1"),
        unit: optional(formData.get("wait_unit")) ?? "day",
        offset_amount: Number(optional(formData.get("offset_amount")) ?? "24"),
        offset_unit: optional(formData.get("offset_unit")) ?? "hour",
        direction: optional(formData.get("direction")) ?? "before",
        timeout_amount: Number(optional(formData.get("timeout_amount")) ?? "3"),
        timeout_unit: optional(formData.get("timeout_unit")) ?? "day"
      }
    };
  }
  if (nodeType === "condition") {
    return {
      id,
      type: nodeType,
      position,
      configuration: {
        field: required(formData.get("condition_field"), "Condition field"),
        operator: required(formData.get("condition_operator"), "Condition operator"),
        value: optional(formData.get("condition_value"))
      }
    };
  }
  if (nodeType === "goal") {
    return { id, type: nodeType, position, configuration: { goal_type: optional(formData.get("label")) ?? "custom" } };
  }
  if (nodeType === "stop") {
    return { id, type: nodeType, position, configuration: { reason: optional(formData.get("label")) ?? "Stopped by workflow" } };
  }
  return {
    id,
    type: "action",
    position,
    configuration: {
      action_type: libraryKey,
      body: optional(formData.get("body")),
      title: optional(formData.get("title")),
      target_stage: optional(formData.get("target_stage")),
      simulated: true
    }
  };
}

function appendLinear(definition: WorkflowDefinition, node: WorkflowNode) {
  const nodes = node.type === "trigger"
    ? [node, ...definition.nodes.filter((existing) => existing.type !== "trigger")]
    : [...definition.nodes, node];
  const previous = node.type === "trigger" ? null : nodes[nodes.length - 2];
  const edges = previous
    ? [...definition.edges, { source: previous.id, target: node.id, label: previous.type === "wait" ? "RESUME" : "SUCCESS" }]
    : definition.edges;
  return { nodes, edges };
}

function reorderDefinition(definition: WorkflowDefinition, nodeId: string, direction: "up" | "down") {
  const trigger = definition.nodes.find((node) => node.type === "trigger");
  const steps = definition.nodes.filter((node) => node.type !== "trigger");
  const index = steps.findIndex((node) => node.id === nodeId);
  if (index < 0) return definition;
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= steps.length) return definition;
  const copy = [...steps];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  const nodes = trigger ? [trigger, ...copy] : copy;
  const edges = nodes.slice(0, -1).map((node, idx) => ({
    source: node.id,
    target: nodes[idx + 1].id,
    label: node.type === "condition" ? "YES" : node.type === "wait" ? "RESUME" : "SUCCESS"
  }));
  return { nodes, edges };
}

async function getEditableDraftVersion(workflowId: string) {
  const profile = await requireCurrentProfile();
  assertWorkflowPermission(profile, "workflows.edit");
  const supabase = await createClient();

  const { data: draft } = await supabase
    .from("workflow_versions")
    .select("id, version_number, definition_json, status")
    .eq("workflow_id", workflowId)
    .eq("status", "draft")
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (draft) return draft;

  const { data: latest } = await supabase
    .from("workflow_versions")
    .select("version_number, definition_json")
    .eq("workflow_id", workflowId)
    .order("version_number", { ascending: false })
    .limit(1)
    .single();

  const { data: created, error } = await supabase
    .from("workflow_versions")
    .insert({
      workflow_id: workflowId,
      version_number: Number(latest?.version_number ?? 0) + 1,
      definition_json: latest?.definition_json ?? emptyDefinition(),
      status: "draft",
      created_by: profile.id
    })
    .select("id, version_number, definition_json, status")
    .single();

  if (error || !created) throw new Error(error?.message ?? "Could not create draft version");
  return created;
}

async function audit(action: string, entityTable: string, entityId: string | null, metadata: Record<string, unknown> = {}) {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  await supabase.from("audit_logs").insert({
    organization_id: profile.organizationId,
    actor_id: profile.id,
    action,
    entity_table: entityTable,
    entity_id: entityId,
    metadata
  });
}

export async function createWorkflow(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertWorkflowPermission(profile, "workflows.create");
  const supabase = await createClient();
  const name = required(formData.get("name"), "Workflow name");
  const category = required(formData.get("category"), "Category");
  if (!categoryLabels[category]) throw new Error("Choose a valid category");

  const { data: workflow, error } = await supabase
    .from("workflows")
    .insert({
      organization_id: profile.organizationId,
      name,
      description: optional(formData.get("description")),
      category,
      location_scope: required(formData.get("location_scope"), "Location scope"),
      enrollment_policy: required(formData.get("enrollment_policy"), "Enrollment policy"),
      re_enrollment_policy: required(formData.get("re_enrollment_policy"), "Re-enrollment policy"),
      test_mode: true,
      created_by: profile.id,
      updated_by: profile.id
    })
    .select("id")
    .single();

  if (error || !workflow) throw new Error(error?.message ?? "Could not create workflow");

  const { error: versionError } = await supabase.from("workflow_versions").insert({
    workflow_id: workflow.id,
    version_number: 1,
    definition_json: emptyDefinition(required(formData.get("trigger_type"), "Trigger")),
    status: "draft",
    created_by: profile.id
  });
  if (versionError) throw new Error(versionError.message);

  await audit("Workflow Created", "workflows", workflow.id, { category });
  revalidatePath("/automations");
  redirect(`/automations/${workflow.id}`);
}

export async function saveWorkflowSettings(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertWorkflowPermission(profile, "workflows.edit");
  const supabase = await createClient();
  const workflowId = required(formData.get("workflow_id"), "Workflow");
  const locationScope = required(formData.get("location_scope"), "Location scope");
  const selectedLocations = formData.getAll("location_ids").map(String).filter(Boolean);
  const allowedIds = profile.locations.map((location) => location.id);

  for (const locationId of selectedLocations) {
    if (!allowedIds.includes(locationId)) throw new Error("Selected location is not available for this user");
  }

  const { error } = await supabase
    .from("workflows")
    .update({
      name: required(formData.get("name"), "Workflow name"),
      description: optional(formData.get("description")),
      category: required(formData.get("category"), "Category"),
      location_scope: locationScope,
      enrollment_policy: required(formData.get("enrollment_policy"), "Enrollment policy"),
      re_enrollment_policy: required(formData.get("re_enrollment_policy"), "Re-enrollment policy"),
      failure_policy: required(formData.get("failure_policy"), "Failure policy"),
      test_mode: formData.get("test_mode") === "on",
      max_sms_per_minute: Number(required(formData.get("max_sms_per_minute"), "SMS rate limit")),
      max_enrollments_per_batch: Number(required(formData.get("max_enrollments_per_batch"), "Batch limit")),
      quiet_hours_start: required(formData.get("quiet_hours_start"), "Quiet hours start"),
      quiet_hours_end: required(formData.get("quiet_hours_end"), "Quiet hours end"),
      respect_business_days: formData.get("respect_business_days") === "on",
      updated_by: profile.id
    })
    .eq("id", workflowId)
    .eq("organization_id", profile.organizationId);

  if (error) throw new Error(error.message);

  await supabase.from("workflow_locations").delete().eq("workflow_id", workflowId).eq("organization_id", profile.organizationId);
  if (locationScope === "specific" && selectedLocations.length) {
    const { error: locationError } = await supabase.from("workflow_locations").insert(selectedLocations.map((locationId) => ({
      organization_id: profile.organizationId,
      workflow_id: workflowId,
      location_id: locationId
    })));
    if (locationError) throw new Error(locationError.message);
  }

  await audit("Workflow Settings Updated", "workflows", workflowId);
  revalidatePath(`/automations/${workflowId}`);
  revalidatePath("/automations");
}

export async function saveWorkflowDefinition(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertWorkflowPermission(profile, "workflows.edit");
  const supabase = await createClient();
  const workflowId = required(formData.get("workflow_id"), "Workflow");
  const draft = await getEditableDraftVersion(workflowId);
  const definition = parseJsonDefinition(formData.get("definition_json"));
  const validation = validateWorkflowDefinition(definition);
  const { error } = await supabase
    .from("workflow_versions")
    .update({ definition_json: definition, validation_snapshot: validation })
    .eq("id", draft.id);
  if (error) throw new Error(error.message);
  await audit("Workflow Draft Saved", "workflow_versions", draft.id, { workflow_id: workflowId });
  revalidatePath(`/automations/${workflowId}`);
}

export async function addWorkflowNode(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertWorkflowPermission(profile, "workflows.edit");
  const supabase = await createClient();
  const workflowId = required(formData.get("workflow_id"), "Workflow");
  const draft = await getEditableDraftVersion(workflowId);
  const definition = draft.definition_json as WorkflowDefinition;
  const node = nodeFromForm(formData, definition.nodes.length + 1);
  const nextDefinition = appendLinear(definition, node);
  const validation = validateWorkflowDefinition(nextDefinition);
  const { error } = await supabase
    .from("workflow_versions")
    .update({ definition_json: nextDefinition, validation_snapshot: validation })
    .eq("id", draft.id);
  if (error) throw new Error(error.message);
  await audit("Workflow Node Added", "workflow_versions", draft.id, { workflow_id: workflowId, node_type: node.type });
  revalidatePath(`/automations/${workflowId}`);
}

export async function reorderWorkflowNode(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertWorkflowPermission(profile, "workflows.edit");
  const supabase = await createClient();
  const workflowId = required(formData.get("workflow_id"), "Workflow");
  const draft = await getEditableDraftVersion(workflowId);
  const nextDefinition = reorderDefinition(draft.definition_json as WorkflowDefinition, required(formData.get("node_id"), "Node"), required(formData.get("direction"), "Direction") as "up" | "down");
  const validation = validateWorkflowDefinition(nextDefinition);
  const { error } = await supabase.from("workflow_versions").update({ definition_json: nextDefinition, validation_snapshot: validation }).eq("id", draft.id);
  if (error) throw new Error(error.message);
  revalidatePath(`/automations/${workflowId}`);
}

export async function publishWorkflow(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertWorkflowPermission(profile, "workflows.publish");
  const supabase = await createClient();
  const workflowId = required(formData.get("workflow_id"), "Workflow");
  const draft = await getEditableDraftVersion(workflowId);
  const definition = draft.definition_json as WorkflowDefinition;
  const validation = validateWorkflowDefinition(definition);
  if (!validation.ok) {
    throw new Error(`Fix workflow validation errors before publishing: ${validation.errors.join(" ")}`);
  }

  await supabase.from("workflow_versions").update({ status: "retired" }).eq("workflow_id", workflowId).eq("status", "published");
  const { error: versionError } = await supabase
    .from("workflow_versions")
    .update({ status: "published", validation_snapshot: validation, published_at: new Date().toISOString() })
    .eq("id", draft.id);
  if (versionError) throw new Error(versionError.message);

  const { error: workflowError } = await supabase
    .from("workflows")
    .update({ status: "active", active_version_id: draft.id, version: draft.version_number, published_at: new Date().toISOString(), updated_by: profile.id })
    .eq("id", workflowId)
    .eq("organization_id", profile.organizationId);
  if (workflowError) throw new Error(workflowError.message);

  await audit("Workflow Published", "workflows", workflowId, { version_id: draft.id, safety: "No historical records enrolled automatically" });
  revalidatePath(`/automations/${workflowId}`);
  revalidatePath("/automations");
}

export async function pauseWorkflow(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertWorkflowPermission(profile, "workflows.pause");
  const supabase = await createClient();
  const workflowId = required(formData.get("workflow_id"), "Workflow");
  const status = required(formData.get("status"), "Status");
  if (!["paused", "archived", "active"].includes(status)) throw new Error("Unsupported workflow status");
  const { error } = await supabase.from("workflows").update({ status, updated_by: profile.id }).eq("id", workflowId).eq("organization_id", profile.organizationId);
  if (error) throw new Error(error.message);
  await audit(status === "paused" ? "Workflow Paused" : status === "archived" ? "Workflow Archived" : "Workflow Resumed", "workflows", workflowId);
  revalidatePath(`/automations/${workflowId}`);
  revalidatePath("/automations");
}

export async function duplicateWorkflow(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertWorkflowPermission(profile, "workflows.create");
  const supabase = await createClient();
  const workflowId = required(formData.get("workflow_id"), "Workflow");
  const { data: source } = await supabase.from("workflows").select("*, workflow_versions!workflows_active_version_id_fkey(definition_json)").eq("id", workflowId).eq("organization_id", profile.organizationId).single();
  if (!source) throw new Error("Workflow not found");
  const { data: created, error } = await supabase.from("workflows").insert({
    organization_id: profile.organizationId,
    name: `${source.name} Copy`,
    description: source.description,
    category: source.category,
    status: "draft",
    location_scope: source.location_scope,
    enrollment_policy: source.enrollment_policy,
    re_enrollment_policy: source.re_enrollment_policy,
    failure_policy: source.failure_policy,
    test_mode: true,
    created_by: profile.id,
    updated_by: profile.id
  }).select("id").single();
  if (error || !created) throw new Error(error?.message ?? "Could not duplicate workflow");
  const relation = Array.isArray(source.workflow_versions) ? source.workflow_versions[0] : source.workflow_versions;
  await supabase.from("workflow_versions").insert({ workflow_id: created.id, version_number: 1, definition_json: relation?.definition_json ?? emptyDefinition(), status: "draft", created_by: profile.id });
  await audit("Workflow Duplicated", "workflows", created.id, { source_workflow_id: workflowId });
  revalidatePath("/automations");
  redirect(`/automations/${created.id}`);
}

export async function runWorkflowTest(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertWorkflowPermission(profile, "workflows.edit");
  const supabase = await createClient();
  const workflowId = required(formData.get("workflow_id"), "Workflow");
  const contactId = required(formData.get("contact_id"), "Test contact");
  const draft = await getEditableDraftVersion(workflowId);
  const { data: contact } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, phone, email, status, lead_source, location_id, locations(name), contact_communication_preferences(allowed, opted_out)")
    .eq("id", contactId)
    .eq("organization_id", profile.organizationId)
    .single();
  if (!contact) throw new Error("Test contact not found");
  const location = Array.isArray(contact.locations) ? contact.locations[0] : contact.locations;
  const preference = Array.isArray(contact.contact_communication_preferences) ? contact.contact_communication_preferences[0] : contact.contact_communication_preferences;
  const steps = executeWorkflowTest(draft.definition_json as WorkflowDefinition, {
    contact: { ...contact, sms_preference: preference },
    location: location ?? undefined,
    testMode: true,
    now: new Date()
  });
  const { error } = await supabase.from("workflow_test_runs").insert({
    organization_id: profile.organizationId,
    workflow_id: workflowId,
    workflow_version_id: draft.id,
    contact_id: contact.id,
    status: steps.some((step) => step.status === "failed") ? "failed" : "completed",
    input_snapshot: { contact_id: contact.id },
    output_snapshot: { steps },
    created_by: profile.id
  });
  if (error) throw new Error(error.message);
  await audit("Workflow Test Run", "workflows", workflowId, { contact_id: contact.id });
  revalidatePath(`/automations/${workflowId}`);
}

export async function manuallyEnrollContact(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertWorkflowPermission(profile, "workflows.enroll");
  const supabase = await createClient();
  const workflowId = required(formData.get("workflow_id"), "Workflow");
  const contactId = required(formData.get("contact_id"), "Contact");
  if (String(formData.get("confirm_enroll") ?? "") !== "yes") throw new Error("Confirm enrollment before submitting");

  const [{ data: workflow }, { data: contact }] = await Promise.all([
    supabase.from("workflows").select("id, organization_id, status, active_version_id, enrollment_policy").eq("id", workflowId).eq("organization_id", profile.organizationId).single(),
    supabase.from("contacts").select("id, location_id").eq("id", contactId).eq("organization_id", profile.organizationId).single()
  ]);
  if (!workflow || workflow.status !== "active" || !workflow.active_version_id) throw new Error("Workflow must be active and published before enrollment");
  if (!contact) throw new Error("Contact not found");
  if (contact.location_id && !profile.locations.some((location) => location.id === contact.location_id)) throw new Error("Selected contact location is not available for this user");

  const enrollmentKey = enrollmentKeyFor(workflow.enrollment_policy, { contactId, triggeringEntityType: "contact", triggeringEntityId: contactId });
  const { data: enrollment, error } = await supabase.from("workflow_enrollments").insert({
    organization_id: profile.organizationId,
    workflow_id: workflow.id,
    workflow_version_id: workflow.active_version_id,
    contact_id: contactId,
    location_id: contact.location_id,
    status: "active",
    current_node_id: null,
    enrollment_key: enrollmentKey,
    test_mode: false,
    metadata: { manual: true, enrolled_by: profile.id }
  }).select("id").single();
  if (error || !enrollment) throw new Error(error?.message ?? "Could not enroll contact");

  await supabase.from("workflow_event_logs").insert({
    organization_id: profile.organizationId,
    workflow_id: workflow.id,
    enrollment_id: enrollment.id,
    event_type: "Enrollment Created",
    message: "Contact manually enrolled. Historical records are not bulk enrolled automatically.",
    actor_id: profile.id
  });
  await audit("Workflow Enrollment Created", "workflow_enrollments", enrollment.id, { workflow_id: workflow.id, contact_id: contactId });
  revalidatePath(`/automations/${workflow.id}`);
  revalidatePath(`/contacts/${contactId}`);
}

export async function stopWorkflowEnrollment(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertWorkflowPermission(profile, "workflows.stop");
  const supabase = await createClient();
  const enrollmentId = required(formData.get("enrollment_id"), "Enrollment");
  const reason = required(formData.get("reason"), "Stop reason");
  const { data: enrollment, error } = await supabase.from("workflow_enrollments").update({
    status: "stopped",
    stopped_at: new Date().toISOString(),
    stop_reason: reason
  }).eq("id", enrollmentId).eq("organization_id", profile.organizationId).select("id, workflow_id, contact_id").single();
  if (error || !enrollment) throw new Error(error?.message ?? "Could not stop enrollment");
  await supabase.from("workflow_event_logs").insert({
    organization_id: profile.organizationId,
    workflow_id: enrollment.workflow_id,
    enrollment_id: enrollment.id,
    event_type: "Workflow Stopped",
    message: reason,
    actor_id: profile.id
  });
  await audit("Workflow Enrollment Stopped", "workflow_enrollments", enrollment.id, { reason });
  revalidatePath(`/automations/${enrollment.workflow_id}`);
  if (enrollment.contact_id) revalidatePath(`/contacts/${enrollment.contact_id}`);
}

export async function retryFailedEnrollment(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertWorkflowPermission(profile, "workflows.edit");
  const supabase = await createClient();
  const enrollmentId = required(formData.get("enrollment_id"), "Enrollment");
  const { data: enrollment, error } = await supabase.from("workflow_enrollments").update({ status: "active" }).eq("id", enrollmentId).eq("organization_id", profile.organizationId).select("id, workflow_id").single();
  if (error || !enrollment) throw new Error(error?.message ?? "Could not retry enrollment");
  await supabase.from("workflow_event_logs").insert({
    organization_id: profile.organizationId,
    workflow_id: enrollment.workflow_id,
    enrollment_id: enrollment.id,
    event_type: "Retry",
    message: "Manual retry requested. Previously completed nodes are not rerun automatically.",
    actor_id: profile.id
  });
  revalidatePath(`/automations/${enrollment.workflow_id}`);
}

export async function filterWorkflowList(formData: FormData) {
  const status = optional(formData.get("status"));
  const category = optional(formData.get("category"));
  const selectedLocationId = optional(formData.get("location_id"));
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (category) params.set("category", category);
  if (selectedLocationId) params.set("location", selectedLocationId);
  redirect(`/automations?${params.toString()}`);
}

export async function selectedWorkflowLocationIds() {
  const profile = await requireCurrentProfile();
  const selectedLocationId = await getSelectedLocationId(profile);
  return allowedLocationIds(profile, selectedLocationId);
}
