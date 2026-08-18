import type { CurrentProfile } from "@/lib/auth/profile";

const marketingRolePermissions: Record<string, string[]> = {
  owner: ["*"],
  administrator: ["*"],
  manager: ["marketing.read", "marketing.spend.read", "marketing.attribution.read", "marketing.reports.read"],
  salesperson: ["marketing.read", "marketing.attribution.read"],
  provider: []
};

export function hasMarketingPermission(profile: CurrentProfile, permission: string) {
  const permissions = marketingRolePermissions[profile.role] ?? [];
  return permissions.includes("*") || permissions.includes(permission);
}

export function assertMarketingPermission(profile: CurrentProfile, permission: string) {
  if (!hasMarketingPermission(profile, permission)) {
    throw new Error("You do not have permission to access this marketing feature");
  }
}
