import { getAppEnvironment } from "../config/environment.ts";

export function requestIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

export function unauthorized(message = "Unauthorized") {
  return Response.json({ ok: false, error: message }, { status: 401 });
}

export function rateLimited(resetAt: number) {
  return Response.json(
    { ok: false, error: "Rate limit exceeded" },
    { status: 429, headers: { "Retry-After": Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)).toString() } }
  );
}

export function isInternalRequest(request: Request, env: NodeJS.ProcessEnv = process.env) {
  const secret = env.CRON_SECRET;
  const environment = getAppEnvironment(env);
  if (!secret && environment !== "production" && environment !== "staging") return true;
  if (!secret) return false;
  const authHeader = request.headers.get("authorization");
  const cronHeader = request.headers.get("x-cron-secret");
  return authHeader === `Bearer ${secret}` || cronHeader === secret;
}

export function requireInternalRequest(request: Request, env: NodeJS.ProcessEnv = process.env) {
  if (!isInternalRequest(request, env)) {
    return unauthorized("Internal route authorization required");
  }
  return null;
}

export function safeInternalPath(value: string | null | undefined, fallback = "/dashboard") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("://")) return fallback;
  return value;
}

export function sameOriginAllowed(request: Request, env: NodeJS.ProcessEnv = process.env) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const allowed = [env.APP_URL, env.PATIENT_PORTAL_URL].filter(Boolean);
  if (allowed.length === 0 && getAppEnvironment(env) !== "production") return true;
  return allowed.includes(origin);
}
