import type { GhlIntegrationMode } from "./types.ts";

export const GHL_PROVIDER = "gohighlevel";
export const GHL_SUPPORTED_OBJECT_TYPES = [
  "contact",
  "calendar",
  "appointment",
  "conversation",
  "message",
  "opportunity",
  "pipeline",
  "user",
  "payment",
  "transaction",
  "order",
  "tag",
  "custom_field"
] as const;

export const GHL_OFFICIAL_DOCS = [
  "https://highlevel.stoplight.io/docs/integrations",
  "https://marketplace.gohighlevel.com/docs",
  "https://developers.gohighlevel.com/"
];

export function getGhlIntegrationMode(env: NodeJS.ProcessEnv = process.env): GhlIntegrationMode {
  const mode = env.GHL_INTEGRATION_MODE;
  if (mode === "disabled" || mode === "development" || mode === "read_only" || mode === "two_way_future") return mode;
  return "development";
}

export function ghlReadSyncEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.GHL_READ_SYNC_ENABLED === "true" || getGhlIntegrationMode(env) === "development";
}

export function ghlWritesAllowed(env: NodeJS.ProcessEnv = process.env) {
  return env.GHL_ALLOW_WRITES === "true";
}

export function assertGhlReadMode(env: NodeJS.ProcessEnv = process.env) {
  const mode = getGhlIntegrationMode(env);
  if (mode !== "development" && mode !== "read_only") {
    throw new Error("GoHighLevel read sync is disabled");
  }
}

export function assertGhlWritesBlocked(env: NodeJS.ProcessEnv = process.env) {
  if (!ghlWritesAllowed(env)) {
    throw new Error("GHL writes disabled");
  }
  throw new Error("GoHighLevel two-way writes are not implemented in Phase 21");
}

export function credentialEnvKeyForLocationSlug(slug: string) {
  return `GHL_${slug.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_PRIVATE_TOKEN`;
}
