import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { hasClinicalPermission } from "@/lib/clinical/permissions";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { formatDateTime, fromDbStatus } from "@/lib/crm/constants";
import { createClient } from "@/lib/supabase/server";

function relation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ClinicalDashboardPage() {
  const profile = await requireCurrentProfile();
  if (!hasClinicalPermission(profile, "clinical.sessions.read")) {
    return (
      <div className="page-stack">
        <PageHeader description="Your current role does not include clinical session access." title="Clinical" />
      </div>
    );
  }

  const supabase = await createClient();
  const selectedLocationId = await getSelectedLocationId(profile);
  const locationIds = allowedLocationIds(profile, selectedLocationId);

  const sessionsQuery = supabase
    .from("treatment_sessions")
    .select("id, status, documentation_status, scheduled_at, completed_at, session_number, treatment_area, contacts(first_name, last_name), services(name), locations(name), provider:user_profiles!treatment_sessions_provider_id_fkey(full_name)")
    .eq("organization_id", profile.organizationId)
    .order("scheduled_at", { ascending: true })
    .limit(40);
  const followupsQuery = supabase
    .from("treatment_followups")
    .select("id, status, due_at, followup_type, contacts(first_name, last_name), treatment_sessions(id, treatment_area), provider:user_profiles!treatment_followups_provider_id_fkey(full_name)")
    .eq("organization_id", profile.organizationId)
    .in("status", ["due", "scheduled", "overdue"])
    .order("due_at", { ascending: true })
    .limit(20);
  const entitlementsQuery = supabase
    .from("package_entitlements")
    .select("id, total_quantity, used_quantity, remaining_quantity, status, contacts(first_name, last_name), services(name), packages(name), locations(name)")
    .eq("organization_id", profile.organizationId)
    .order("remaining_quantity", { ascending: true })
    .limit(20);

  if (locationIds.length > 0) {
    sessionsQuery.in("location_id", locationIds);
    followupsQuery.in("location_id", locationIds);
    entitlementsQuery.in("location_id", locationIds);
  }

  const [{ data: sessions }, { data: followups }, { data: entitlements }] = await Promise.all([
    sessionsQuery,
    followupsQuery,
    entitlementsQuery
  ]);

  const sessionRows = sessions ?? [];
  const followupRows = followups ?? [];
  const entitlementRows = entitlements ?? [];
  const today = new Date();
  const upcomingCount = sessionRows.filter((session) => session.status === "scheduled" || session.status === "planned").length;
  const completedCount = sessionRows.filter((session) => session.status === "completed").length;
  const lowEntitlements = entitlementRows.filter((item) => item.status === "active" && Number(item.remaining_quantity ?? 0) <= 1).length;
  const dueFollowups = followupRows.filter((item) => new Date(String(item.due_at)) <= today).length;

  return (
    <div className="page-stack">
      <PageHeader
        action={<Link className="primary-button" href="/reports/package-utilization">Package Utilization</Link>}
        description="Treatment operations, provider documentation queues, package usage, and follow-up work."
        title="Clinical"
      />
      <section className="metric-grid">
        <StatCard detail="Planned or scheduled treatment sessions" label="Upcoming Sessions" value={String(upcomingCount)} />
        <StatCard detail="Recently loaded completed sessions" label="Completed Sessions" value={String(completedCount)} />
        <StatCard detail="Follow-ups due now or earlier" label="Due Follow-Ups" value={String(dueFollowups)} />
        <StatCard detail="Active entitlements with 0-1 remaining" label="Low Packages" value={String(lowEntitlements)} />
      </section>
      <section className="clinical-dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Provider Queue</h2><span>Scheduled and recent sessions</span></div>
          <div className="record-list">
            {sessionRows.map((session) => {
              const contact = relation(session.contacts);
              const service = relation(session.services);
              const location = relation(session.locations);
              const provider = relation(session.provider);
              return (
                <article key={session.id}>
                  <strong>{contact?.first_name} {contact?.last_name}</strong>
                  <p>{service?.name ?? "Treatment"} at {location?.name ?? "Unassigned"} · {formatDateTime(session.scheduled_at)}</p>
                  <span>Provider {provider?.full_name ?? "Unassigned"} · Session {session.session_number ?? "-"} · Documentation {fromDbStatus(session.documentation_status)}</span>
                  <div className="stage-move-form">
                    <StatusBadge status={fromDbStatus(session.status)} />
                    <Link className="strong-link" href={`/clinical/sessions/${session.id}`}>Open session</Link>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Follow-Up Queue</h2><span>Clinical follow-up work</span></div>
          <div className="record-list">
            {followupRows.map((followup) => {
              const contact = relation(followup.contacts);
              const provider = relation(followup.provider);
              const session = relation(followup.treatment_sessions);
              return (
                <article key={followup.id}>
                  <strong>{contact?.first_name} {contact?.last_name}</strong>
                  <p>{fromDbStatus(followup.followup_type)} · Due {formatDateTime(followup.due_at)}</p>
                  <span>Provider {provider?.full_name ?? "Unassigned"} · {fromDbStatus(followup.status)}</span>
                  {session?.id ? <Link className="strong-link" href={`/clinical/sessions/${session.id}`}>Open session</Link> : null}
                </article>
              );
            })}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Package Entitlements</h2><span>Purchased treatment capacity</span></div>
          <div className="record-list">
            {entitlementRows.map((entitlement) => {
              const contact = relation(entitlement.contacts);
              const service = relation(entitlement.services);
              const pack = relation(entitlement.packages);
              const location = relation(entitlement.locations);
              const total = Number(entitlement.total_quantity ?? 0);
              const used = Number(entitlement.used_quantity ?? 0);
              const percent = total ? Math.min(100, Math.round((used / total) * 100)) : 0;
              return (
                <article key={entitlement.id}>
                  <strong>{contact?.first_name} {contact?.last_name}</strong>
                  <p>{service?.name ?? pack?.name ?? "Entitlement"} · {location?.name ?? "Unassigned"}</p>
                  <div className="entitlement-meter"><span style={{ width: `${percent}%` }} /></div>
                  <span>{used}/{total} used · {entitlement.remaining_quantity ?? 0} remaining · {fromDbStatus(entitlement.status)}</span>
                </article>
              );
            })}
          </div>
        </section>
      </section>
    </div>
  );
}
