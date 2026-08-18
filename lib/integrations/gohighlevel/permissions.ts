import type { CurrentProfile } from "@/lib/auth/profile";

const ownerPermissions = new Set([
  "integrations.ghl.read",
  "integrations.ghl.manage",
  "integrations.ghl.sync",
  "integrations.ghl.reconcile",
  "integrations.ghl.exceptions.manage",
  "integrations.ghl.credentials.manage",
  "integrations.ghl.audit.read"
]);

const adminPermissions = ownerPermissions;
const managerPermissions = new Set(["integrations.ghl.read"]);

export function hasGhlPermission(profile: Pick<CurrentProfile, "role">, permission: string) {
  if (profile.role === "owner") return ownerPermissions.has(permission);
  if (profile.role === "administrator") return adminPermissions.has(permission);
  if (profile.role === "manager") return managerPermissions.has(permission);
  return false;
}

export function assertGhlPermission(profile: Pick<CurrentProfile, "role">, permission: string) {
  if (!hasGhlPermission(profile, permission)) {
    throw new Error("You do not have permission to access GoHighLevel integration features");
  }
}

export function ghlLocationAllowed(profile: Pick<CurrentProfile, "role" | "locations">, locationId: string | null | undefined) {
  if (!locationId) return profile.role === "owner" || profile.role === "administrator";
  if (profile.role === "owner" || profile.role === "administrator") return true;
  return profile.locations.some((location) => location.id === locationId);
}
