import Link from "next/link";
import { ReviewTemplateForm } from "@/components/crm/ReputationForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { hasReputationPermission } from "@/lib/reputation/permissions";
import { createClient } from "@/lib/supabase/server";

export default async function ReputationSettingsPage() {
  const profile = await requireCurrentProfile();
  if (!hasReputationPermission(profile, "reputation.manage")) return <div className="page-stack"><PageHeader title="Reputation Settings" description="Access denied." /></div>;
  const supabase = await createClient();
  const [{ data: settings }, { data: templates }, { data: sources }, { data: surveys }, { data: programs }] = await Promise.all([
    supabase.from("reputation_settings").select("id, review_requests_enabled, review_request_cooldown_days, negative_nps_threshold, negative_csat_threshold, review_sources(name), feedback_surveys(name), referral_programs(name)").eq("organization_id", profile.organizationId),
    supabase.from("review_request_templates").select("id, name, channel, body, active").eq("organization_id", profile.organizationId).order("name"),
    supabase.from("review_sources").select("id, name, provider, active").eq("organization_id", profile.organizationId).order("name"),
    supabase.from("feedback_surveys").select("id, name, survey_type, active").eq("organization_id", profile.organizationId).order("name"),
    supabase.from("referral_programs").select("id, name, reward_type, reward_value, active").eq("organization_id", profile.organizationId).order("name")
  ]);

  return (
    <div className="page-stack">
      <PageHeader description="Review cooldowns, ethical templates, feedback thresholds, and source defaults." title="Reputation Settings" />
      <section className="settings-nav">
        <Link href="/settings/reputation/sources">Review Sources</Link>
        <Link href="/settings/reputation/surveys">Surveys</Link>
        <Link href="/settings/referrals">Referral Programs</Link>
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Defaults</h2><span>Configurable by org/location in the database</span></div>
        <div className="settings-grid">{(settings ?? []).map((row) => {
          const source = Array.isArray(row.review_sources) ? row.review_sources[0] : row.review_sources;
          const survey = Array.isArray(row.feedback_surveys) ? row.feedback_surveys[0] : row.feedback_surveys;
          const program = Array.isArray(row.referral_programs) ? row.referral_programs[0] : row.referral_programs;
          return <article className="settings-card" key={row.id}><h2>{row.review_requests_enabled ? "Review Requests Enabled" : "Review Requests Disabled"}</h2><dl><div><dt>Cooldown</dt><dd>{row.review_request_cooldown_days} days</dd></div><div><dt>Default Source</dt><dd>{source?.name ?? "None"}</dd></div><div><dt>Default Survey</dt><dd>{survey?.name ?? "None"}</dd></div><div><dt>NPS Threshold</dt><dd>{row.negative_nps_threshold}</dd></div><div><dt>CSAT Threshold</dt><dd>{row.negative_csat_threshold}</dd></div><div><dt>Referral Program</dt><dd>{program?.name ?? "None"}</dd></div></dl></article>;
        })}</div>
      </section>
      <details className="panel">
        <summary className="summary-action">Create Ethical Review Template</summary>
        <ReviewTemplateForm />
      </details>
      <section className="dashboard-grid">
        <section className="panel"><div className="panel-header"><h2>Templates</h2><span>Review gating is blocked by app and database checks</span></div><div className="record-list">{(templates ?? []).map((template) => <article key={template.id}><strong>{template.name}</strong><p>{template.channel} · {template.active ? "Active" : "Inactive"}</p><span>{template.body}</span></article>)}</div></section>
        <section className="panel"><div className="panel-header"><h2>Connected Foundations</h2><span>No live provider calls required</span></div><div className="record-list"><article><strong>{sources?.length ?? 0} review sources</strong></article><article><strong>{surveys?.length ?? 0} feedback surveys</strong></article><article><strong>{programs?.length ?? 0} referral programs</strong></article></div></section>
      </section>
    </div>
  );
}
