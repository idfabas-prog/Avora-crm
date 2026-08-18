"use client";

import {
  approveAccountingBatch,
  closeAccountingPeriod,
  exportAccountingBatchMock,
  reopenAccountingPeriod,
  resolveAccountingException,
  updateCloseItemStatus
} from "@/app/accounting-actions";
import { ActionForm } from "@/components/crm/ActionForm";
import { APP_DISPLAY_NAME } from "@/lib/config/branding";

export function AccountingBatchActions({ batchId, status, balanced }: { batchId: string; status: string; balanced: boolean }) {
  return (
    <div className="inline-actions">
      {status !== "approved" && status !== "exported" ? (
        <ActionForm action={approveAccountingBatch} className="inline-form" submitLabel="Approve" successMessage="Batch approved">
          <input name="batch_id" type="hidden" value={batchId} />
          <input name="balanced" type="hidden" value={balanced ? "true" : "false"} />
        </ActionForm>
      ) : null}
      {status === "approved" ? (
        <ActionForm action={exportAccountingBatchMock} className="inline-form" submitLabel="Mock Export" successMessage="Mock export completed">
          <input name="batch_id" type="hidden" value={batchId} />
        </ActionForm>
      ) : null}
    </div>
  );
}

export function ResolveAccountingExceptionForm({ exceptionId }: { exceptionId: string }) {
  return (
    <ActionForm action={resolveAccountingException} className="inline-form" submitLabel="Resolve" successMessage="Exception resolved">
      <input name="exception_id" type="hidden" value={exceptionId} />
    </ActionForm>
  );
}

export function CloseItemStatusForm({ itemId, currentStatus }: { itemId: string; currentStatus: string }) {
  return (
    <ActionForm action={updateCloseItemStatus} className="inline-form" submitLabel="Update" successMessage="Close item updated">
      <input name="close_item_id" type="hidden" value={itemId} />
      <select defaultValue={currentStatus} name="status">
        <option value="not_started">Not Started</option>
        <option value="in_progress">In Progress</option>
        <option value="blocked">Blocked</option>
        <option value="complete">Complete</option>
      </select>
    </ActionForm>
  );
}

export function ClosePeriodForm({ periodId }: { periodId: string }) {
  return (
    <ActionForm action={closeAccountingPeriod} submitLabel={`Close ${APP_DISPLAY_NAME} Period`} successMessage="Period closed">
      <input name="period_id" type="hidden" value={periodId} />
      <label><span>Confirmation</span><input name="confirmation" placeholder="Type CLOSE" required /></label>
    </ActionForm>
  );
}

export function ReopenPeriodForm({ periodId }: { periodId: string }) {
  return (
    <ActionForm action={reopenAccountingPeriod} submitLabel="Reopen Period" successMessage="Period reopened">
      <input name="period_id" type="hidden" value={periodId} />
      <label><span>Reason</span><textarea name="reason" required rows={3} /></label>
    </ActionForm>
  );
}
