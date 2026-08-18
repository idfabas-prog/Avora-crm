import { EscalationResolutionForm, FeedbackResponseForm } from "@/components/crm/ReputationForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { hasReputationPermission } from "@/lib/reputation/permissions";
import { getReputationReport } from "@/lib/reputation/reports";
import { createClient } from "@/lib/supabase/server";

function first<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function FeedbackPage() {
  const profile = await requireCurrentProfile();
  if (!hasReputationPermission(profile, "reputation.feedback.read")) return <div className="page-stack"><PageHeader title="Feedback" description="Access denied." /></div>;
  const supabase = await createClient();
  const selectedLocationId = await getSelectedLocationId(profile);
  const locationIds = allowedLocationIds(profile, selectedLocationId);
  const report = await getReputationReport(supabase, { organizationId: profile.organizationId, locationIds });
  const [{ data: contacts }, { data: providers }, { data: services }] = await Promise.all([
    supabase.from("contacts").select("id, first_name, last_name, location_id").eq("organization_id", profile.organizationId).order("last_name").limit(500),
    supabase.from("user_profiles").select("id, full_name").eq("organization_id", profile.organizationId).order("full_name"),
    supabase.from("services").select("id, name").eq("organization_id", profile.organizationId).order("name")
  ]);

  return (
    <div className="page-stack">
      <PageHeader description="NPS, CSAT, treatment feedback, and deterministic recovery queue." title="Feedback" />
      {hasReputationPermission(profile, "reputation.feedback.manage") ? (
        <details className="panel"><summary className="summary-action">Record Feedback</summary><FeedbackResponseForm contacts={(contacts ?? []).map((contact) => ({ id: contact.id, name: `${contact.first_name} ${contact.last_name}`, location_id: contact.location_id }))} locations={profile.locations} providers={(providers ?? []).map((provider) => ({ id: provider.id, name: provider.full_name }))} services={(services ?? []).map((service) => ({ id: service.id, name: service.name }))} surveys={report.surveys.map((survey) => ({ id: survey.id, name: `${survey.name} (${survey.survey_type})` }))} /></details>
      ) : null}
      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Responses</h2><span>NPS/CSAT samples are operational signals</span></div>
          <div className="record-list">{report.feedbackResponses.map((response) => {
            const contact = first(response.contacts);
            const provider = first(response.provider);
            const service = first(response.services);
            return <article key={response.id}><strong>{`${contact?.first_name ?? ""} ${contact?.last_name ?? ""}`}</strong><p>NPS {response.score ?? "n/a"} · CSAT {response.rating ?? "n/a"} · {provider?.full_name ?? "Unassigned"} · {service?.name ?? "No service"}</p><span>{response.response_text ?? "No note"}</span></article>;
          })}</div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Escalations</h2><span>Negative feedback is followed up, not hidden</span></div>
          <div className="record-list">{report.escalations.map((escalation) => {
            const contact = first(escalation.contacts);
            const assigned = first(escalation.assigned);
            return <article key={escalation.id}><strong>{`${contact?.first_name ?? ""} ${contact?.last_name ?? ""}`} · {escalation.severity}</strong><p><StatusBadge status={escalation.status} /> Assigned to {assigned?.full_name ?? "Unassigned"}</p><span>{escalation.notes ?? "No notes"}</span>{hasReputationPermission(profile, "reputation.feedback.manage") ? <EscalationResolutionForm escalationId={escalation.id} /> : null}</article>;
          })}</div>
        </section>
      </section>
    </div>
  );
}
