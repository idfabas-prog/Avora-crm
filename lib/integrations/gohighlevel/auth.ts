import type { GhlConnection } from "./types.ts";

type CredentialLookup = Pick<GhlConnection, "credential_env_key" | "connection_type" | "ghl_location_id">;

export function isMockGhlConnection(connection: Pick<GhlConnection, "connection_type" | "ghl_location_id">) {
  return connection.connection_type === "mock" && connection.ghl_location_id.startsWith("ghl_mock_");
}

export function credentialDiagnosticForConnection(connection: CredentialLookup, env: NodeJS.ProcessEnv = process.env) {
  const key = connection.credential_env_key?.trim() || null;
  const validServerKey = Boolean(key && !key.startsWith("NEXT_PUBLIC_"));
  const mockCredentialIgnored = isMockGhlConnection(connection);
  return {
    credentialKey: validServerKey ? key : null,
    tokenPresent: Boolean(!mockCredentialIgnored && validServerKey && key && env[key]),
    blockedReason: mockCredentialIgnored ? "mock_connection_credential_ignored" : key?.startsWith("NEXT_PUBLIC_") ? "public_env_key_rejected" : null
  };
}

export function tokenForConnection(connection: CredentialLookup, env: NodeJS.ProcessEnv = process.env) {
  if (isMockGhlConnection(connection)) return "mock-token";
  const key = credentialDiagnosticForConnection(connection, env).credentialKey;
  return key ? env[key] || null : null;
}

export function tokenPresentForConnection(connection: CredentialLookup, env: NodeJS.ProcessEnv = process.env) {
  return credentialDiagnosticForConnection(connection, env).tokenPresent;
}

export function privateIntegrationHeaders(token: string, version = "v3", hasBody = false) {
  return {
    Authorization: `Bearer ${token}`,
    Version: version,
    Accept: "application/json",
    ...(hasBody ? { "Content-Type": "application/json" } : {})
  };
}
