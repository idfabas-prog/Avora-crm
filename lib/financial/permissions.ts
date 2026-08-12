import type { CurrentProfile } from "@/lib/auth/profile";

const rolePermissions: Record<string, string[]> = {
  owner: ["*"],
  administrator: ["*"],
  manager: [
    "services.manage",
    "sales.read",
    "sales.write",
    "sales.adjust",
    "payments.read",
    "payments.write",
    "payments.refund",
    "commissions.read",
    "commissions.manage",
    "royalties.read",
    "financial_reports.read"
  ],
  salesperson: ["sales.read", "sales.write", "payments.read", "payments.write", "commissions.read"],
  provider: ["sales.read", "payments.read"]
};

export function hasFinancialPermission(profile: CurrentProfile, permission: string) {
  const permissions = rolePermissions[profile.role] ?? [];
  return permissions.includes("*") || permissions.includes(permission);
}

export function assertFinancialPermission(profile: CurrentProfile, permission: string) {
  if (!hasFinancialPermission(profile, permission)) {
    throw new Error("You do not have permission to perform this financial action");
  }
}

export function canManageFinancialSettings(profile: CurrentProfile) {
  return hasFinancialPermission(profile, "services.manage") || hasFinancialPermission(profile, "commissions.manage") || hasFinancialPermission(profile, "royalties.manage");
}
