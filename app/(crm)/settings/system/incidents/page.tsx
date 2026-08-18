import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { assertSystemAccess } from "@/lib/system/audits";
import { getSystemHealthReport } from "@/lib/system/health-report";

function text(value: unknown) {
  return value === null || value === undefined || value === "" ? "Not available" : String(value);
}

export default async function IncidentsPage() {
  const profile = await requireCurrentProfile();
  assertSystemAccess(profile);
  const supabase = await createClient();
  const report = await getSystemHealthReport(profile, supabase);

  return (
    <div className="page-stack">
      <PageHeader description="Open operational incidents and safe alert metadata. No patient data or secrets are displayed." title="Incidents" />
      <section className="settings-nav">
        <Link href="/settings/system/health">System Health</Link>
        <Link href="/settings/system/deployment">Deployment</Link>
        <Link href="/settings/system/workers">Workers</Link>
        <Link href="/settings/system/sync-health">Sync Health</Link>
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Open Incident Feed</h2><span>{report.incidents.length} open / monitoring</span></div>
        <div className="record-list">
          {report.incidents.length === 0 ? <article><strong>No open incidents</strong><p>Health incident feed is clear.</p><StatusBadge status="healthy" /></article> : null}
          {report.incidents.map((incident) => (
            <article key={String(incident.id)}>
              <strong>{text(incident.severity)} · {text(incident.source)} · {text(incident.incident_type)}</strong>
              <p>{text(incident.message ?? incident.summary)}</p>
              <span>Opened {text(incident.opened_at ?? incident.started_at)}</span>
              <StatusBadge status={text(incident.status)} />
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
