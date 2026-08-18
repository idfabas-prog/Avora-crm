"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { assertExpansionPermission } from "@/lib/expansion/permissions";
import { emitDomainEvent } from "@/lib/workflows/server-events";

function required(value: FormDataEntryValue | null, label: string) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function optional(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || null;
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

export async function updateExpansionStage(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertExpansionPermission(profile, "expansion.projects.manage");
  const supabase = await createClient();
  const projectId = required(formData.get("project_id"), "Expansion project");
  const stage = required(formData.get("stage"), "Stage");
  const { error } = await supabase
    .from("expansion_projects")
    .update({ stage, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .eq("organization_id", profile.organizationId);

  if (error) throw new Error(error.message);
  await audit("Expansion Stage Changed", "expansion_projects", projectId, { stage });
  await emitDomainEvent({
    organizationId: profile.organizationId,
    eventType: "expansion.stage_changed",
    entityType: "expansion_project",
    entityId: projectId,
    payload: { stage }
  });
  revalidatePath("/expansion");
  revalidatePath(`/expansion/${projectId}`);
}

export async function updateChecklistItemStatus(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertExpansionPermission(profile, "expansion.checklists.manage");
  const supabase = await createClient();
  const itemId = required(formData.get("checklist_item_id"), "Checklist item");
  const projectId = required(formData.get("project_id"), "Expansion project");
  const status = required(formData.get("status"), "Status");
  const { error } = await supabase
    .from("expansion_checklist_items")
    .update({
      status,
      notes: optional(formData.get("notes")),
      completed_at: status === "complete" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    })
    .eq("id", itemId);

  if (error) throw new Error(error.message);
  await audit("Expansion Checklist Updated", "expansion_checklist_items", itemId, { status });
  await emitDomainEvent({
    organizationId: profile.organizationId,
    eventType: status === "complete" ? "expansion.readiness_threshold" : "expansion.checklist_overdue",
    entityType: "expansion_checklist_item",
    entityId: itemId,
    payload: { project_id: projectId, status }
  });
  revalidatePath(`/expansion/${projectId}`);
  revalidatePath(`/expansion/${projectId}/readiness`);
}

export async function updateExpansionSiteStatus(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertExpansionPermission(profile, "expansion.sites.manage");
  const supabase = await createClient();
  const siteId = required(formData.get("site_id"), "Site");
  const projectId = required(formData.get("project_id"), "Expansion project");
  const status = required(formData.get("status"), "Status");
  const { error } = await supabase
    .from("expansion_sites")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", siteId);

  if (error) throw new Error(error.message);
  await audit(status === "selected" ? "Expansion Site Selected" : "Expansion Site Updated", "expansion_sites", siteId, { status });
  await emitDomainEvent({
    organizationId: profile.organizationId,
    eventType: status === "selected" ? "expansion.site_selected" : "expansion.stage_changed",
    entityType: "expansion_site",
    entityId: siteId,
    payload: { project_id: projectId, status }
  });
  revalidatePath(`/expansion/${projectId}`);
  revalidatePath("/expansion");
}

export async function updateBrandAuditItemStatus(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertExpansionPermission(profile, "brand_audits.manage");
  const supabase = await createClient();
  const itemId = required(formData.get("brand_audit_item_id"), "Brand audit item");
  const status = required(formData.get("status"), "Status");
  const { error } = await supabase
    .from("brand_audit_items")
    .update({ status, notes: optional(formData.get("notes")), updated_at: new Date().toISOString() })
    .eq("id", itemId);

  if (error) throw new Error(error.message);
  await audit("Brand Audit Item Updated", "brand_audit_items", itemId, { status });
  await emitDomainEvent({
    organizationId: profile.organizationId,
    eventType: status === "needs_remediation" ? "brand_audit.remediation_needed" : "brand_audit.completed",
    entityType: "brand_audit_item",
    entityId: itemId,
    payload: { status }
  });
  revalidatePath("/expansion");
}
