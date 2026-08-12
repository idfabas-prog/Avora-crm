import type { CurrentProfile } from "@/lib/auth/profile";

const aiRolePermissions: Record<string, string[]> = {
  owner: ["*"],
  administrator: ["*"],
  manager: ["ai.use", "ai.owner_analytics", "ai.sales_insights", "ai.conversation_summary", "ai.suggest_reply", "ai.lead_scoring", "ai.usage.read"],
  salesperson: ["ai.use", "ai.sales_insights", "ai.conversation_summary", "ai.suggest_reply", "ai.lead_scoring"],
  provider: []
};

export function hasAiPermission(profile: CurrentProfile, permission: string) {
  const permissions = aiRolePermissions[profile.role] ?? [];
  return permissions.includes("*") || permissions.includes(permission);
}

export function assertAiPermission(profile: CurrentProfile, permission: string) {
  if (!hasAiPermission(profile, permission)) {
    throw new Error("You do not have permission to use this AI feature");
  }
}

export function aiLocationIds(profile: CurrentProfile, selectedLocationId: string | null) {
  if (selectedLocationId) return [selectedLocationId];
  return profile.locations.map((location) => location.id);
}
