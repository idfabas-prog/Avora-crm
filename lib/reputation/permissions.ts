import type { CurrentProfile } from "@/lib/auth/profile";

export type ReputationPermission =
  | "reputation.read"
  | "reputation.manage"
  | "reputation.reviews.read"
  | "reputation.reviews.respond"
  | "reputation.feedback.read"
  | "reputation.feedback.manage"
  | "referrals.read"
  | "referrals.manage"
  | "referrals.rewards.manage"
  | "reactivation.read"
  | "reactivation.manage"
  | "reputation.reports.read";

const rolePermissions: Record<string, ReputationPermission[]> = {
  owner: [
    "reputation.read",
    "reputation.manage",
    "reputation.reviews.read",
    "reputation.reviews.respond",
    "reputation.feedback.read",
    "reputation.feedback.manage",
    "referrals.read",
    "referrals.manage",
    "referrals.rewards.manage",
    "reactivation.read",
    "reactivation.manage",
    "reputation.reports.read"
  ],
  administrator: [
    "reputation.read",
    "reputation.manage",
    "reputation.reviews.read",
    "reputation.reviews.respond",
    "reputation.feedback.read",
    "reputation.feedback.manage",
    "referrals.read",
    "referrals.manage",
    "referrals.rewards.manage",
    "reactivation.read",
    "reactivation.manage",
    "reputation.reports.read"
  ],
  manager: [
    "reputation.read",
    "reputation.reviews.read",
    "reputation.reviews.respond",
    "reputation.feedback.read",
    "reputation.feedback.manage",
    "referrals.read",
    "referrals.manage",
    "reactivation.read",
    "reactivation.manage",
    "reputation.reports.read"
  ],
  salesperson: ["referrals.read", "referrals.manage", "reactivation.read"],
  provider: ["reputation.feedback.read", "reputation.reviews.read"]
};

export function hasReputationPermission(profile: CurrentProfile, permission: ReputationPermission) {
  return Boolean(rolePermissions[profile.role]?.includes(permission));
}

export function assertReputationPermission(profile: CurrentProfile, permission: ReputationPermission) {
  if (!hasReputationPermission(profile, permission)) {
    throw new Error(`Missing ${permission} permission`);
  }
}

export function reputationLocationAllowed(profile: CurrentProfile, locationId: string | null | undefined) {
  if (!locationId) return true;
  return profile.locations.some((location) => location.id === locationId);
}
