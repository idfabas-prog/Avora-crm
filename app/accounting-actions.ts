"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { APP_DISPLAY_NAME } from "@/lib/config/branding";
import { createClient } from "@/lib/supabase/server";
import { getAccountingConfig } from "@/lib/accounting/config";
import { assertAccountingPermission } from "@/lib/accounting/permissions";

function required(value: FormDataEntryValue | null, label: string) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
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

function revalidateAccounting() {
  revalidatePath("/accounting");
  revalidatePath("/accounting/journal-preview");
  revalidatePath("/accounting/exceptions");
  revalidatePath("/accounting/reconciliation");
  revalidatePath("/accounting/close");
  revalidatePath("/settings/accounting");
}

export async function approveAccountingBatch(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertAccountingPermission(profile, "accounting.exports.approve");
  const supabase = await createClient();
  const batchId = required(formData.get("batch_id"), "Batch");
  const { data: balance, error: balanceError } = await supabase.rpc("accounting_batch_balance", { target_batch_id: batchId }).single();
  const batchBalance = balance as { balanced?: boolean } | null;
  if (balanceError) throw new Error(balanceError.message);
  if (!batchBalance?.balanced) throw new Error("Accounting batch is not balanced and cannot be approved");

  const { error } = await supabase
    .from("accounting_export_batches")
    .update({ status: "approved", approved_by: profile.id, approved_at: new Date().toISOString(), validation_json: { balanced: true, approved_in_avora_only: true } })
    .eq("id", batchId)
    .eq("organization_id", profile.organizationId);
  if (error) throw new Error(error.message);
  await audit("Accounting Batch Approved", "accounting_export_batches", batchId);
  revalidateAccounting();
}

export async function exportAccountingBatchMock(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertAccountingPermission(profile, "accounting.exports.execute");
  const config = getAccountingConfig();
  if (config.mode !== "development") {
    throw new Error("Only development mock accounting exports are enabled in Phase 18");
  }
  const supabase = await createClient();
  const batchId = required(formData.get("batch_id"), "Batch");
  const { data: balance, error: balanceError } = await supabase.rpc("accounting_batch_balance", { target_batch_id: batchId }).single();
  const batchBalance = balance as { balanced?: boolean } | null;
  if (balanceError) throw new Error(balanceError.message);
  if (!batchBalance?.balanced) throw new Error("Accounting batch is not balanced and cannot be exported");

  const { error } = await supabase
    .from("accounting_export_batches")
    .update({ status: "exported", exported_at: new Date().toISOString(), validation_json: { balanced: true, mock_export_only: true, no_live_provider_call: true } })
    .eq("id", batchId)
    .eq("organization_id", profile.organizationId);
  if (error) throw new Error(error.message);
  await supabase.from("accounting_export_items").update({ export_status: "exported" }).eq("accounting_export_batch_id", batchId).eq("organization_id", profile.organizationId);
  await audit("Accounting Batch Mock Exported", "accounting_export_batches", batchId, { no_live_provider_call: true });
  revalidateAccounting();
}

export async function resolveAccountingException(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertAccountingPermission(profile, "accounting.exceptions.manage");
  const supabase = await createClient();
  const exceptionId = required(formData.get("exception_id"), "Exception");
  const { error } = await supabase
    .from("accounting_exceptions")
    .update({ status: "resolved", resolved_at: new Date().toISOString(), assigned_user_id: profile.id })
    .eq("id", exceptionId)
    .eq("organization_id", profile.organizationId);
  if (error) throw new Error(error.message);
  await audit("Accounting Exception Resolved", "accounting_exceptions", exceptionId);
  revalidateAccounting();
}

export async function updateCloseItemStatus(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertAccountingPermission(profile, "accounting.close.manage");
  const supabase = await createClient();
  const itemId = required(formData.get("close_item_id"), "Close item");
  const status = required(formData.get("status"), "Status");
  const { error } = await supabase
    .from("accounting_close_items")
    .update({ status, completed_at: status === "complete" ? new Date().toISOString() : null })
    .eq("id", itemId);
  if (error) throw new Error(error.message);
  await audit("Accounting Close Item Updated", "accounting_close_items", itemId, { status });
  revalidateAccounting();
}

export async function closeAccountingPeriod(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertAccountingPermission(profile, "accounting.close.manage");
  const confirmation = required(formData.get("confirmation"), "Confirmation");
  if (confirmation !== "CLOSE") throw new Error(`Type CLOSE to close the ${APP_DISPLAY_NAME} accounting period`);
  const supabase = await createClient();
  const periodId = required(formData.get("period_id"), "Period");
  const { data: readiness, error: readinessError } = await supabase.rpc("accounting_close_readiness", { target_period_id: periodId }).single();
  const closeReadiness = readiness as { blocker_count?: number } | null;
  if (readinessError) throw new Error(readinessError.message);
  if (Number(closeReadiness?.blocker_count ?? 0) > 0) throw new Error(`Resolve close blockers before closing this ${APP_DISPLAY_NAME} period`);
  const { error } = await supabase
    .from("accounting_periods")
    .update({ status: "closed", closed_at: new Date().toISOString(), closed_by: profile.id, close_notes: `Closed in ${APP_DISPLAY_NAME} operational accounting support. No external books were closed.` })
    .eq("id", periodId)
    .eq("organization_id", profile.organizationId);
  if (error) throw new Error(error.message);
  await audit("Accounting Period Closed", "accounting_periods", periodId);
  revalidateAccounting();
}

export async function reopenAccountingPeriod(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertAccountingPermission(profile, "accounting.close.manage");
  const reason = required(formData.get("reason"), "Reason");
  const supabase = await createClient();
  const periodId = required(formData.get("period_id"), "Period");
  const { error } = await supabase
    .from("accounting_periods")
    .update({ status: "reopened", reopened_at: new Date().toISOString(), reopened_by: profile.id, close_notes: reason })
    .eq("id", periodId)
    .eq("organization_id", profile.organizationId);
  if (error) throw new Error(error.message);
  await audit("Accounting Period Reopened", "accounting_periods", periodId, { reason });
  revalidateAccounting();
}
