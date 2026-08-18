import Link from "next/link";
import { CampaignSettingsForm, SuppressionMemberForm } from "@/components/crm/CampaignForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { hasCampaignPermission } from "@/lib/campaigns/permissions";
import { createClient } from "@/lib/supabase/server";

export default async function CampaignSettingsPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const canRead = hasCampaignPermission(profile, "campaigns.read");
  const canManageSettings = hasCampaignPermission(profile, "campaigns.settings.manage");
  const canManageSuppression = hasCampaignPermission(profile, "suppression.manage");
  if (!canRead) {
    return <div className="page-stack"><PageHeader description="Your role does not include lifecycle campaign settings access." title="Campaign Settings" /></div>;
  }

  const [{ data: settings }, { data: lists }, { data: contacts }, { data: members }] = await Promise.all([
    supabase.from("campaign_settings").select("*").eq("organization_id", profile.organizationId).maybeSingle(),
    supabase.from("suppression_lists").select("id, name, suppression_type, active").eq("organization_id", profile.organizationId).order("name"),
    supabase.from("contacts").select("id, first_name, last_name, phone").eq("organization_id", profile.organizationId).order("last_name").limit(200),
    supabase.from("suppression_list_members").select("contact_id, reason, created_at, suppression_lists!inner(id, name, organization_id), contacts(first_name, last_name)").eq("suppression_lists.organization_id", profile.organizationId).order("created_at", { ascending: false }).limit(200)
  ]);

  const listOptions = (lists ?? []).map((list) => ({ id: list.id, name: list.name }));
  const contactOptions = (contacts ?? []).map((contact) => ({ id: contact.id, name: `${contact.first_name} ${contact.last_name}` }));

  return (
    <div className="page-stack">
      <PageHeader
        action={<div className="header-actions"><Link className="secondary-button" href="/marketing/campaigns">Campaigns</Link><Link className="secondary-button" href="/marketing/segments">Segments</Link></div>}
        description="Frequency caps, quiet hours, simulation mode, and suppression lists for lifecycle campaigns."
        title="Campaign Settings"
      />
      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Frequency & Safety</h2><span>Simulation mode remains enabled</span></div>
          {canManageSettings ? <CampaignSettingsForm settings={settings ?? undefined} /> : (
            <dl className="settings-list">
              <div><dt>SMS / minute</dt><dd>{settings?.max_sms_per_minute ?? 25}</dd></div>
              <div><dt>SMS / hour</dt><dd>{settings?.max_sms_per_hour ?? 250}</dd></div>
              <div><dt>Daily cap</dt><dd>{settings?.daily_contact_frequency_cap ?? 2}</dd></div>
              <div><dt>Weekly cap</dt><dd>{settings?.weekly_contact_frequency_cap ?? 5}</dd></div>
              <div><dt>Quiet hours</dt><dd>{settings?.quiet_hours_enabled ? `${settings.quiet_hours_start}-${settings.quiet_hours_end}` : "Disabled"}</dd></div>
              <div><dt>Simulation</dt><dd>{settings?.simulation_mode === false ? "Disabled" : "Enabled"}</dd></div>
            </dl>
          )}
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Suppression Lists</h2><span>Global exclusions before any send</span></div>
          <div className="record-list">
            {(lists ?? []).map((list) => (
              <article key={list.id}>
                <strong>{list.name}</strong>
                <p>{list.suppression_type}</p>
                <StatusBadge status={list.active ? "Active" : "Inactive"} />
              </article>
            ))}
          </div>
        </section>
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Suppressed Contacts</h2><span>No bulk campaign send can target these contacts</span></div>
        {canManageSuppression ? <details><summary className="summary-action">Add Contact to Suppression List</summary><SuppressionMemberForm contacts={contactOptions} lists={listOptions} /></details> : null}
        <div className="record-list">
          {(members ?? []).map((member) => {
            const list = Array.isArray(member.suppression_lists) ? member.suppression_lists[0] : member.suppression_lists;
            const contact = Array.isArray(member.contacts) ? member.contacts[0] : member.contacts;
            return (
              <article key={`${member.contact_id}-${list?.id ?? "list"}`}>
                <strong>{contact ? `${contact.first_name} ${contact.last_name}` : "Contact"}</strong>
                <p>{list?.name ?? "Suppression list"}</p>
                <span>{member.reason} - {new Date(member.created_at).toLocaleDateString()}</span>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
