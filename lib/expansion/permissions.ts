import type { CurrentProfile } from "@/lib/auth/profile";

const expansionRolePermissions: Record<string, string[]> = {
  owner: ["*"],
  administrator: ["*"],
  manager: [
    "expansion.read",
    "expansion.projects.manage",
    "expansion.sites.manage",
    "expansion.checklists.manage",
    "expansion.readiness.read",
    "expansion.readiness.manage",
    "territories.read",
    "regions.read",
    "entities.read",
    "brand_audits.read",
    "brand_audits.manage",
    "management_fees.read",
    "operator.read"
  ],
  salesperson: [],
  provider: []
};

export function hasExpansionPermission(profile: CurrentProfile, permission: string) {
  const permissions = expansionRolePermissions[profile.role] ?? [];
  return permissions.includes("*") || permissions.includes(permission);
}

export function assertExpansionPermission(profile: CurrentProfile, permission: string) {
  if (!hasExpansionPermission(profile, permission)) {
    throw new Error("You do not have permission to access expansion management");
  }
}

export function canReadExpansionFinancials(profile: CurrentProfile) {
  return hasExpansionPermission(profile, "expansion.financials.read") || profile.role === "owner" || profile.role === "administrator";
}

export function canManageExpansion(profile: CurrentProfile) {
  return hasExpansionPermission(profile, "expansion.manage") || hasExpansionPermission(profile, "expansion.projects.manage");
}

export function canReadPlannedCompensation(profile: CurrentProfile) {
  return hasExpansionPermission(profile, "expansion.financials.read") || profile.role === "owner" || profile.role === "administrator";
}
