import type { CurrentProfile } from "@/lib/auth/profile";

const rolePermissions: Record<string, string[]> = {
  owner: ["portal.read", "portal.manage", "portal.settings.manage", "memberships.read", "memberships.manage", "payment_plans.read", "payment_plans.manage", "portal.reports.read"],
  administrator: ["portal.read", "portal.manage", "portal.settings.manage", "memberships.read", "memberships.manage", "payment_plans.read", "payment_plans.manage", "portal.reports.read"],
  manager: ["portal.read", "portal.manage", "memberships.read", "payment_plans.read", "portal.reports.read"],
  provider: ["portal.read", "memberships.read", "payment_plans.read"],
  salesperson: []
};

export function hasPortalPermission(profile: CurrentProfile, permission: string) {
  return rolePermissions[profile.role]?.includes(permission) ?? false;
}
