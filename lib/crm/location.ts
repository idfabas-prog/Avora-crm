import { cookies } from "next/headers";
import type { CurrentProfile } from "@/lib/auth/profile";

export const locationCookieName = "avora_location_id";

export async function getSelectedLocationId(profile: CurrentProfile) {
  const cookieStore = await cookies();
  const selected = cookieStore.get(locationCookieName)?.value;

  if (!selected || selected === "all") {
    return null;
  }

  if (!profile.locations.some((location) => location.id === selected)) {
    try {
      cookieStore.set(locationCookieName, "all", {
        path: "/",
        sameSite: "lax"
      });
    } catch {
      // Server Components may be read-only; the invalid value is still ignored.
    }

    return null;
  }

  return selected;
}

export function allowedLocationIds(profile: CurrentProfile, selectedLocationId: string | null) {
  if (selectedLocationId) {
    return [selectedLocationId];
  }

  return profile.locations.map((location) => location.id);
}
