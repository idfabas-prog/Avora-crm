import type { CurrentProfile } from "@/lib/auth/profile";
import type { CampaignPermission } from "./types";

const rolePermissions: Record<string, string[]> = {
  owner: ["*"],
  administrator: ["*"],
  manager: [
    "campaigns.read",
    "campaigns.create",
    "campaigns.edit",
    "campaigns.pause",
    "campaigns.cancel",
    "campaigns.recipients.read",
    "campaigns.analytics.read",
    "suppression.read"
  ],
  salesperson: [],
  provider: []
};

export function hasCampaignPermission(profile: CurrentProfile, permission: CampaignPermission) {
  const permissions = rolePermissions[profile.role] ?? [];
  return permissions.includes("*") || permissions.includes(permission);
}

export function assertCampaignPermission(profile: CurrentProfile, permission: CampaignPermission) {
  if (!hasCampaignPermission(profile, permission)) {
    throw new Error("You do not have permission to manage campaigns");
  }
}

export function canManageSuppression(profile: CurrentProfile) {
  return hasCampaignPermission(profile, "suppression.manage");
}

export function campaignLocationAllowed(profile: CurrentProfile, locationId: string | null | undefined) {
  if (!locationId) return true;
  return profile.locations.some((location) => location.id === locationId);
}
