import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentProfile } from "@/lib/auth/profile";
import { getGhlDashboardReport } from "@/lib/integrations/gohighlevel/reports";

export async function getGhlIntegrationSummary(supabase: SupabaseClient, profile: CurrentProfile) {
  const report = await getGhlDashboardReport(supabase, profile);
  const mappedTotal = Object.values(report.mappedCounts).reduce((sum, value) => sum + Number(value), 0);
  return {
    facts: [
      `GoHighLevel integration mode: ${report.mode}.`,
      `Configured connections visible to this user: ${report.connections.length}.`,
      `Mapped external records: ${mappedTotal}.`,
      `Open exceptions: ${report.exceptionCounts.open ?? 0}.`
    ],
    analysis: [
      report.writesAllowed ? "Write gate is unexpectedly enabled; Phase 21 should remain read-only." : "GoHighLevel write gate is disabled.",
      report.readSyncEnabled ? "Read sync is allowed by environment mode or gate." : "Read sync is currently gated off."
    ],
    recommendations: [
      "Run a dry run before the first real historical import.",
      "Connect one GoHighLevel location first, reconcile, then add the next sub-account.",
      "Keep GoHighLevel as source of truth until parity and webhook stability are proven."
    ],
    trace: {
      tools: ["getGhlDashboardReport"],
      locations: profile.locations.map((location) => location.name),
      recordCounts: {
        ghl_connections: report.connections.length,
        external_record_mappings: mappedTotal,
        ghl_sync_runs: report.runs.length,
        ghl_webhook_events: report.webhookEvents.length
      }
    }
  };
}
