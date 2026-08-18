const allowedPrefixes = [
  "/mobile",
  "/notifications",
  "/dashboard",
  "/contacts",
  "/calendar",
  "/calls",
  "/tasks",
  "/sales",
  "/clinical",
  "/inventory",
  "/time-clock",
  "/portal",
  "/executive",
  "/accounting",
  "/settings"
];

export function parseSafeRoute(route: string | null | undefined) {
  const value = String(route ?? "").trim();
  if (!value.startsWith("/")) return "/mobile";
  if (value.startsWith("//") || value.includes("://")) return "/mobile";
  return allowedPrefixes.some((prefix) => value === prefix || value.startsWith(`${prefix}/`)) ? value : "/mobile";
}

export function buildWebLink(route: string) {
  return parseSafeRoute(route);
}

export function buildNativeFutureLink(route: string) {
  return `avora://${parseSafeRoute(route).replace(/^\//, "")}`;
}
