import { APP_DISPLAY_NAME } from "../config/branding.ts";

const criticalWriteTypes = new Set([
  "payment",
  "refund",
  "clinical_completion",
  "inventory_deduction",
  "appointment_status",
  "timesheet_approval",
  "pto_approval"
]);

export function canQueueOfflineWrite(writeType: string) {
  return !criticalWriteTypes.has(writeType);
}

export function offlineGuardMessage(writeType: string) {
  return canQueueOfflineWrite(writeType)
    ? "This draft can be preserved locally until the connection returns."
    : `Reconnect before saving this critical ${APP_DISPLAY_NAME} action.`;
}
