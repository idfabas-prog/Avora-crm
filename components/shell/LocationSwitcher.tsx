"use client";

import { useTransition } from "react";
import { updateSelectedLocation } from "@/app/actions";
import type { LocationOption } from "@/lib/auth/profile";

export function LocationSwitcher({
  organization,
  locations,
  selectedLocationId
}: {
  organization: string;
  locations: LocationOption[];
  selectedLocationId: string | null;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <label className="location-switcher">
      <span>Organization</span>
      <select
        aria-label="Location filter"
        defaultValue={selectedLocationId ?? "all"}
        disabled={pending}
        onChange={(event) => {
          const formData = new FormData();
          formData.set("location_id", event.target.value);
          startTransition(async () => {
            await updateSelectedLocation(formData);
          });
        }}
      >
        <option value="all">{organization} / All allowed locations</option>
        {locations.map((location) => (
          <option key={location.id} value={location.id}>
            {location.name}
          </option>
        ))}
      </select>
    </label>
  );
}
