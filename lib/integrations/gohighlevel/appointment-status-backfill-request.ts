export const APPOINTMENT_STATUS_BACKFILL_CONFIRMATION = "APPLY STATUS BACKFILL";

export type AppointmentStatusBackfillRequest = {
  connectionId: string;
  confirmation: string;
  expectedCandidateCount: number;
};

export type AppointmentStatusBackfillPreviewRequest = {
  connectionId: string;
};

export function normalizeAppointmentStatusBackfillConfirmation(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim().toUpperCase();
}

function requiredConnectionId(value: unknown) {
  const connectionId = String(value ?? "").trim();
  if (!connectionId) throw new Error("Connection is required");
  return connectionId;
}

export function validateAppointmentStatusBackfillPreviewRequest(input: {
  connectionId?: unknown;
}): AppointmentStatusBackfillPreviewRequest {
  return { connectionId: requiredConnectionId(input.connectionId) };
}

export function validateAppointmentStatusBackfillRequest(input: {
  connectionId?: unknown;
  confirmation?: unknown;
  expectedCandidateCount?: unknown;
}): AppointmentStatusBackfillRequest {
  const connectionId = String(input.connectionId ?? "").trim();
  if (!connectionId) throw new Error("Connection is required");

  const confirmation = normalizeAppointmentStatusBackfillConfirmation(input.confirmation);
  if (confirmation !== APPOINTMENT_STATUS_BACKFILL_CONFIRMATION) {
    throw new Error(`Type ${APPOINTMENT_STATUS_BACKFILL_CONFIRMATION} to run the Miami appointment status backfill`);
  }

  const expectedCandidateCount = Number(input.expectedCandidateCount);
  if (!Number.isInteger(expectedCandidateCount) || expectedCandidateCount < 1) {
    throw new Error("Run Apply Preview and confirm it finds status backfill candidates before applying");
  }

  return { connectionId, confirmation, expectedCandidateCount };
}

export function safeAppointmentStatusBackfillRequestError(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Appointment status backfill request failed";
}
