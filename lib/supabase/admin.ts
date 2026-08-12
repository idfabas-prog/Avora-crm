import { createClient } from "@supabase/supabase-js";
import { getSupabaseBrowserConfig, getSupabaseServiceRoleKey } from "./env";

export function createAdminClient() {
  const { url } = getSupabaseBrowserConfig();

  return createClient(url, getSupabaseServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
