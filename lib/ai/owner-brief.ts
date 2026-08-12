import type { CurrentProfile } from "@/lib/auth/profile";
import { getOwnerAnalytics } from "./analytics";

export async function buildOwnerBrief(supabase: unknown, profile: CurrentProfile, locationIds: string[]) {
  const result = await getOwnerAnalytics(supabase, profile, locationIds, "today owner brief");
  return {
    title: "Daily AI Brief",
    summary: [...result.facts.slice(0, 2), ...result.analysis.slice(0, 2), ...result.recommendations.slice(0, 2)],
    trace: result.trace
  };
}
