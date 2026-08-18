import type { CurrentProfile } from "@/lib/auth/profile";

export const highRiskPermissions = [
  "payments.write",
  "refunds.write",
  "compensation.manage",
  "clinical.write",
  "accounting.exports.execute",
  "campaigns.launch",
  "calls.manage",
  "system.manage",
  "system.features.manage",
  "system.security.manage",
  "system.workers.manage",
  "system.incidents.manage"
];

export function canManageSystem(profile: Pick<CurrentProfile, "role">) {
  return profile.role === "owner" || profile.role === "administrator";
}

export function assertSystemAccess(profile: Pick<CurrentProfile, "role">) {
  if (!canManageSystem(profile)) {
    throw new Error("You do not have permission to access system administration");
  }
}

export function accessReviewRisk(permissions: string[], lastActiveAt: string | null) {
  const risky = permissions.filter((permission) => highRiskPermissions.includes(permission));
  const inactive = lastActiveAt ? Date.now() - new Date(lastActiveAt).getTime() > 90 * 86_400_000 : true;
  return {
    highRiskPermissions: risky,
    inactive,
    status: risky.length > 0 || inactive ? "review" : "ok"
  };
}
