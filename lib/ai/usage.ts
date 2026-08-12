import type { CurrentProfile } from "@/lib/auth/profile";
import { getAiConfig } from "./config";

type CountQuery = PromiseLike<{ count: number | null; error: { message: string } | null }>;
type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string, options?: { count?: "exact"; head?: boolean }) => {
      eq: (column: string, value: string) => {
        gte: (column: string, value: string) => CountQuery;
      };
    };
  };
};

export async function assertAiUsageAllowed(supabase: unknown, profile: CurrentProfile) {
  const db = supabase as SupabaseLike;
  const config = getAiConfig();
  if (config.mode === "disabled") {
    throw new Error("AI is disabled for this environment");
  }
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const result = await db
    .from("ai_requests")
    .select("*", { count: "exact", head: true })
    .eq("user_id", profile.id)
    .gte("created_at", start.toISOString());
  if ((result.count ?? 0) >= config.maxDailyRequests) {
    throw new Error("Daily AI request limit reached");
  }
}
