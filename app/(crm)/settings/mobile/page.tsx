import { ActionForm } from "@/components/crm/ActionForm";
import { deactivateMobileDevice } from "@/app/mobile-actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { formatDateTime } from "@/lib/crm/constants";
import { webMobileCapabilities, capabilityLabel } from "@/lib/mobile/capabilities";
import { hasMobilePermission } from "@/lib/mobile/permissions";
import { createClient } from "@/lib/supabase/server";

export default async function MobileSettingsPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const [{ data: settings }, { data: devices }, { data: preferences }] = await Promise.all([
    supabase.from("mobile_settings").select("*").eq("organization_id", profile.organizationId).maybeSingle(),
    supabase.from("device_registrations").select("id, device_name, device_type, platform, push_provider, active, push_enabled, last_seen_at").eq("organization_id", profile.organizationId).order("last_seen_at", { ascending: false }).limit(20),
    supabase.from("mobile_notification_preferences").select("*").eq("organization_id", profile.organizationId).limit(20)
  ]);
  const canManage = hasMobilePermission(profile, "mobile.devices.manage") || profile.role === "owner" || profile.role === "administrator";

  return (
    <div className="page-stack">
      <PageHeader description="PWA, push foundation, mobile navigation, device registrations, and native-app future readiness." title="Mobile Settings" />
      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>PWA</h2><span>Installable web app foundation</span></div>
          <dl className="settings-list">
            <div><dt>PWA Enabled</dt><dd>{settings?.pwa_enabled ? "Yes" : "No"}</dd></div>
            <div><dt>Staff Mobile</dt><dd>{settings?.staff_mobile_enabled ? "Yes" : "No"}</dd></div>
            <div><dt>Patient Mobile</dt><dd>{settings?.patient_mobile_enabled ? "Yes" : "No"}</dd></div>
            <div><dt>Push Enabled</dt><dd>{settings?.push_enabled ? "Yes" : "Development off"}</dd></div>
          </dl>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Native Readiness</h2><span>Future wrapper abstraction</span></div>
          <div className="record-list">
            {Object.entries(webMobileCapabilities).map(([key, enabled]) => <article key={key}><strong>{capabilityLabel(key as keyof typeof webMobileCapabilities, Boolean(enabled))}</strong></article>)}
          </div>
        </section>
      </section>
      <section className="panel wide-panel">
        <div className="panel-header"><h2>Devices</h2><span>Raw push tokens are not displayed</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Device</th><th>Type</th><th>Platform</th><th>Push</th><th>Status</th><th>Last Seen</th><th>Action</th></tr></thead>
            <tbody>
              {(devices ?? []).map((device) => (
                <tr key={device.id}>
                  <td>{device.device_name}</td>
                  <td>{device.device_type}</td>
                  <td>{device.platform}</td>
                  <td>{device.push_enabled ? device.push_provider : "Off"}</td>
                  <td><StatusBadge status={device.active ? "Active" : "Inactive"} /></td>
                  <td>{formatDateTime(device.last_seen_at)}</td>
                  <td>{canManage && device.active ? <ActionForm action={deactivateMobileDevice} className="inline-form" submitLabel="Disable" successMessage="Device disabled"><input name="device_id" type="hidden" value={device.id} /></ActionForm> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Notification Preferences</h2><span>{preferences?.length ?? 0} demo preference rows</span></div>
        <p className="quiet-text">Preferences are scoped by staff user or patient account. Lock-screen bodies stay generic and safe.</p>
      </section>
    </div>
  );
}
