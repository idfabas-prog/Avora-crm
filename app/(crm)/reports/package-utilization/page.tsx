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

export default async function PackageUtilizationReportPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  if (!hasClinicalPermission(profile, "clinical.entitlements.read")) {
    return <div className="page-stack"><PageHeader description="Your current role does not include package utilization access." title="Package Utilization" /></div>;
  }

  const selectedLocationId = await getSelectedLocationId(profile);
  const locationIds = allowedLocationIds(profile, selectedLocationId);
  const entitlementsQuery = supabase
    .from("package_entitlements")
    .select("id, location_id, contact_id, total_quantity, used_quantity, remaining_quantity, status, purchased_at, contacts(first_name, last_name), services(name), packages(name), locations(name), sales(id, sale_date)")
    .eq("organization_id", profile.organizationId)
    .order("purchased_at", { ascending: false });
  const eventsQuery = supabase
    .from("treatment_entitlement_events")
    .select("id, event_type, quantity, reason, created_at, package_entitlements!inner(id, location_id, contact_id, contacts(first_name, last_name), services(name))")
    .eq("organization_id", profile.organizationId)
    .order("created_at", { ascending: false })
    .limit(40);

  if (locationIds.length > 0) {
    entitlementsQuery.in("location_id", locationIds);
    eventsQuery.in("package_entitlements.location_id", locationIds);
  }

  const [{ data: entitlements }, { data: events }] = await Promise.all([entitlementsQuery, eventsQuery]);
  const rows = entitlements ?? [];
  const totalGranted = rows.reduce((sum, row) => sum + Number(row.total_quantity ?? 0), 0);
  const totalUsed = rows.reduce((sum, row) => sum + Number(row.used_quantity ?? 0), 0);
  const totalRemaining = rows.reduce((sum, row) => sum + Number(row.remaining_quantity ?? 0), 0);
  const exhausted = rows.filter((row) => row.status === "fully_used" || Number(row.remaining_quantity ?? 0) === 0).length;

  return (
    <div className="page-stack">
      <PageHeader action={<Link className="secondary-button" href="/clinical">Clinical Dashboard</Link>} description="Treatment package grants, usage, remaining balances, and entitlement event history." title="Package Utilization" />
      <section className="metric-grid">
        <StatCard detail="Total treatment units granted" label="Granted" value={String(totalGranted)} />
        <StatCard detail="Completed treatments consumed" label="Used" value={String(totalUsed)} />
        <StatCard detail="Available for future sessions" label="Remaining" value={String(totalRemaining)} />
        <StatCard detail="No remaining units" label="Exhausted" value={String(exhausted)} />
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Entitlements</h2><span>RLS-filtered by allowed locations</span></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Contact</th><th>Service</th><th>Location</th><th>Used</th><th>Remaining</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((row) => {
                const contact = relation(row.contacts);
                const service = relation(row.services);
                const pack = relation(row.packages);
                const location = relation(row.locations);
                return (
                  <tr key={row.id}>
                    <td>{contact?.first_name} {contact?.last_name}</td>
                    <td>{service?.name ?? pack?.name ?? "Package"}</td>
                    <td>{location?.name ?? "Unassigned"}</td>
                    <td>{row.used_quantity}/{row.total_quantity}</td>
                    <td>{row.remaining_quantity}</td>
                    <td><StatusBadge status={fromDbStatus(row.status)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Entitlement Ledger</h2><span>Grant, use, restore, adjustment, expire, cancel</span></div>
        <div className="record-list">
          {(events ?? []).map((event) => {
            const entitlement = relation(event.package_entitlements);
            const contact = relation(entitlement?.contacts);
            const service = relation(entitlement?.services);
            return (
              <article key={event.id}>
                <strong>{fromDbStatus(event.event_type)} {event.quantity > 0 ? "+" : ""}{event.quantity}</strong>
                <p>{contact?.first_name} {contact?.last_name} · {service?.name ?? "Service"} · {formatDateTime(event.created_at)}</p>
                <span>{event.reason ?? "No reason recorded"}</span>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
