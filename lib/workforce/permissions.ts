import type { CurrentProfile } from "@/lib/auth/profile";

const rolePermissions: Record<string, string[]> = {
  owner: ["*"],
  administrator: ["*"],
  manager: [
    "workforce.read",
    "workforce.schedule.read",
    "workforce.schedule.write",
    "workforce.time_entries.read",
    "workforce.time_entries.manage",
    "workforce.timesheets.read",
    "workforce.timesheets.approve",
    "workforce.pto.read",
    "workforce.pto.manage",
    "workforce.reports.read",
    "workforce.settings.manage"
  ],
  provider: [
    "workforce.read",
    "workforce.schedule.read",
    "workforce.timeclock.use",
    "workforce.time_entries.read",
    "workforce.pto.read",
    "workforce.pto.request",
    "workforce.timesheets.read"
  ],
  salesperson: [
    "workforce.read",
    "workforce.schedule.read",
    "workforce.timeclock.use",
    "workforce.time_entries.read",
    "workforce.pto.read",
    "workforce.pto.request",
    "workforce.timesheets.read"
  ]
};

export function hasWorkforcePermission(profile: CurrentProfile, permission: string) {
  const permissions = rolePermissions[profile.role] ?? [];
  return permissions.includes("*") || permissions.includes(permission);
}

export function assertWorkforcePermission(profile: CurrentProfile, permission: string) {
  if (!hasWorkforcePermission(profile, permission)) {
    throw new Error("You do not have permission for this workforce action");
  }
}

export function workforceLocationAllowed(profile: CurrentProfile, locationId: string | null | undefined) {
  if (!locationId) return false;
  return profile.locations.some((location) => location.id === locationId);
}

export function canViewCompensation(profile: CurrentProfile) {
  return hasWorkforcePermission(profile, "workforce.compensation.read");
}
