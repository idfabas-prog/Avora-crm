type SupabaseApiKeyDescription = {
  present: boolean;
  format: "sb_secret" | "sb_publishable" | "jwt" | "unknown";
  role: string | null;
  projectRef: string | null;
  issuer: string | null;
  isServerAdminKey: boolean;
  isBrowserPublishableKey: boolean;
};

function decodeJwtPayload(value: string) {
  const parts = value.split(".");
  if (parts.length !== 3) return null;

  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    if (typeof atob !== "function") return null;
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function supabaseProjectRefFromUrl(url: string | undefined) {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    return host.endsWith(".supabase.co") ? host.split(".")[0] : null;
  } catch {
    return null;
  }
}

export function describeSupabaseApiKey(value: string | undefined): SupabaseApiKeyDescription {
  const key = value?.trim() ?? "";
  const payload = decodeJwtPayload(key);
  const format = key.startsWith("sb_secret_")
    ? "sb_secret"
    : key.startsWith("sb_publishable_")
      ? "sb_publishable"
      : payload
        ? "jwt"
        : "unknown";
  const role = typeof payload?.role === "string" ? payload.role : null;
  const projectRef = typeof payload?.ref === "string" ? payload.ref : null;
  const issuer = typeof payload?.iss === "string" ? payload.iss : null;

  return {
    present: Boolean(key),
    format,
    role,
    projectRef,
    issuer,
    isServerAdminKey: format === "sb_secret" || role === "service_role",
    isBrowserPublishableKey: format === "sb_publishable" || role === "anon"
  };
}

function assertSupabaseKeyPair(url: string, serviceRoleKey: string) {
  const urlRef = supabaseProjectRefFromUrl(url);
  const adminKey = describeSupabaseApiKey(serviceRoleKey);

  if (!adminKey.isServerAdminKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is present but is not a Supabase server admin API key. Use a Secret key beginning with sb_secret_ or a legacy service_role JWT from the same staging project."
    );
  }

  if (adminKey.projectRef && urlRef && adminKey.projectRef !== urlRef) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY belongs to a different Supabase project than NEXT_PUBLIC_SUPABASE_URL."
    );
  }
}

export function getSupabaseBrowserConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    );
  }

  return { url, publishableKey };
}

export function getSupabaseServiceRoleKey() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }

  return serviceRoleKey;
}

export function getSupabaseAdminConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = getSupabaseServiceRoleKey();

  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }

  assertSupabaseKeyPair(url, serviceRoleKey);

  return { url, serviceRoleKey };
}
