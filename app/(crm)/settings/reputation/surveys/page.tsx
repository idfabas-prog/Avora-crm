import { ReviewTemplateForm } from "@/components/crm/ReputationForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { hasReputationPermission } from "@/lib/reputation/permissions";
import { createClient } from "@/lib/supabase/server";

export default async function SurveySettingsPage() {
  const profile = await requireCurrentProfile();
  if (!hasReputationPermission(profile, "reputation.feedback.manage")) return <div className="page-stack"><PageHeader title="Feedback Surveys" description="Access denied." /></div>;
  const supabase = await createClient();
  const [{ data: surveys }, { data: templates }] = await Promise.all([
    supabase.from("feedback_surveys").select("id, name, survey_type, active, questions_json").eq("organization_id", profile.organizationId).order("name"),
    supabase.from("review_request_templates").select("id, name, channel, body, active").eq("organization_id", profile.organizationId).order("name")
  ]);

  return (
    <div className="page-stack">
      <PageHeader description="NPS, CSAT, treatment, consultation, and general-feedback definitions." title="Feedback Surveys" />
      <section className="panel">
        <div className="panel-header"><h2>Surveys</h2><span>Stored as JSON questions for future builder support</span></div>
        <div className="record-list">{(surveys ?? []).map((survey) => <article key={survey.id}><strong>{survey.name}</strong><p>{survey.survey_type} · {survey.active ? "Active" : "Inactive"}</p><span>{JSON.stringify(survey.questions_json)}</span></article>)}</div>
      </section>
      <details className="panel"><summary className="summary-action">Create Review Request Template</summary><ReviewTemplateForm /></details>
      <section className="panel">
        <div className="panel-header"><h2>Request Templates</h2><span>Neutral wording only</span></div>
        <div className="record-list">{(templates ?? []).map((template) => <article key={template.id}><strong>{template.name}</strong><p>{template.channel}</p><span>{template.body}</span></article>)}</div>
      </section>
    </div>
  );
}
