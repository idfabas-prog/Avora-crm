import type { CurrentProfile } from "../auth/profile";

const rolePermissions: Record<string, string[]> = {
  owner: ["*"],
  administrator: ["*"],
  manager: ["workflows.read", "workflows.create", "workflows.edit", "workflows.pause", "workflows.enroll", "workflows.stop", "workflows.logs.read"],
  salesperson: ["workflows.read", "workflows.enroll", "workflows.stop", "workflows.logs.read"],
  provider: []
};

export function hasWorkflowPermission(profile: CurrentProfile, permission: string) {
  const permissions = rolePermissions[profile.role] ?? [];
  return permissions.includes("*") || permissions.includes(permission);
}

export function assertWorkflowPermission(profile: CurrentProfile, permission: string) {
  if (!hasWorkflowPermission(profile, permission)) {
    throw new Error("You do not have permission to perform this workflow action");
  }
}
