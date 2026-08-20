export class GhlIntegrationError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly httpStatus: number | null;
  readonly safeProviderMessage: string | null;
  readonly endpoint: string | null;
  readonly requestMethod: string | null;
  readonly queryParameterNames: string[];
  readonly requestBodyKeys: string[];
  readonly apiVersion: string | null;

  constructor(message: string, code: string, retryable = false, details: { httpStatus?: number | null; safeProviderMessage?: string | null; endpoint?: string | null; requestMethod?: string | null; queryParameterNames?: string[]; requestBodyKeys?: string[]; apiVersion?: string | null } = {}) {
    super(message);
    this.name = "GhlIntegrationError";
    this.code = code;
    this.retryable = retryable;
    this.httpStatus = details.httpStatus ?? null;
    this.safeProviderMessage = details.safeProviderMessage ?? null;
    this.endpoint = details.endpoint ?? null;
    this.requestMethod = details.requestMethod ?? null;
    this.queryParameterNames = details.queryParameterNames ?? [];
    this.requestBodyKeys = details.requestBodyKeys ?? [];
    this.apiVersion = details.apiVersion ?? null;
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
    return {
      message: redactPii(caught.message),
      code: caught.code,
      retryable: caught.retryable,
      httpStatus: caught.httpStatus,
      safeProviderMessage: redactPii(caught.safeProviderMessage),
      endpoint: caught.endpoint,
      requestMethod: caught.requestMethod,
      queryParameterNames: caught.queryParameterNames,
      requestBodyKeys: caught.requestBodyKeys,
      apiVersion: caught.apiVersion
    };
  }
  if (caught instanceof Error) {
    return { message: redactPii(caught.message), code: "unexpected_error", retryable: false };
  }
  return { message: "Unexpected GoHighLevel integration error", code: "unexpected_error", retryable: false };
}
