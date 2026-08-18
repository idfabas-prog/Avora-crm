import Link from "next/link";
import { AssignMissedCallForm, ClickToCallForm } from "@/components/crm/CallForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { hasCallPermission } from "@/lib/calls/permissions";
import { contactName, getCallDashboardReport, personName, relationName } from "@/lib/calls/reports";
import { formatPhoneNumber } from "@/lib/communications/phone";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { formatMoney } from "@/lib/financial/money";
import { createClient } from "@/lib/supabase/server";

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

export default async function CallsPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  if (!hasCallPermission(profile, "calls.read")) {
    return <div className="page-stack"><PageHeader description="Your role does not include call-center access." title="Calls" /></div>;
  }

  const selectedLocationId = await getSelectedLocationId(profile);
  const locationIds = allowedLocationIds(profile, selectedLocationId);
  const report = await getCallDashboardReport(supabase, profile, locationIds);
  const [{ data: contacts }, { data: users }] = await Promise.all([
    supabase.from("contacts").select("id, first_name, last_name, phone").eq("organization_id", profile.organizationId).order("last_name").limit(200),
    supabase.from("user_profiles").select("id, full_name").eq("organization_id", profile.organizationId).order("full_name")
  ]);
  const contactOptions = (contacts ?? []).map((contact) => ({ id: contact.id, name: `${contact.first_name} ${contact.last_name}`, phone: contact.phone }));
  const userOptions = (users ?? []).map((user) => ({ id: user.id, name: user.full_name }));

  return (
    <div className="page-stack">
      <PageHeader
        action={<div className="header-actions"><Link className="secondary-button" href="/calls/dashboard">Dashboard</Link><Link className="secondary-button" href="/calls/callbacks">Callbacks</Link><Link className="secondary-button" href="/settings/calls">Call Settings</Link></div>}
        description="Simulation-safe call-center records, missed-call recovery, callbacks, and attribution."
        title="Calls"
      />
      <section className="metric-grid">
        <StatCard detail="Inbound + outbound" label="Calls" value={String(report.metrics.totalCalls)} />
        <StatCard detail="Inbound calls answered" label="Answer Rate" value={pct(report.metrics.answerRate)} />
        <StatCard detail="Inbound calls missed" label="Missed Rate" value={pct(report.metrics.missedRate)} />
        <StatCard detail="Connected calls with booking signal" label="Booking Rate" value={pct(report.metrics.bookingRate)} />
        <StatCard detail="Call-attributed collected revenue" label="Call Revenue" value={formatMoney(report.metrics.netRevenueCents)} />
        <StatCard detail="Recovered callbacks" label="Callbacks" value={String(report.metrics.callbacksCompleted)} />
      </section>
      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Click to Call</h2><span>Development simulation only</span></div>
          {hasCallPermission(profile, "calls.make") ? (
            <ClickToCallForm contacts={contactOptions} locations={profile.locations} />
          ) : (
            <p className="quiet-text">Your role cannot create outbound call records.</p>
          )}
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Missed Calls</h2><span>Newest first</span></div>
          <div className="record-list">
            {report.missedCalls.map((call) => (
              <article key={call.id}>
                <strong><Link className="strong-link" href={`/calls/${call.id}`}>{contactName(call)}</Link></strong>
                <p>{relationName(call.locations)} - {formatPhoneNumber(call.from_number)} - {call.disposition ?? "No disposition"}</p>
                <span>{call.started_at ? new Date(call.started_at).toLocaleString() : "No timestamp"}</span>
                {hasCallPermission(profile, "calls.answer") ? <details><summary className="summary-action">Assign Callback</summary><AssignMissedCallForm callId={call.id} users={userOptions} /></details> : null}
              </article>
            ))}
            {report.missedCalls.length === 0 ? <p className="quiet-text">No missed calls in the selected scope.</p> : null}
          </div>
        </section>
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Call Log</h2><span>Inbound, outbound, voicemail, and callbacks</span></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Caller</th><th>Direction</th><th>Status</th><th>Location</th><th>Handled By</th><th>Duration</th><th>Disposition</th><th>Source</th></tr></thead>
            <tbody>
              {report.calls.map((call) => (
                <tr key={call.id}>
                  <td><Link className="strong-link" href={`/calls/${call.id}`}>{contactName(call)}</Link><br /><span>{formatPhoneNumber(call.from_number)} {"->"} {formatPhoneNumber(call.to_number)}</span></td>
                  <td>{call.direction}</td>
                  <td><StatusBadge status={call.status.replaceAll("_", " ")} /></td>
                  <td>{relationName(call.locations)}</td>
                  <td>{personName(call.handled_by ?? call.assigned_user)}</td>
                  <td>{call.duration_seconds ?? 0}s</td>
                  <td>{call.disposition ?? "None"}</td>
                  <td>{relationName(call.marketing_sources)}<br /><span>{relationName(call.marketing_campaigns)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
