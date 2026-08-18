import { getAppEnvironment, getAppVersion } from "../config/environment.ts";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogPayload = {
  event: string;
  requestId?: string | null;
  userId?: string | null;
  organizationId?: string | null;
  route?: string | null;
  durationMs?: number;
  metadata?: Record<string, unknown>;
};

const redactedKeys = ["password", "token", "authorization", "secret", "service_role", "card", "clinical_note", "transcript"];

export function redactMetadata(value: Record<string, unknown> = {}) {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      const lower = key.toLowerCase();
      if (redactedKeys.some((redacted) => lower.includes(redacted))) return [key, "[redacted]"];
      return [key, item];
    })
  );
}

export function createRequestId(prefix = "req") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function log(level: LogLevel, payload: LogPayload) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event: payload.event,
    environment: getAppEnvironment(),
    app_version: getAppVersion(),
    request_id: payload.requestId ?? null,
    user_id: payload.userId ?? null,
    organization_id: payload.organizationId ?? null,
    route: payload.route ?? null,
    duration_ms: payload.durationMs,
    metadata_safe: redactMetadata(payload.metadata)
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
  return entry;
}
