export type JobStatus = "pending" | "running" | "failed" | "stuck" | "dead_letter" | "complete";

export type JobSummary = {
  pending: number;
  running: number;
  failed: number;
  stuck: number;
  deadLetter: number;
  lastRunAt: string | null;
};

export function classifyJobStatus(status: string, updatedAt: string | null, now = Date.now()): JobStatus {
  if (status === "running" && updatedAt && now - new Date(updatedAt).getTime() > 15 * 60_000) return "stuck";
  if (status === "failed") return "failed";
  if (status === "dead_letter") return "dead_letter";
  if (status === "running") return "running";
  if (status === "pending") return "pending";
  return "complete";
}

export function nextRetryDelayMs(attempts: number) {
  return Math.min(60 * 60_000, 2 ** Math.max(0, attempts - 1) * 30_000);
}

export function summarizeJobs(statuses: JobStatus[], lastRunAt: string | null = null): JobSummary {
  return {
    pending: statuses.filter((status) => status === "pending").length,
    running: statuses.filter((status) => status === "running").length,
    failed: statuses.filter((status) => status === "failed").length,
    stuck: statuses.filter((status) => status === "stuck").length,
    deadLetter: statuses.filter((status) => status === "dead_letter").length,
    lastRunAt
  };
}

