import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentProfile } from "@/lib/auth/profile";
import { isMockGhlConnection, tokenPresentForConnection } from "./auth.ts";
import { GhlReadOnlyClient } from "./client.ts";
import { GHL_SUPPORTED_OBJECT_TYPES, assertGhlReadMode, assertGhlWritesBlocked } from "./config.ts";
import { GhlIntegrationError } from "./errors.ts";
import { MockGhlClient } from "./mock.ts";
import { assertGhlPermission } from "./permissions.ts";
import { emptyCounts } from "./reconciliation.ts";
import type { GhlConnection, GhlObjectType, GhlSyncCounts } from "./types.ts";

export function assertNoGhlWrite(method: string) {
  try {
    assertGhlWritesBlocked();
  } catch (error) {
    if (error instanceof Error && error.message === "GHL writes disabled") {
      throw new GhlIntegrationError(`${method}: GHL writes disabled`, "writes_disabled", false);
    }
    throw error;
  }
}

function locationNameFromMetadata(metadata: unknown) {
  const row = metadata && typeof metadata === "object" && "location" in metadata ? (metadata as { location?: unknown }).location : metadata;
  if (!row || typeof row !== "object") return null;
  const location = row as Record<string, unknown>;
  return String(location.name ?? location.businessName ?? location.companyName ?? "").trim() || null;
}

function locationIdFromMetadata(metadata: unknown) {
  const row = metadata && typeof metadata === "object" && "location" in metadata ? (metadata as { location?: unknown }).location : metadata;
  if (!row || typeof row !== "object") return null;
  const location = row as Record<string, unknown>;
  return String(location.id ?? location._id ?? location.locationId ?? "").trim() || null;
}

async function checkReadScope(label: string, probe: () => Promise<unknown>) {
  try {
    await probe();
    return { label, available: true };
  } catch (error) {
    if (error instanceof GhlIntegrationError && error.code === "authorization_failed") return { label, available: false };
    if (error instanceof GhlIntegrationError && error.code === "provider_request_failed") return { label, available: null };
    throw error;
  }
}

export async function testGhlConnection(connection: GhlConnection) {
  assertGhlReadMode();
  const tokenPresent = tokenPresentForConnection(connection);
  if (isMockGhlConnection(connection)) {
    const client = new MockGhlClient(connection.display_name.replace(/\s+Mock GoHighLevel$/, ""));
    const [contacts, calendars] = await Promise.all([client.getContacts(), client.getCalendars()]);
    return {
      connected: true,
      mock: true,
      locationId: connection.ghl_location_id,
      returnedLocationId: connection.ghl_location_id,
      locationName: connection.display_name.replace(/\s+Mock GoHighLevel$/, ""),
      availableObjects: ["contacts", "calendars", "appointments", "conversations", "messages", "opportunities", "payments"],
      counts: { contacts: contacts.data.length, calendars: calendars.data.length },
      missingScopes: [],
      scopeChecks: [],
      locationIdMatches: true
    };
  }
  if (!tokenPresent) {
    return {
      connected: false,
      mock: false,
      locationId: connection.ghl_location_id,
      returnedLocationId: null,
      locationName: null,
      availableObjects: GHL_SUPPORTED_OBJECT_TYPES,
      counts: {},
      missingScopes: ["private integration token"],
      scopeChecks: [],
      locationIdMatches: false
    };
  }
  const client = new GhlReadOnlyClient(connection);
  const metadata = await client.getLocationMetadata();
  const scopeChecks = await Promise.all([
    checkReadScope("locations/tags.readonly", () => client.getTags()),
    checkReadScope("locations/customFields.readonly", () => client.getCustomFields()),
    checkReadScope("users.readonly", () => client.getLocationUsers())
  ]);
  const returnedLocationId = locationIdFromMetadata(metadata);
  const missingScopes = scopeChecks.filter((scope) => scope.available === false).map((scope) => scope.label);
  return {
    connected: tokenPresent && returnedLocationId === connection.ghl_location_id,
    mock: false,
    locationId: connection.ghl_location_id,
    returnedLocationId,
    locationName: locationNameFromMetadata(metadata),
    availableObjects: GHL_SUPPORTED_OBJECT_TYPES,
    counts: {},
    missingScopes: tokenPresent ? missingScopes : ["private integration token"],
    scopeChecks,
    locationIdMatches: returnedLocationId === connection.ghl_location_id
  };
}

export async function createSyncRun(
  supabase: SupabaseClient,
  profile: CurrentProfile,
  connection: GhlConnection,
  syncType: "connection_test" | "dry_run" | "full_import" | "incremental" | "reconciliation" | "manual_object_sync",
  objectType: GhlObjectType | null,
  counts: GhlSyncCounts = emptyCounts(),
  metadata: Record<string, unknown> = {}
) {
  assertGhlPermission(profile, syncType === "reconciliation" ? "integrations.ghl.reconcile" : "integrations.ghl.sync");
  const { data, error } = await supabase
    .from("ghl_sync_runs")
    .insert({
      organization_id: profile.organizationId,
      connection_id: connection.id,
      sync_type: syncType,
      object_type: objectType,
      status: "succeeded",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      records_fetched: counts.fetched,
      records_created: counts.created,
      records_updated: counts.updated,
      records_unchanged: counts.unchanged,
      records_skipped: counts.skipped,
      records_failed: counts.failed,
      pages_fetched: counts.pages,
      metadata_safe: { phase: 21, read_only: true, object_type: objectType, ...metadata }
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data?.id as string;
}
