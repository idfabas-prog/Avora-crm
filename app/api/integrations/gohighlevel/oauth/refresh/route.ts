import { checkRateLimit, defaultRateLimitRules } from "@/lib/security/rate-limit";
import { rateLimited, requestIp, requireInternalRequest } from "@/lib/security/request-guard";
import { refreshGhlOAuthInstallation } from "@/lib/integrations/gohighlevel/oauth";
import { createAdminClient } from "@/lib/supabase/admin";

function safeRefreshError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 300) : "GoHighLevel OAuth refresh failed";
}

export async function POST(request: Request) {
  const authError = requireInternalRequest(request);
  if (authError) return authError;
  const limit = checkRateLimit(defaultRateLimitRules.internalJob, requestIp(request));
  if (!limit.allowed) return rateLimited(limit.resetAt);

  try {
    const body = await request.json().catch(() => ({})) as { installationId?: string };
    const installationId = String(body.installationId ?? "").trim();
    if (!installationId) return Response.json({ ok: false, error: "Installation is required" }, { status: 400 });
    const result = await refreshGhlOAuthInstallation(createAdminClient(), installationId);
    return Response.json({ ok: true, readOnly: true, writesToGhl: false, ...result });
  } catch (error) {
    return Response.json({ ok: false, readOnly: true, writesToGhl: false, error: safeRefreshError(error) }, { status: 500 });
  }
}
