import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseBrowserConfig } from "./env";

export function createClient() {
  const { url, publishableKey } = getSupabaseBrowserConfig();

  return createBrowserClient(url, publishableKey);
}
