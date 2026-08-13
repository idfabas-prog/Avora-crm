import type { CurrentProfile } from "@/lib/auth/profile";

const clinicalRolePermissions: Record<string, string[]> = {
  owner: ["*"],
  administrator: ["*"],
  manager: [
    "clinical.read",
    "clinical.write",
    "clinical.notes.read",
    "clinical.notes.write",
    "clinical.photos.read",
    "clinical.photos.write",
    "clinical.documents.read",
    "clinical.documents.write",
    "clinical.consents.read",
    "clinical.consents.manage",
    "clinical.treatment_plans.read",
    "clinical.treatment_plans.write",
    "clinical.sessions.read",
    "clinical.sessions.write",
    "clinical.entitlements.read",
    "clinical.audit.read"
  ],
  provider: [
    "clinical.read",
    "clinical.write",
    "clinical.notes.read",
    "clinical.notes.write",
    "clinical.notes.sign",
    "clinical.photos.read",
    "clinical.photos.write",
    "clinical.documents.read",
    "clinical.documents.write",
    "clinical.consents.read",
    "clinical.consents.manage",
    "clinical.treatment_plans.read",
    "clinical.treatment_plans.write",
    "clinical.sessions.read",
    "clinical.sessions.write",
    "clinical.entitlements.read",
    "clinical.audit.read"
  ],
  salesperson: ["clinical.entitlements.read"]
};

export function hasClinicalPermission(profile: CurrentProfile, permission: string) {
  const permissions = clinicalRolePermissions[profile.role] ?? [];
  return permissions.includes("*") || permissions.includes(permission);
}

export function assertClinicalPermission(profile: CurrentProfile, permission: string) {
  if (!hasClinicalPermission(profile, permission)) {
    throw new Error("You do not have permission to access this clinical feature");
  }
}

export function clinicalLocationAllowed(profile: CurrentProfile, locationId: string | null | undefined) {
  if (!locationId) return true;
  return profile.locations.some((location) => location.id === locationId);
}

export function assertClinicalLocation(profile: CurrentProfile, locationId: string | null | undefined) {
  if (!clinicalLocationAllowed(profile, locationId)) {
    throw new Error("Clinical location is not available for this user");
  }
}
