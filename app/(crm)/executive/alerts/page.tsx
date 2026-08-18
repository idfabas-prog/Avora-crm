import Link from "next/link";
import { acknowledgeExecutiveAlert, resolveExecutiveAlert } from "@/app/executive-actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { getSelectedLocationId } from "@/lib/crm/location";
import { assertExecutivePermission, canManageExecutiveSettings } from "@/lib/executive/permissions";
import { getExecutiveReport } from "@/lib/executive/reports";
import type { ExecutivePeriod } from "@/lib/executive/types";
import { createClient } from "@/lib/supabase/server";

export default async function ExecutiveAlertsPage({ searchParams }: { searchParams: Promise<{ period?: ExecutivePeriod; severity?: string; status?: string }> }) {
  const params = await searchParams;
  const profile = await requireCurrentProfile();
  assertExecutivePermission(profile, "executive.alerts.read");
  const supabase = await createClient();
  const selectedLocationId = await getSelectedLocationId(profile);
  const report = await getExecutiveReport(supabase, profile, { period: params.period ?? "this_month", selectedLocationId });
  const canManage = canManageExecutiveSettings(profile);
  const alerts = report.alerts.filter((alert) => {
    if (params.severity && alert.severity !== params.severity) return false;
    if (params.status && alert.status !== params.status) return false;
    return true;
  });

  return (
    <div className="page-stack">
      <PageHeader
        action={
          <div className="header-actions">
            <Link className="secondary-button" href="/executive">Command Center</Link>
            <Link className="secondary-button" href="/settings/executive">Alert Settings</Link>
          </div>
        }
        description="Deterministic owner attention items. AI cannot acknowledge, resolve, or mutate alerts."
        title="Executive Alerts"
      />
      <section className="settings-nav">
        <Link href="/executive/alerts">All</Link>
        <Link href="/executive/alerts?severity=critical">Critical</Link>
        <Link href="/executive/alerts?severity=important">Important</Link>
        <Link href="/executive/alerts?severity=watch">Watch</Link>
        <Link href="/executive/alerts?status=acknowledged">Acknowledged</Link>
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Needs Attention</h2><span>{alerts.length} alert(s)</span></div>
        <div className="record-list">
          {alerts.map((alert) => (
            <article key={alert.identityKey}>
              <div className="split-row">
                <strong>{alert.title}</strong>
                <StatusBadge status={`${alert.severity} · ${alert.status}`} />
              </div>
              <p>{alert.summary}</p>
              <span>{alert.locationName} · {alert.alertType}</span>
              {alert.id && canManage ? (
                <div className="header-actions">
                  {alert.status === "active" ? (
                    <form action={acknowledgeExecutiveAlert}>
                      <input name="alert_id" type="hidden" value={alert.id} />
                      <button className="secondary-button" type="submit">Acknowledge</button>
                    </form>
                  ) : null}
                  {alert.status !== "resolved" ? (
                    <form action={resolveExecutiveAlert}>
                      <input name="alert_id" type="hidden" value={alert.id} />
                      <button className="primary-button" type="submit">Resolve</button>
                    </form>
                  ) : null}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
