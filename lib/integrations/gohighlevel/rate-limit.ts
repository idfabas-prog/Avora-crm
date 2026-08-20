import { GhlIntegrationError } from "./errors.ts";

export type GhlRetryState = {
  attempt: number;
  maxAttempts: number;
  retryAfterMs?: number;
};

export function retryDelayMs(input: GhlRetryState) {
  if (input.retryAfterMs !== undefined) return input.retryAfterMs;
  return Math.min(30_000, 500 * 2 ** Math.max(0, input.attempt - 1));
}

export function shouldRetryStatus(status: number) {
  return status === 429 || status === 408 || status >= 500;
}

export function retryAfterFromHeaders(headers: Headers) {
  const raw = headers.get("retry-after");
  if (!raw) return undefined;
  const seconds = Number(raw);
  return Number.isFinite(seconds) ? seconds * 1000 : undefined;
}

type GhlResponseContext = {
  endpoint?: string | null;
  requestMethod?: string | null;
  queryParameterNames?: string[];
  requestBodyKeys?: string[];
  apiVersion?: string | null;
};

function safeProviderMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const message = Array.isArray(record.message) ? record.message.join("; ") : String(record.message ?? "").trim();
  const error = String(record.error ?? "").trim();
  return [message, error].filter(Boolean).join(" - ").slice(0, 260) || null;
}

function details(context: GhlResponseContext | string | null | undefined, response: Response, providerMessage: string | null) {
  const normalized = typeof context === "string" ? { endpoint: context } : context ?? {};
  return {
    httpStatus: response.status,
    safeProviderMessage: providerMessage,
    endpoint: normalized.endpoint ?? null,
    requestMethod: normalized.requestMethod ?? null,
    queryParameterNames: normalized.queryParameterNames ?? [],
    requestBodyKeys: normalized.requestBodyKeys ?? [],
    apiVersion: normalized.apiVersion ?? null
  };
}

export async function assertGhlResponse(response: Response, payload: unknown = null, context: GhlResponseContext | string | null = null) {
  if (response.ok) return;
  const providerMessage = safeProviderMessage(payload);
  const errorDetails = details(context, response, providerMessage);
  if (response.status === 401 || response.status === 403) {
    throw new GhlIntegrationError("GoHighLevel credentials or scopes are not authorized", "authorization_failed", false, errorDetails);
  }
  if (shouldRetryStatus(response.status)) {
    throw new GhlIntegrationError(`GoHighLevel transient response ${response.status}`, "transient_provider_error", true, errorDetails);
  }
  throw new GhlIntegrationError(`GoHighLevel request failed with status ${response.status}`, "provider_request_failed", false, errorDetails);
}
