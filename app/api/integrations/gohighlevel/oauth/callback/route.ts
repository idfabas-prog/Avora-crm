import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeGhlOAuthState, exchangeGhlOAuthCode, fetchGhlOAuthLocationInfo, getGhlOAuthConfig, storeGhlOAuthInstallation } from "@/lib/integrations/gohighlevel/oauth";

function settingsRedirect(status: string, reason?: string) {
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const url = new URL("/settings/integrations/gohighlevel", appUrl);
  url.searchParams.set("ghl_oauth", status);
  if (reason) url.searchParams.set("reason", reason.slice(0, 120));
  return NextResponse.redirect(url);
}

function safeReason(error: unknown) {
  return error instanceof Error ? error.message : "OAuth callback failed";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  if (error) return settingsRedirect("failed", error);
  const code = String(url.searchParams.get("code") ?? "").trim();
  const stateValue = String(url.searchParams.get("state") ?? "").trim();
  if (!code || !stateValue) return settingsRedirect("failed", "missing_code_or_state");

  const supabase = createAdminClient();
  try {
    const config = getGhlOAuthConfig();
    const state = await consumeGhlOAuthState(supabase, stateValue);
    if (state.redirect_uri !== config.redirectUri) throw new Error("Configured GHL OAuth redirect URI no longer matches the install state.");
    const token = await exchangeGhlOAuthCode(code);
    const locationInfo = token.access_token ? await fetchGhlOAuthLocationInfo(token.access_token).catch(() => undefined) : undefined;
    const result = await storeGhlOAuthInstallation(supabase, state, token, locationInfo);
    return settingsRedirect(result.status === "healthy" ? "installed" : "location_mismatch");
  } catch (caught) {
    return settingsRedirect("failed", safeReason(caught));
  }
}
