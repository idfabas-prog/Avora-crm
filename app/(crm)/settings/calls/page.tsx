import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { hasCallPermission } from "@/lib/calls/permissions";
import { createClient } from "@/lib/supabase/server";

export default async function CallSettingsPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  if (!hasCallPermission(profile, "calls.read")) {
    return <div className="page-stack"><PageHeader description="Your role does not include call settings access." title="Call Settings" /></div>;
  }

  const [{ data: numbers }, { data: queues }, { data: settings }, { data: dispositions }, { data: scripts }] = await Promise.all([
    supabase.from("communication_numbers").select("id, location_id, phone_number, friendly_name, supports_voice, supports_sms, active, is_primary, is_tracking_number, locations(name), marketing_sources(name), marketing_campaigns(name)").eq("organization_id", profile.organizationId).order("friendly_name"),
    supabase.from("call_queues").select("id, name, strategy, active, max_wait_seconds, voicemail_enabled, locations(name)").eq("organization_id", profile.organizationId).order("name"),
    supabase.from("call_recording_settings").select("id, location_id, recording_enabled, consent_mode, announcement_required, retention_days, locations(name)").eq("organization_id", profile.organizationId),
    supabase.from("call_dispositions").select("id, name, category, active, sort_order").eq("organization_id", profile.organizationId).order("sort_order"),
    supabase.from("call_scripts").select("id, name, category, active").eq("organization_id", profile.organizationId).order("name")
  ]);

  return (
    <div className="page-stack">
      <PageHeader description="Phone numbers, queues, recording consent foundation, dispositions, and scripts. Live telephony remains disabled unless explicitly configured later." title="Call Settings" />
      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Numbers</h2><span>Communication numbers reused for voice</span></div>
          <div className="record-list">
            {(numbers ?? []).map((number) => {
              const location = Array.isArray(number.locations) ? number.locations[0] : number.locations;
              const source = Array.isArray(number.marketing_sources) ? number.marketing_sources[0] : number.marketing_sources;
              return (
                <article key={number.id}>
                  <strong>{number.friendly_name ?? number.phone_number}</strong>
                  <p>{number.phone_number} - {location?.name ?? "Org-wide"} - {source?.name ?? "No source"}</p>
                  <StatusBadge status={number.active ? "Active" : "Inactive"} />
                </article>
              );
            })}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Queues</h2><span>Routing simulation foundation</span></div>
          <div className="record-list">
            {(queues ?? []).map((queue) => {
              const location = Array.isArray(queue.locations) ? queue.locations[0] : queue.locations;
              return <article key={queue.id}><strong>{queue.name}</strong><p>{location?.name ?? "Org-wide"} - {queue.strategy.replaceAll("_", " ")} - max wait {queue.max_wait_seconds ?? "none"}s</p><StatusBadge status={queue.voicemail_enabled ? "Voicemail Enabled" : "No Voicemail"} /></article>;
            })}
          </div>
        </section>
      </section>
      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Recording Consent</h2><span>Metadata only in demo mode</span></div>
          <div className="record-list">
            {(settings ?? []).map((setting) => {
              const location = Array.isArray(setting.locations) ? setting.locations[0] : setting.locations;
              return <article key={setting.id}><strong>{location?.name ?? "Organization default"}</strong><p>{setting.consent_mode.replaceAll("_", " ")} - retention {setting.retention_days ?? "unset"} days</p><StatusBadge status={setting.recording_enabled ? "Enabled" : "Disabled"} /></article>;
            })}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Dispositions & Scripts</h2><span>Non-forced sales/service guidance</span></div>
          <div className="record-list">
            {(dispositions ?? []).map((disposition) => <article key={disposition.id}><strong>{disposition.name}</strong><p>{disposition.category}</p></article>)}
            {(scripts ?? []).map((script) => <article key={script.id}><strong>{script.name}</strong><p>{script.category}</p><StatusBadge status={script.active ? "Active" : "Inactive"} /></article>)}
          </div>
        </section>
      </section>
    </div>
  );
}
