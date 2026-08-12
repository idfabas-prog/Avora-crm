export type RetryDecision = {
  retry: boolean;
  runAt?: Date;
  reason?: string;
};

const retryDelaysMinutes = [1, 5];
const nonRetryableCodes = new Set(["sms_opted_out", "invalid_phone", "unauthorized_location", "invalid_configuration"]);

export function nextRetry(attemptNumber: number, errorCode: string | null | undefined, now = new Date()): RetryDecision {
  if (errorCode && nonRetryableCodes.has(errorCode)) {
    return { retry: false, reason: "Failure is not retryable" };
  }

  if (attemptNumber >= 3) {
    return { retry: false, reason: "Maximum attempts reached" };
  }

  const minutes = retryDelaysMinutes[Math.max(attemptNumber - 1, 0)] ?? 5;
  return { retry: true, runAt: new Date(now.getTime() + minutes * 60_000), reason: `Retry in ${minutes} minute${minutes === 1 ? "" : "s"}` };
}

export function jobIdempotencyKey(enrollmentId: string, nodeId: string) {
  return `workflow-job:${enrollmentId}:${nodeId}`;
}
