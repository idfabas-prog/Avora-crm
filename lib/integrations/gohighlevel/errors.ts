export class GhlIntegrationError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly httpStatus: number | null;
  readonly safeProviderMessage: string | null;
  readonly endpoint: string | null;

  constructor(message: string, code: string, retryable = false, details: { httpStatus?: number | null; safeProviderMessage?: string | null; endpoint?: string | null } = {}) {
    super(message);
    this.name = "GhlIntegrationError";
    this.code = code;
    this.retryable = retryable;
    this.httpStatus = details.httpStatus ?? null;
    this.safeProviderMessage = details.safeProviderMessage ?? null;
    this.endpoint = details.endpoint ?? null;
  }
}

function redactPii(value: string | null) {
  if (!value) return value;
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\+?1?[\s(.-]*\d{3}[\s).=-]*\d{3}[\s.-]*\d{4}\b/g, "[phone]");
}

export function safeGhlError(caught: unknown) {
  if (caught instanceof GhlIntegrationError) {
    return { message: redactPii(caught.message), code: caught.code, retryable: caught.retryable, httpStatus: caught.httpStatus, safeProviderMessage: redactPii(caught.safeProviderMessage), endpoint: caught.endpoint };
  }
  if (caught instanceof Error) {
    return { message: redactPii(caught.message), code: "unexpected_error", retryable: false };
  }
  return { message: "Unexpected GoHighLevel integration error", code: "unexpected_error", retryable: false };
}
