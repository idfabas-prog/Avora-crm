import Link from "next/link";
import { SegmentForm } from "@/components/crm/CampaignForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { hasSegmentPermission } from "@/lib/segments/permissions";
import { segmentFields, segmentOperators } from "@/lib/segments/fields";
import { createClient } from "@/lib/supabase/server";

type SegmentRow = {
  id: string;
  name: string;
  description: string | null;
  segment_type: string;
  active: boolean;
  rules_json: Record<string, unknown>;
  segment_members: Array<{ contact_id: string }> | null;
};

export default async function SegmentsPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  if (!hasSegmentPermission(profile, "segments.read")) {
    return <div className="page-stack"><PageHeader description="Your role cannot access segments." title="Segments" /></div>;
  }
  const [{ data: segments }, { data: contacts }] = await Promise.all([
    supabase.from("segments").select("id, name, description, segment_type, active, rules_json, segment_members(contact_id)").eq("organization_id", profile.organizationId).order("name"),
    supabase.from("contacts").select("id, first_name, last_name, status, lead_source, locations(name), opportunities(value_cents, status), appointments(start_at, status)").eq("organization_id", profile.organizationId).limit(25)
  ]);
  const rows = (segments ?? []) as SegmentRow[];

  return (
    <div className="page-stack">
      <PageHeader
        action={<div className="header-actions"><Link className="secondary-button" href="/marketing/campaigns">Campaigns</Link><Link className="secondary-button" href="/api/exports/campaigns?type=segments">Export Segments</Link></div>}
        description="Build reusable dynamic segments and static lists using approved CRM fields and operators."
        title="Segments"
      />
      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Segment Builder</h2><span>Approved fields only</span></div>
          <SegmentForm />
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Field Registry</h2><span>{segmentFields.length} fields</span></div>
          <div className="record-list">
            <article><strong>Operators</strong><p>{segmentOperators.map((operator) => operator.replaceAll("_", " ")).join(", ")}</p></article>
            {segmentFields.slice(0, 10).map((field) => <article key={field.key}><strong>{field.label}</strong><p>{field.key} · {field.type}</p></article>)}
          </div>
        </section>
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Segments</h2><span>{rows.length}</span></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Type</th><th>Status</th><th>Members</th><th>Description</th><th>Rules</th></tr></thead>
            <tbody>
              {rows.map((segment) => (
                <tr key={segment.id}>
                  <td>{segment.name}</td>
                  <td>{segment.segment_type}</td>
                  <td><StatusBadge status={segment.active ? "Active" : "Archived"} /></td>
                  <td>{segment.segment_members?.length ?? "Dynamic"}</td>
                  <td>{segment.description ?? "-"}</td>
                  <td><code>{JSON.stringify(segment.rules_json).slice(0, 90)}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Preview Sample</h2><span>First 25 CRM contacts</span></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Contact</th><th>Status</th><th>Lead Source</th><th>Location</th><th>Opportunity</th><th>Last Appointment</th></tr></thead>
            <tbody>
              {(contacts ?? []).map((contact) => {
                const location = Array.isArray(contact.locations) ? contact.locations[0] : contact.locations;
                const opportunity = Array.isArray(contact.opportunities) ? contact.opportunities[0] : contact.opportunities;
                const appointment = Array.isArray(contact.appointments) ? contact.appointments[0] : contact.appointments;
                return (
                  <tr key={contact.id}>
                    <td><Link href={`/contacts/${contact.id}`}>{contact.first_name} {contact.last_name}</Link></td>
                    <td>{contact.status}</td>
                    <td>{contact.lead_source ?? "-"}</td>
                    <td>{location?.name ?? "Unassigned"}</td>
                    <td>{opportunity?.status ?? "None"}</td>
                    <td>{appointment?.start_at ?? "None"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
