import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { formatPhoneNumber } from "@/lib/communications/phone";

export default async function SettingsPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const [{ data: numbers }, { data: settings }] = await Promise.all([
    supabase.from("communication_numbers").select("id, location_id, provider, phone_number, friendly_name, supports_sms, supports_voice, active, is_primary, is_test_number").eq("organization_id", profile.organizationId).order("friendly_name"),
    supabase.from("communication_settings").select("id, location_id, messaging_enabled, missed_call_text_back_enabled, appointment_confirmation_enabled, reminder_24h_enabled, reminder_1h_enabled").eq("organization_id", profile.organizationId)
  ]);

  return (
    <div className="page-stack">
      <PageHeader
        description="Communication configuration by location. Secrets are never displayed here."
        title="Settings"
      />
      <section className="panel">
        <div className="panel-header"><h2>Communications</h2><span>Configured / Not Configured</span></div>
        <div className="settings-grid">
          {profile.locations.map((location) => {
            const number = numbers?.find((item) => item.location_id === location.id);
            const locationSettings = settings?.find((item) => item.location_id === location.id);

            return (
              <article className="settings-card" key={location.id}>
                <div>
                  <h2>{location.name}</h2>
                  <StatusBadge status={number?.active ? "Configured" : "Not Configured"} />
                </div>
                <dl>
                  <div><dt>SMS Number</dt><dd>{number ? formatPhoneNumber(number.phone_number) : "Not configured"}</dd></div>
                  <div><dt>Voice Number</dt><dd>{number?.supports_voice ? formatPhoneNumber(number.phone_number) : "Not configured"}</dd></div>
                  <div><dt>Provider</dt><dd>{number?.provider ?? "none"}{number?.is_test_number ? " · NON-LIVE" : ""}</dd></div>
                  <div><dt>Messaging</dt><dd>{locationSettings?.messaging_enabled ? "Enabled" : "Off"}</dd></div>
                  <div><dt>Missed-call text-back</dt><dd>{locationSettings?.missed_call_text_back_enabled ? "Enabled" : "Off"}</dd></div>
                  <div><dt>Appointment confirmation</dt><dd>{locationSettings?.appointment_confirmation_enabled ? "Enabled" : "Off"}</dd></div>
                  <div><dt>24-hour reminder</dt><dd>{locationSettings?.reminder_24h_enabled ? "Enabled" : "Off"}</dd></div>
                  <div><dt>1-hour reminder</dt><dd>{locationSettings?.reminder_1h_enabled ? "Enabled" : "Off"}</dd></div>
                </dl>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
