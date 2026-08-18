import type { CurrentProfile } from "@/lib/auth/profile";

const rolePermissions: Record<string, string[]> = {
  owner: ["*"],
  administrator: ["*"],
  manager: [
    "accounting.read",
    "accounting.mappings.read",
    "accounting.exports.read",
    "accounting.reconciliation.read",
    "accounting.exceptions.read",
    "accounting.close.read",
    "accounting.reports.read"
  ],
  salesperson: [],
  provider: []
};

export function hasAccountingPermission(profile: Pick<CurrentProfile, "role">, permission: string) {
  const permissions = rolePermissions[profile.role] ?? [];
  return permissions.includes("*") || permissions.includes(permission);
}

export function assertAccountingPermission(profile: Pick<CurrentProfile, "role">, permission: string) {
  if (!hasAccountingPermission(profile, permission)) {
    throw new Error("You do not have permission for this accounting action");
  }
}

export function accountingLocationAllowed(profile: CurrentProfile, locationId: string | null | undefined) {
  if (!locationId) return true;
  return profile.locations.some((location) => location.id === locationId);
}

export function canManageAccounting(profile: Pick<CurrentProfile, "role">) {
  return hasAccountingPermission(profile, "accounting.manage") || hasAccountingPermission(profile, "accounting.connections.manage");
}
