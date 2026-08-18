import type { CurrentProfile } from "@/lib/auth/profile";

const rolePermissions: Record<string, string[]> = {
  owner: ["*"],
  administrator: ["*"],
  manager: [
    "executive.read",
    "executive.location.read",
    "executive.targets.read",
    "executive.alerts.read",
    "executive.forecast.read",
    "executive.reports.read",
    "executive.expansion.read"
  ],
  salesperson: [],
  provider: []
};

export function hasExecutivePermission(profile: CurrentProfile, permission: string) {
  const permissions = rolePermissions[profile.role] ?? [];
  return permissions.includes("*") || permissions.includes(permission);
}

export function assertExecutivePermission(profile: CurrentProfile, permission: string) {
  if (!hasExecutivePermission(profile, permission)) {
    throw new Error("You do not have permission to access the executive command center");
  }
}

export function canManageExecutiveSettings(profile: CurrentProfile) {
  return hasExecutivePermission(profile, "executive.targets.manage") || profile.role === "owner" || profile.role === "administrator";
}

export function canReadAggregateLaborCost(profile: CurrentProfile) {
  return hasExecutivePermission(profile, "executive.read") || profile.role === "manager";
}

export function canReadClinicalAggregate(profile: CurrentProfile) {
  return hasExecutivePermission(profile, "executive.location.read");
}
