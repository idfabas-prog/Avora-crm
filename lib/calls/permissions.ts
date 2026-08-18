import type { CurrentProfile } from "@/lib/auth/profile";
import type { CallPermission } from "./types";

const rolePermissions: Record<string, string[]> = {
  owner: ["*"],
  administrator: ["*"],
  manager: [
    "calls.read",
    "calls.make",
    "calls.answer",
    "calls.manage",
    "calls.queues.read",
    "calls.queues.manage",
    "calls.recordings.read",
    "calls.transcripts.read",
    "calls.ai_summary",
    "calls.analytics.read",
    "calls.settings.manage",
    "calls.dispositions.manage",
    "calls.scripts.manage"
  ],
  salesperson: ["calls.read", "calls.make", "calls.answer", "calls.queues.read", "calls.ai_summary"],
  provider: ["calls.read"]
};

export function hasCallPermission(profile: Pick<CurrentProfile, "role">, permission: CallPermission) {
  const permissions = rolePermissions[profile.role] ?? [];
  return permissions.includes("*") || permissions.includes(permission);
}

export function assertCallPermission(profile: Pick<CurrentProfile, "role">, permission: CallPermission) {
  if (!hasCallPermission(profile, permission)) {
    throw new Error("You do not have permission to access call-center data");
  }
}

export function callLocationAllowed(profile: Pick<CurrentProfile, "locations">, locationId: string | null | undefined) {
  if (!locationId) return true;
  return profile.locations.some((location) => location.id === locationId);
}

export function canReadCallRecording(profile: Pick<CurrentProfile, "role">) {
  return hasCallPermission(profile, "calls.recordings.read");
}

export function canReadCallTranscript(profile: Pick<CurrentProfile, "role">) {
  return hasCallPermission(profile, "calls.transcripts.read");
}
