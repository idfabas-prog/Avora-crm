import type { CurrentProfile } from "@/lib/auth/profile";

const rolePermissions: Record<string, string[]> = {
  owner: ["*"],
  administrator: ["*"],
  manager: [
    "inventory.read",
    "inventory.write",
    "inventory.adjust",
    "inventory.waste",
    "inventory.transfer",
    "inventory.purchase_orders.read",
    "inventory.purchase_orders.create",
    "inventory.receive",
    "inventory.cogs.read",
    "inventory.reports.read"
  ],
  provider: ["inventory.read", "inventory.write"],
  salesperson: []
};

export function hasInventoryPermission(profile: CurrentProfile, permission: string) {
  const permissions = rolePermissions[profile.role] ?? [];
  return permissions.includes("*") || permissions.includes(permission);
}

export function assertInventoryPermission(profile: CurrentProfile, permission: string) {
  if (!hasInventoryPermission(profile, permission)) {
    throw new Error("You do not have permission for this inventory action");
  }
}

export function inventoryLocationAllowed(profile: CurrentProfile, locationId: string | null | undefined) {
  if (!locationId) return false;
  return profile.locations.some((location) => location.id === locationId);
}
