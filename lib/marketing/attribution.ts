import type { AttributionType } from "./types";

export type UtmCaptureInput = {
  url?: string | null;
  referrer?: string | null;
  capturedAt?: Date;
};

export function normalizeSourceAlias(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function parseUtmCapture(input: UtmCaptureInput) {
  const url = input.url ? new URL(input.url, "https://avora.local") : null;
  const params = url?.searchParams ?? new URLSearchParams();
  return {
    utm_source: params.get("utm_source"),
    utm_medium: params.get("utm_medium"),
    utm_campaign: params.get("utm_campaign"),
    utm_content: params.get("utm_content"),
    utm_term: params.get("utm_term"),
    landing_page: input.url ?? null,
    referrer: input.referrer ?? null,
    captured_at: (input.capturedAt ?? new Date()).toISOString()
  };
}

export function chooseFirstTouch<T extends { captured_at: string }>(events: T[]) {
  return [...events].sort((a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime())[0] ?? null;
}

export function chooseLastTouch<T extends { captured_at: string }>(events: T[]) {
  return [...events].sort((a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime())[0] ?? null;
}

export function nextAttributionType(existingEvents: Array<{ attribution_type: AttributionType; captured_at: string }>): AttributionType {
  if (!existingEvents.length) return "first_touch";
  return "last_touch";
}
