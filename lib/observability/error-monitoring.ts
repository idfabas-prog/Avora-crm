import { log } from "./logger";

export type ErrorContext = {
  event: string;
  requestId?: string | null;
  route?: string | null;
  userId?: string | null;
  organizationId?: string | null;
};

export function captureError(error: unknown, context: ErrorContext) {
  const message = error instanceof Error ? error.message : "Unknown error";
  return log("error", {
    ...context,
    metadata: {
      message,
      provider: "none",
      monitoring_foundation: true
    }
  });
}

