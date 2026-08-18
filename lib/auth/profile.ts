import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { APP_DISPLAY_NAME } from "@/lib/config/branding";

export type LocationOption = {
  id: string;
  name: string;
  slug: string;
};

export type CurrentProfile = {
  id: string;
  organizationId: string;
  fullName: string;
  email: string;
  title: string | null;
  role: string;
  organization: string;
  locations: LocationOption[];
};

type ProfileRow = {
  id: string;
  organization_id: string;
  full_name: string;
  email: string;
  title: string | null;
  roles: { name: string } | { name: string }[] | null;
  organizations: { name: string } | { name: string }[] | null;
  user_locations:
    | Array<{
        locations:
          | { id: string; name: string; slug: string }
          | { id: string; name: string; slug: string }[]
          | null;
      }>
    | null;
};

type UserLocationRow = NonNullable<ProfileRow["user_locations"]>[number];

function firstRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const { data, error } = await supabase
    .from("user_profiles")
    .select(
      `
        id,
        organization_id,
        full_name,
        email,
        title,
        roles(name),
        organizations(name),
        user_locations(
          locations(id, name, slug)
        )
      `
    )
    .eq("id", user.id)
    .single();

  if (error || !data) {
    return null;
  }

  const profile = data as unknown as ProfileRow;
  const role = firstRelation(profile.roles);
  const organization = firstRelation(profile.organizations);
  const locations =
    profile.user_locations
      ?.map((entry: UserLocationRow) => entry.locations)
      .map((location) => firstRelation(location))
      .filter(
        (location): location is LocationOption =>
          Boolean(location)
      ) ?? [];

  return {
    id: profile.id,
    organizationId: profile.organization_id,
    fullName: profile.full_name,
    email: profile.email,
    title: profile.title,
    role: role?.name ?? "member",
    organization: organization?.name ?? APP_DISPLAY_NAME,
    locations
  };
}

export async function requireCurrentProfile() {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/login");
  }

  return profile;
}
