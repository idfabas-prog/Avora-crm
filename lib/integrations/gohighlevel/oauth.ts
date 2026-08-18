import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentProfile } from "@/lib/auth/profile";
import type { GhlConnection } from "./types.ts";

export const GHL_MIAMI_EXPECTED_LOCATION_ID = "Y4e3rWEXVyXCZmZaCs8d";
export const GHL_OAUTH_AUTHORIZE_URL = "https://marketplace.gohighlevel.com/oauth/chooselocation";
export const GHL_OAUTH_TOKEN_URL = "https://services.leadconnectorhq.com/oauth/token";
export const GHL_OAUTH_LOCATION_INFO_URL = "https://services.leadconnectorhq.com/oauth/locationInfo";
export const GHL_OAUTH_STATE_TTL_MINUTES = 10;
export const GHL_OAUTH_SCOPES = [
  "locations.readonly",
  "contacts.readonly",
  "calendars.readonly",
  "calendars/events.readonly",
  "opportunities.readonly",
  "conversations.readonly",
  "conversations/message.readonly",
  "payments/orders.readonly",
  "payments/transactions.readonly",
  "locations/customFields.readonly",
  "locations/tags.readonly",
  "users.readonly"
] as const;

type OAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  encryptionKey: string;
};

type OAuthTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  locationId?: string;
  location_id?: string;
  companyId?: string;
  company_id?: string;
  userId?: string;
  userType?: string;
  appId?: string;
  marketplace_app_id?: string;
  installId?: string;
};

type OAuthStateRow = {
  id: string;
  organization_id: string;
  location_id: string | null;
  ghl_connection_id: string;
  state_hash: string;
  redirect_uri: string;
  expected_ghl_location_id: string;
  expires_at: string;
  used_at: string | null;
  status: string;
};

type OAuthInstallationRow = {
  id: string;
  organization_id: string;
  location_id: string | null;
  ghl_connection_id: string;
  ghl_location_id: string | null;
  expected_ghl_location_id: string;
  status: string;
  access_token_expires_at: string | null;
  last_refreshed_at: string | null;
};

type OAuthCredentialRow = {
  installation_id: string;
  encrypted_access_token: string;
  encrypted_refresh_token: string;
  refresh_lock_token: string | null;
  refresh_in_progress_at: string | null;
};

type OAuthRefreshSummary = {
  checked: number;
  due: number;
  refreshed: number;
  failed: number;
  skippedReason: string | null;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function oauthBaseConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    clientId: text(env.GHL_OAUTH_CLIENT_ID),
    clientSecret: text(env.GHL_OAUTH_CLIENT_SECRET),
    redirectUri: text(env.GHL_OAUTH_REDIRECT_URI),
    encryptionKey: text(env.GHL_OAUTH_ENCRYPTION_KEY)
  };
}

export function ghlOAuthRefreshConfigurationPresent(env: NodeJS.ProcessEnv = process.env) {
  const config = oauthBaseConfig(env);
  return Boolean(config.clientId && config.clientSecret && config.redirectUri && config.encryptionKey);
}

export function getGhlOAuthConfig(env: NodeJS.ProcessEnv = process.env): OAuthConfig {
  const config = oauthBaseConfig(env);
  const missing = Object.entries(config).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new Error(`Missing GoHighLevel OAuth configuration: ${missing.join(", ")}`);
  return config;
}

export function getGhlOAuthInstallConfig(env: NodeJS.ProcessEnv = process.env) {
  const { clientId, redirectUri } = oauthBaseConfig(env);
  if (!clientId || !redirectUri) throw new Error("GHL_OAUTH_CLIENT_ID and GHL_OAUTH_REDIRECT_URI are required to start OAuth installation");
  return { clientId, redirectUri };
}

export function hashOAuthState(state: string) {
  return createHash("sha256").update(state).digest("hex");
}

export function createRawOAuthState() {
  return randomBytes(32).toString("base64url");
}

function encryptionKeyBytes(key: string) {
  const trimmed = key.trim();
  const decoded = /^[a-f0-9]{64}$/i.test(trimmed)
    ? Buffer.from(trimmed, "hex")
    : Buffer.from(trimmed, "base64");
  if (decoded.length !== 32) throw new Error("GHL_OAUTH_ENCRYPTION_KEY must decode to 32 bytes");
  return decoded;
}

export function encryptGhlOAuthSecret(value: string, key = getGhlOAuthConfig().encryptionKey) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKeyBytes(key), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `aes-256-gcm:v1:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptGhlOAuthSecret(encrypted: string, key = getGhlOAuthConfig().encryptionKey) {
  const [algorithm, version, ivValue, tagValue, ciphertextValue] = encrypted.split(":");
  if (algorithm !== "aes-256-gcm" || version !== "v1" || !ivValue || !tagValue || !ciphertextValue) {
    throw new Error("Unsupported encrypted GoHighLevel OAuth token format");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKeyBytes(key), Buffer.from(ivValue, "base64"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextValue, "base64")), decipher.final()]).toString("utf8");
}

export function buildGhlOAuthInstallUrl(input: { state: string; env?: NodeJS.ProcessEnv; scopes?: readonly string[] }) {
  const { clientId, redirectUri } = getGhlOAuthInstallConfig(input.env);
  const url = new URL(GHL_OAUTH_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", (input.scopes ?? GHL_OAUTH_SCOPES).join(" "));
  url.searchParams.set("state", input.state);
  return url;
}

export async function createGhlOAuthState(supabase: SupabaseClient, profile: CurrentProfile, connection: GhlConnection, env: NodeJS.ProcessEnv = process.env) {
  const { redirectUri } = getGhlOAuthInstallConfig(env);
  if (connection.ghl_location_id !== GHL_MIAMI_EXPECTED_LOCATION_ID) throw new Error("Phase 21B.1 OAuth installation is limited to the Miami GHL location.");
  const state = createRawOAuthState();
  const expiresAt = new Date(Date.now() + GHL_OAUTH_STATE_TTL_MINUTES * 60 * 1000).toISOString();
  const { error } = await supabase.from("ghl_oauth_states").insert({
    organization_id: profile.organizationId,
    location_id: connection.location_id,
    ghl_connection_id: connection.id,
    state_hash: hashOAuthState(state),
    redirect_uri: redirectUri,
    expected_ghl_location_id: connection.ghl_location_id,
    expires_at: expiresAt,
    created_by: profile.id,
    metadata_safe: { phase: "21B.1", single_use: true }
  });
  if (error) throw new Error(error.message);
  return { state, expiresAt, redirectUri };
}

export async function consumeGhlOAuthState(supabase: SupabaseClient, state: string, now = new Date()) {
  const { data, error } = await supabase.from("ghl_oauth_states").select("*").eq("state_hash", hashOAuthState(state)).maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as OAuthStateRow | null;
  if (!row) throw new Error("Invalid GoHighLevel OAuth state.");
  if (row.used_at || row.status !== "pending") throw new Error("GoHighLevel OAuth state was already used.");
  if (new Date(row.expires_at).getTime() <= now.getTime()) {
    await supabase.from("ghl_oauth_states").update({ status: "expired" }).eq("id", row.id);
    throw new Error("GoHighLevel OAuth state expired.");
  }
  const { data: claimed, error: claimError } = await supabase
    .from("ghl_oauth_states")
    .update({ status: "used", used_at: now.toISOString() })
    .eq("id", row.id)
    .is("used_at", null)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (claimError) throw new Error(claimError.message);
  if (!claimed?.id) throw new Error("GoHighLevel OAuth state was already used.");
  return row;
}

async function readOAuthResponse(response: Response) {
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(text(body.message ?? body.error_description ?? body.error) || `HighLevel OAuth returned HTTP ${response.status}`);
  return body as OAuthTokenResponse;
}

export async function exchangeGhlOAuthCode(code: string, env: NodeJS.ProcessEnv = process.env) {
  const config = getGhlOAuthConfig(env);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    code
  });
  const response = await fetch(GHL_OAUTH_TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  return readOAuthResponse(response);
}

export async function refreshGhlOAuthToken(refreshToken: string, env: NodeJS.ProcessEnv = process.env) {
  const config = getGhlOAuthConfig(env);
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken
  });
  const response = await fetch(GHL_OAUTH_TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  return readOAuthResponse(response);
}

export async function fetchGhlOAuthLocationInfo(accessToken: string) {
  const response = await fetch(GHL_OAUTH_LOCATION_INFO_URL, {
    method: "GET",
    headers: { authorization: `Bearer ${accessToken}`, version: "2021-07-28", accept: "application/json" },
    cache: "no-store"
  });
  return readOAuthResponse(response);
}

function locationIdFromOAuth(token: OAuthTokenResponse, locationInfo?: OAuthTokenResponse) {
  return text(locationInfo?.locationId ?? locationInfo?.location_id ?? token.locationId ?? token.location_id);
}

function scopesFromOAuth(token: OAuthTokenResponse) {
  return text(token.scope).split(/\s+/).filter(Boolean);
}

function expiresAtFromOAuth(token: OAuthTokenResponse) {
  const expiresIn = Number(token.expires_in ?? 0);
  return Number.isFinite(expiresIn) && expiresIn > 0
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : null;
}

export async function storeGhlOAuthInstallation(
  supabase: SupabaseClient,
  state: OAuthStateRow,
  token: OAuthTokenResponse,
  locationInfo?: OAuthTokenResponse,
  env: NodeJS.ProcessEnv = process.env
) {
  const installedLocationId = locationIdFromOAuth(token, locationInfo);
  const locationMatches = installedLocationId === state.expected_ghl_location_id;
  const now = new Date().toISOString();
  const installationPayload = {
    organization_id: state.organization_id,
    location_id: state.location_id,
    ghl_connection_id: state.ghl_connection_id,
    expected_ghl_location_id: state.expected_ghl_location_id,
    ghl_location_id: installedLocationId || null,
    company_id: text(locationInfo?.companyId ?? locationInfo?.company_id ?? token.companyId ?? token.company_id) || null,
    marketplace_app_id: text(token.appId ?? token.marketplace_app_id) || null,
    install_id: text(token.installId) || null,
    oauth_user_id: text(token.userId) || null,
    oauth_user_type: text(token.userType) || null,
    scopes: scopesFromOAuth(token),
    access_token_expires_at: expiresAtFromOAuth(token),
    installed_at: now,
    status: locationMatches ? "healthy" : "location_mismatch",
    status_reason: locationMatches ? null : `OAuth installation returned location ${installedLocationId || "unknown"} instead of expected Miami location.`,
    webhook_ready: locationMatches,
    metadata_safe: { phase: "21B.1", location_verified: locationMatches }
  };
  const { data: installation, error } = await supabase
    .from("ghl_oauth_installations")
    .upsert(installationPayload, { onConflict: "ghl_connection_id" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  if (!locationMatches) return { installationId: String(installation.id), status: "location_mismatch" as const };
  if (!token.access_token || !token.refresh_token) throw new Error("HighLevel OAuth response did not include both access and refresh tokens.");
  const config = getGhlOAuthConfig(env);
  const { error: credentialError } = await supabase.from("ghl_oauth_credentials").upsert({
    installation_id: installation.id,
    encrypted_access_token: encryptGhlOAuthSecret(token.access_token, config.encryptionKey),
    encrypted_refresh_token: encryptGhlOAuthSecret(token.refresh_token, config.encryptionKey),
    refresh_lock_token: null,
    refresh_in_progress_at: null
  }, { onConflict: "installation_id" });
  if (credentialError) throw new Error(credentialError.message);
  return { installationId: String(installation.id), status: "healthy" as const };
}

function refreshLockIsActive(row: OAuthCredentialRow, now = Date.now()) {
  if (!row.refresh_lock_token || !row.refresh_in_progress_at) return false;
  return now - new Date(row.refresh_in_progress_at).getTime() < 2 * 60 * 1000;
}

export async function refreshGhlOAuthInstallation(supabase: SupabaseClient, installationId: string, env: NodeJS.ProcessEnv = process.env) {
  const [{ data: installation }, { data: credentials }] = await Promise.all([
    supabase.from("ghl_oauth_installations").select("*").eq("id", installationId).single(),
    supabase.from("ghl_oauth_credentials").select("*").eq("installation_id", installationId).single()
  ]);
  const install = installation as OAuthInstallationRow | null;
  const credential = credentials as OAuthCredentialRow | null;
  if (!install || !credential) throw new Error("GoHighLevel OAuth installation credentials were not found.");
  if (refreshLockIsActive(credential)) throw new Error("GoHighLevel OAuth refresh is already in progress.");
  const lockToken = randomUUID();
  const lockUpdate = credential.refresh_lock_token
    ? supabase.from("ghl_oauth_credentials").update({ refresh_lock_token: lockToken, refresh_in_progress_at: new Date().toISOString() }).eq("installation_id", installationId).eq("refresh_lock_token", credential.refresh_lock_token)
    : supabase.from("ghl_oauth_credentials").update({ refresh_lock_token: lockToken, refresh_in_progress_at: new Date().toISOString() }).eq("installation_id", installationId).is("refresh_lock_token", null);
  const { error: lockError } = await lockUpdate;
  if (lockError) throw new Error(lockError.message);

  try {
    const config = getGhlOAuthConfig(env);
    const refreshToken = decryptGhlOAuthSecret(credential.encrypted_refresh_token, config.encryptionKey);
    const token = await refreshGhlOAuthToken(refreshToken, env);
    if (!token.access_token || !token.refresh_token) throw new Error("HighLevel OAuth refresh response did not include rotated tokens.");
    const { error: credentialError } = await supabase.from("ghl_oauth_credentials").update({
      encrypted_access_token: encryptGhlOAuthSecret(token.access_token, config.encryptionKey),
      encrypted_refresh_token: encryptGhlOAuthSecret(token.refresh_token, config.encryptionKey),
      refresh_lock_token: null,
      refresh_in_progress_at: null
    }).eq("installation_id", installationId).eq("refresh_lock_token", lockToken);
    if (credentialError) throw new Error(credentialError.message);
    await supabase.from("ghl_oauth_installations").update({
      status: "healthy",
      access_token_expires_at: expiresAtFromOAuth(token) ?? install.access_token_expires_at,
      last_refreshed_at: new Date().toISOString(),
      status_reason: null
    }).eq("id", installationId);
    return { refreshed: true };
  } catch (error) {
    await supabase.from("ghl_oauth_credentials").update({ refresh_lock_token: null, refresh_in_progress_at: null }).eq("installation_id", installationId).eq("refresh_lock_token", lockToken);
    await supabase.from("ghl_oauth_installations").update({ status: "refresh_failed", status_reason: text(error instanceof Error ? error.message : error).slice(0, 300) }).eq("id", installationId);
    throw error;
  }
}

export async function refreshDueGhlOAuthInstallations(
  supabase: SupabaseClient,
  input: { env?: NodeJS.ProcessEnv; now?: Date; thresholdMs?: number; limit?: number } = {}
): Promise<OAuthRefreshSummary> {
  const env = input.env ?? process.env;
  if (!ghlOAuthRefreshConfigurationPresent(env)) {
    return { checked: 0, due: 0, refreshed: 0, failed: 0, skippedReason: "oauth_configuration_missing" };
  }

  const now = input.now ?? new Date();
  const thresholdMs = input.thresholdMs ?? 10 * 60 * 1000;
  const refreshBefore = new Date(now.getTime() + thresholdMs);
  const { data, error } = await supabase
    .from("ghl_oauth_installations")
    .select("id, access_token_expires_at")
    .eq("status", "healthy")
    .eq("webhook_ready", true)
    .not("access_token_expires_at", "is", null)
    .order("access_token_expires_at", { ascending: true })
    .limit(input.limit ?? 20);

  if (error) {
    return { checked: 0, due: 0, refreshed: 0, failed: 1, skippedReason: error.message.slice(0, 120) };
  }

  const dueRows = (data ?? []).filter((row) => {
    const expiresAt = new Date(String(row.access_token_expires_at)).getTime();
    return Number.isFinite(expiresAt) && expiresAt <= refreshBefore.getTime();
  });
  const summary: OAuthRefreshSummary = { checked: data?.length ?? 0, due: dueRows.length, refreshed: 0, failed: 0, skippedReason: null };

  for (const row of dueRows) {
    try {
      await refreshGhlOAuthInstallation(supabase, String(row.id), env);
      summary.refreshed += 1;
    } catch {
      summary.failed += 1;
    }
  }

  return summary;
}

export async function handleGhlOAuthLifecycleEvent(supabase: SupabaseClient, input: { eventType: string; locationId: string | null; providerEventId?: string | null }) {
  const eventType = input.eventType.toLowerCase();
  if (!["install", "uninstall"].some((event) => eventType.includes(event))) return false;
  if (!input.locationId) return false;
  if (eventType.includes("uninstall")) {
    await supabase.from("ghl_oauth_installations").update({
      status: "uninstalled",
      webhook_ready: false,
      last_uninstall_event_at: new Date().toISOString(),
      status_reason: "HighLevel app uninstall event received. Historical imported data preserved."
    }).eq("ghl_location_id", input.locationId);
    return true;
  }
  await supabase.from("ghl_oauth_installations").update({
    last_install_event_at: new Date().toISOString(),
    metadata_safe: { phase: "21B.1", last_lifecycle_event: "install", provider_event_id: input.providerEventId ?? null }
  }).eq("ghl_location_id", input.locationId);
  return true;
}
