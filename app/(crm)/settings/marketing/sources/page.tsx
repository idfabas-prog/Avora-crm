import { MarketingSourceForm } from "@/components/crm/MarketingForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { hasMarketingPermission } from "@/lib/marketing/permissions";
import { createClient } from "@/lib/supabase/server";

export default async function MarketingSourcesSettingsPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const canManage = hasMarketingPermission(profile, "marketing.manage");
  const [{ data: sources }, { data: aliases }] = await Promise.all([
    supabase.from("marketing_sources").select("id, name, channel, provider, active").eq("organization_id", profile.organizationId).order("name"),
    supabase.from("marketing_source_aliases").select("id, source_id, alias").eq("organization_id", profile.organizationId).order("alias")
  ]);

  return (
    <div className="page-stack">
      <PageHeader description="Normalize source names and aliases so Facebook, FB, Meta, and lead-ad imports roll up cleanly." title="Marketing Sources" />
      {canManage ? <details className="panel"><summary className="summary-action">Create Source</summary><MarketingSourceForm /></details> : null}
      <section className="panel">
        <div className="panel-header"><h2>Sources</h2><span>Alias mapping prevents fragmented reporting</span></div>
        <div className="settings-grid">
          {(sources ?? []).map((source) => (
            <article className="settings-card" key={source.id}>
              <div><h2>{source.name}</h2><StatusBadge status={source.active ? "Active" : "Inactive"} /></div>
              <dl>
                <div><dt>Channel</dt><dd>{source.channel}</dd></div>
                <div><dt>Provider</dt><dd>{source.provider}</dd></div>
                <div><dt>Aliases</dt><dd>{(aliases ?? []).filter((alias) => alias.source_id === source.id).map((alias) => alias.alias).join(", ") || "None"}</dd></div>
              </dl>
              {canManage ? <details><summary className="summary-action">Edit</summary><MarketingSourceForm source={source} /></details> : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
