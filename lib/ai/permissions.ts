import type { CurrentProfile } from "@/lib/auth/profile";

const aiRolePermissions: Record<string, string[]> = {
  owner: ["*"],
  administrator: ["*"],
  manager: ["ai.use", "ai.owner_analytics", "ai.sales_insights", "ai.conversation_summary", "ai.suggest_reply", "ai.lead_scoring", "ai.usage.read", "ai.operating_brief", "ai.proactive_insights", "ai.predictions.read", "ai.recommendations.read", "ai.risk.read", "ai.collections.read", "ai.location_intelligence"],
  salesperson: ["ai.use", "ai.sales_insights", "ai.conversation_summary", "ai.suggest_reply", "ai.lead_scoring", "ai.operating_brief", "ai.predictions.read", "ai.recommendations.read", "ai.risk.read"],
  provider: ["ai.operating_brief", "ai.recommendations.read"]
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
