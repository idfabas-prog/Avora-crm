import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { assertSystemAccess } from "@/lib/system/audits";

export default async function SecurityPage() {
  const profile = await requireCurrentProfile();
  assertSystemAccess(profile);
  const supabase = await createClient();
  const { data: events } = await supabase.from("security_events").select("*").eq("organization_id", profile.organizationId).order("created_at", { ascending: false }).limit(50);

  return (
    <div className="page-stack">
      <PageHeader description="Operational security signals without exposing secrets, payloads, or attacker detail." title="Security Events" />
      <section className="panel">
        <div className="panel-header"><h2>Recent Events</h2><span>{events?.length ?? 0} rows</span></div>
        <div className="record-list">
          {(events ?? []).map((event) => <article key={event.id}><strong>{event.event_type}</strong><p>{event.source} · {event.request_id ?? "no request id"}</p><StatusBadge status={event.severity} /></article>)}
        </div>
      </section>
    </div>
  );
}

