import { MarkReviewSentForm, ReviewRequestForm } from "@/components/crm/ReputationForms";
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

export default async function ReviewsPage() {
  const profile = await requireCurrentProfile();
  if (!hasReputationPermission(profile, "reputation.reviews.read")) return <div className="page-stack"><PageHeader title="Review Requests" description="Access denied." /></div>;
  const supabase = await createClient();
  const selectedLocationId = await getSelectedLocationId(profile);
  const locationIds = allowedLocationIds(profile, selectedLocationId);
  const report = await getReputationReport(supabase, { organizationId: profile.organizationId, locationIds });
  const [{ data: contacts }, { data: sources }] = await Promise.all([
    supabase.from("contacts").select("id, first_name, last_name, location_id").eq("organization_id", profile.organizationId).order("last_name").limit(500),
    supabase.from("review_sources").select("id, name").eq("organization_id", profile.organizationId).eq("active", true).order("name")
  ]);

  return (
    <div className="page-stack">
      <PageHeader description="Track pending, sent, clicked, completed, declined, failed, and cancelled review requests." title="Review Requests" />
      {hasReputationPermission(profile, "reputation.manage") ? (
        <details className="panel"><summary className="summary-action">Create Review Request</summary><ReviewRequestForm contacts={(contacts ?? []).map((contact) => ({ id: contact.id, name: `${contact.first_name} ${contact.last_name}`, location_id: contact.location_id }))} locations={profile.locations} sources={(sources ?? []).map((source) => ({ id: source.id, name: source.name }))} /></details>
      ) : null}
      <section className="panel">
        <div className="panel-header"><h2>Request Log</h2><span>No review gating; all statuses remain visible</span></div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Patient</th><th>Location</th><th>Channel</th><th>Status</th><th>Source</th><th>Sent</th><th>Completed</th><th>Action</th></tr></thead><tbody>{report.reviewRequests.map((request) => {
          const contact = first(request.contacts);
          const location = first(request.locations);
          const source = first(request.review_sources);
          return <tr key={request.id}><td>{`${contact?.first_name ?? ""} ${contact?.last_name ?? ""}`}</td><td>{location?.name ?? "Unknown"}</td><td>{request.request_channel}</td><td><StatusBadge status={request.status} /></td><td>{source?.name ?? "Default"}</td><td>{request.sent_at ? new Date(request.sent_at).toLocaleDateString() : "Not sent"}</td><td>{request.completed_at ? new Date(request.completed_at).toLocaleDateString() : "Not completed"}</td><td>{request.status === "pending" && hasReputationPermission(profile, "reputation.manage") ? <MarkReviewSentForm requestId={request.id} /> : null}</td></tr>;
        })}</tbody></table></div>
      </section>
    </div>
  );
}
