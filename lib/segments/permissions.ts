import type { CurrentProfile } from "@/lib/auth/profile";

const rolePermissions: Record<string, string[]> = {
  owner: ["*"],
  administrator: ["*"],
  manager: ["segments.read", "segments.manage"],
  salesperson: [],
  provider: []
};

export function hasSegmentPermission(profile: CurrentProfile, permission: string) {
  const permissions = rolePermissions[profile.role] ?? [];
  return permissions.includes("*") || permissions.includes(permission);
}

export function assertSegmentPermission(profile: CurrentProfile, permission: string) {
  if (!hasSegmentPermission(profile, permission)) {
    throw new Error("You do not have permission to manage segments");
  }
}

export function segmentLocationAllowed(profile: CurrentProfile, locationId: string | null | undefined) {
  if (!locationId) return true;
  return profile.locations.some((location) => location.id === locationId);
}
