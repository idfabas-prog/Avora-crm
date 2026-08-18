import { LocationReviewSourceForm, ReviewSourceForm } from "@/components/crm/ReputationForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { getReviewIntegrationStatuses } from "@/lib/integrations/reviews";
import { hasReputationPermission } from "@/lib/reputation/permissions";
import { createClient } from "@/lib/supabase/server";

export default async function ReviewSourcesSettingsPage() {
  const profile = await requireCurrentProfile();
  if (!hasReputationPermission(profile, "reputation.manage")) return <div className="page-stack"><PageHeader title="Review Sources" description="Access denied." /></div>;
  const supabase = await createClient();
  const [{ data: sources }, { data: mappings }] = await Promise.all([
    supabase.from("review_sources").select("id, name, provider, external_location_id, review_url, active").eq("organization_id", profile.organizationId).order("name"),
    supabase.from("location_review_sources").select("id, is_default, active, locations(name), review_sources(name, provider)").eq("organization_id", profile.organizationId)
  ]);

  return (
    <div className="page-stack">
      <PageHeader description="Google, Facebook, Yelp, Internal, and Other source foundations. Live APIs are not called in Phase 12." title="Review Sources" />
      <section className="dashboard-grid">
        <details className="panel"><summary className="summary-action">Create Source</summary><ReviewSourceForm /></details>
        <details className="panel"><summary className="summary-action">Map Location Source</summary><LocationReviewSourceForm locations={profile.locations} sources={(sources ?? []).map((source) => ({ id: source.id, name: `${source.name} (${source.provider})` }))} /></details>
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Provider Readiness</h2><span>Server-side configuration only</span></div>
        <div className="record-list">{getReviewIntegrationStatuses().map((status) => <article key={status.provider}><strong>{status.provider}</strong><p>{status.configured ? "Environment configured" : "Demo mode / not configured"} · live API calls disabled</p><span>{status.requiredEnv.join(", ")}</span></article>)}</div>
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Location Mapping</h2><span>Review URLs stay in data, not UI code</span></div>
        <div className="record-list">{(mappings ?? []).map((mapping) => {
          const location = Array.isArray(mapping.locations) ? mapping.locations[0] : mapping.locations;
          const source = Array.isArray(mapping.review_sources) ? mapping.review_sources[0] : mapping.review_sources;
          return <article key={mapping.id}><strong>{location?.name ?? "Unknown"}</strong><p>{source?.name ?? "Source"} · {source?.provider ?? "Provider"} · {mapping.is_default ? "Default" : "Secondary"}</p><span>{mapping.active ? "Active" : "Inactive"}</span></article>;
        })}</div>
      </section>
    </div>
  );
}
