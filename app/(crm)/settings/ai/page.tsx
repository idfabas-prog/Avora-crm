import { RefreshInsightsButton } from "@/components/crm/AiForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { assertAiPermission } from "@/lib/ai/permissions";
import { getAiConfig } from "@/lib/ai/config";
import { aiStatusMessage, humanFeatureToggleLabel } from "@/lib/ai/display";

export default async function AiSettingsPage() {
  const profile = await requireCurrentProfile();
  assertAiPermission(profile, "ai.usage.read");
  const supabase = await createClient();
  const config = getAiConfig();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const month = new Date(today.getFullYear(), today.getMonth(), 1);
  const [{ count: requestsToday }, { count: requestsMonth }, { data: features }, { data: requests }] = await Promise.all([
    supabase.from("ai_requests").select("*", { count: "exact", head: true }).eq("organization_id", profile.organizationId).gte("created_at", today.toISOString()),
    supabase.from("ai_requests").select("*", { count: "exact", head: true }).eq("organization_id", profile.organizationId).gte("created_at", month.toISOString()),
    supabase.from("ai_feature_settings").select("feature_key, enabled").eq("organization_id", profile.organizationId).order("feature_key"),
    supabase.from("ai_requests").select("feature, input_tokens, output_tokens, estimated_cost, status, created_at").eq("organization_id", profile.organizationId).order("created_at", { ascending: false }).limit(20)
  ]);
  const tokenTotal = (requests ?? []).reduce((sum, request) => sum + (request.input_tokens ?? 0) + (request.output_tokens ?? 0), 0);
  const costTotal = (requests ?? []).reduce((sum, request) => sum + Number(request.estimated_cost ?? 0), 0);

  return (
    <div className="page-stack">
      <PageHeader action={<RefreshInsightsButton />} description="AI configuration, feature flags, usage, and cost controls. Secret keys are never displayed." title="AI Settings" />
      <section className="metric-grid">
        <StatCard detail={aiStatusMessage(config.mode, config.configured)} label="AI Status" value={config.mode === "development" ? "Development" : config.mode === "enabled" ? "Enabled" : "Disabled"} />
        <StatCard detail={config.configured ? "Server key present" : "Mock responses available in development"} label="OpenAI" value={config.configured ? "Configured" : "Not Configured"} />
        <StatCard detail={`Limit ${config.maxDailyRequests}/day`} label="Requests Today" value={String(requestsToday ?? 0)} />
        <StatCard detail={`Estimated cost ${costTotal.toFixed(4)}`} label="Estimated Tokens" value={String(Math.round(tokenTotal))} />
      </section>
      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Feature Toggles</h2><span>Controlled by Phase 6 AI settings</span></div>
          <div className="settings-feature-grid">{(features ?? []).map((feature) => <article key={feature.feature_key}><strong>{humanFeatureToggleLabel(feature.feature_key)}</strong><StatusBadge status={feature.enabled ? "Enabled" : "Disabled"} /></article>)}</div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Usage</h2><span>{requestsMonth ?? 0} this month</span></div>
          <p className="quiet-text">Development mode remains usable without live OpenAI. Secret keys are never displayed.</p>
          <div className="record-list">{(requests ?? []).map((request, index) => <article key={index}><strong>{humanFeatureToggleLabel(request.feature)}</strong><p>{request.status} - tokens {(request.input_tokens ?? 0) + (request.output_tokens ?? 0)}</p><span>{request.created_at}</span></article>)}</div>
        </section>
      </section>
    </div>
  );
}
