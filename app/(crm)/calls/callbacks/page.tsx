import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { hasCallPermission } from "@/lib/calls/permissions";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { createClient } from "@/lib/supabase/server";

export default async function CallbacksPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  if (!hasCallPermission(profile, "calls.read")) {
    return <div className="page-stack"><PageHeader description="Your role does not include callback access." title="Callbacks" /></div>;
  }

  const selectedLocationId = await getSelectedLocationId(profile);
  const locationIds = allowedLocationIds(profile, selectedLocationId);
  let query = supabase
    .from("missed_call_callbacks")
    .select("id, call_id, contact_id, location_id, status, priority, due_at, last_follow_up_at, calls(from_number, started_at), contacts(first_name, last_name, phone), locations(name), assigned_user:user_profiles!missed_call_callbacks_assigned_to_fkey(full_name)")
    .eq("organization_id", profile.organizationId);
  if (locationIds.length > 0) query = query.in("location_id", locationIds);
  const { data: callbacks } = await query.order("priority", { ascending: false });

  return (
    <div className="page-stack">
      <PageHeader action={<Link className="secondary-button" href="/calls">Call Log</Link>} description="Missed-call, no-answer, and voicemail recovery queue." title="Callbacks" />
      <section className="panel">
        <div className="panel-header"><h2>Callback Queue</h2><span>Priority sorted</span></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Contact</th><th>Location</th><th>Status</th><th>Priority</th><th>Assigned</th><th>Due</th><th>Call</th></tr></thead>
            <tbody>
              {(callbacks ?? []).map((callback) => {
                const contact = Array.isArray(callback.contacts) ? callback.contacts[0] : callback.contacts;
                const location = Array.isArray(callback.locations) ? callback.locations[0] : callback.locations;
                const assigned = Array.isArray(callback.assigned_user) ? callback.assigned_user[0] : callback.assigned_user;
                return (
                  <tr key={callback.id}>
                    <td>{contact ? `${contact.first_name} ${contact.last_name}` : "Unknown"}</td>
                    <td>{location?.name ?? "Unassigned"}</td>
                    <td><StatusBadge status={callback.status.replaceAll("_", " ")} /></td>
                    <td>{callback.priority}</td>
                    <td>{assigned?.full_name ?? "Unassigned"}</td>
                    <td>{callback.due_at ? new Date(callback.due_at).toLocaleString() : "No due date"}</td>
                    <td><Link className="strong-link" href={`/calls/${callback.call_id}`}>Open</Link></td>
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
