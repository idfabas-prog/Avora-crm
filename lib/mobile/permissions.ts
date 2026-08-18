import type { CurrentProfile } from "@/lib/auth/profile";

const rolePermissions: Record<string, string[]> = {
  owner: ["*"],
  administrator: ["*"],
  manager: ["mobile.use", "mobile.staff"],
  salesperson: ["mobile.use", "mobile.staff"],
  provider: ["mobile.use", "mobile.staff"]
};

export function hasMobilePermission(profile: Pick<CurrentProfile, "role">, permission: string) {
  const permissions = rolePermissions[profile.role] ?? [];
  return permissions.includes("*") || permissions.includes(permission);
}

export function assertMobilePermission(profile: Pick<CurrentProfile, "role">, permission: string) {
  if (!hasMobilePermission(profile, permission)) {
    throw new Error("You do not have permission for this mobile action");
  }
}
