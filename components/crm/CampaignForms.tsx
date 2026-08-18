"use client";

import { launchSimulatedCampaign, saveCampaignSettings, saveCampaignVariant, saveLifecycleCampaign, saveSegment, saveSuppressionMember, updateCampaignStatus } from "@/app/campaign-actions";
import { ActionForm } from "@/components/crm/ActionForm";

type Option = { id: string; name: string };

export function SegmentForm() {
  return (
    <ActionForm action={saveSegment} submitLabel="Save Segment" successMessage="Segment saved">
      <div className="form-grid two">
        <label><span>Name</span><input name="name" required placeholder="Miami Hair Consult No-Sale - 30 Days" /></label>
        <label><span>Type</span><select name="segment_type" defaultValue="dynamic"><option value="dynamic">Dynamic</option><option value="static">Static</option></select></label>
      </div>
      <label><span>Description</span><textarea name="description" rows={2} /></label>
      <label><span>Rules JSON</span><textarea name="rules_json" rows={5} defaultValue={'{"logic":"and","conditions":[{"field":"sms_opted_out","operator":"equals","value":false}]}'}/></label>
      <label><span>Location Scope JSON</span><textarea name="location_scope" rows={2} defaultValue={'{"mode":"all_allowed","location_ids":[]}'}/></label>
    </ActionForm>
  );
}

export function LifecycleCampaignForm({ segments, workflows }: { segments: Option[]; workflows: Option[] }) {
  return (
    <ActionForm action={saveLifecycleCampaign} submitLabel="Save Campaign" successMessage="Campaign saved">
      <div className="form-grid two">
        <label><span>Name</span><input name="name" required /></label>
        <label><span>Type</span><select name="campaign_type" defaultValue="bulk_message"><option value="bulk_message">Bulk Message</option><option value="workflow_enrollment">Workflow Enrollment</option><option value="reactivation">Reactivation</option><option value="announcement">Announcement</option><option value="promotion">Promotion</option><option value="reminder">Reminder</option><option value="custom">Custom</option></select></label>
        <label><span>Segment</span><select name="segment_id"><option value="">No segment</option>{segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.name}</option>)}</select></label>
        <label><span>Workflow</span><select name="workflow_id"><option value="">No workflow</option>{workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}</select></label>
        <label><span>Channel</span><select name="channel" defaultValue="sms"><option value="sms">SMS</option><option value="workflow">Workflow</option><option value="internal">Internal</option></select></label>
        <label><span>Classification</span><select name="message_classification" defaultValue="marketing"><option value="transactional">Transactional</option><option value="marketing">Marketing</option><option value="operational">Operational</option><option value="review_request">Review Request</option><option value="reactivation">Reactivation</option><option value="campaign">Campaign</option></select></label>
        <label><span>Scheduled At</span><input name="scheduled_at" type="datetime-local" /></label>
        <label><span>Recurrence</span><input name="recurrence_rule" placeholder="FREQ=MONTHLY" /></label>
      </div>
      <label><span>Description</span><textarea name="description" rows={2} /></label>
      <input name="status" type="hidden" value="draft" />
      <input name="location_scope" type="hidden" value='{"mode":"all_allowed","location_ids":[]}' />
    </ActionForm>
  );
}

export function CampaignVariantForm({ campaignId }: { campaignId: string }) {
  return (
    <ActionForm action={saveCampaignVariant} submitLabel="Save Variant" successMessage="Variant saved">
      <input name="campaign_id" type="hidden" value={campaignId} />
      <div className="form-grid two">
        <label><span>Name</span><input name="name" required /></label>
        <label><span>Weight %</span><input name="weight_percent" required type="number" defaultValue="100" /></label>
      </div>
      <label><span>Message Body</span><textarea name="message_body" rows={4} required placeholder="Hi {{first_name}}, ..." /></label>
    </ActionForm>
  );
}

export function CampaignStatusForm({ campaignId, action, label }: { campaignId: string; action: "pause" | "cancel" | "draft"; label: string }) {
  return (
    <form action={updateCampaignStatus}>
      <input name="campaign_id" type="hidden" value={campaignId} />
      <input name="action" type="hidden" value={action} />
      <button className="secondary-button" type="submit">{label}</button>
    </form>
  );
}

export function LaunchSimulationForm({ campaignId }: { campaignId: string }) {
  return (
    <form action={launchSimulatedCampaign}>
      <input name="campaign_id" type="hidden" value={campaignId} />
      <button className="primary-button" type="submit">Launch Simulation</button>
    </form>
  );
}

export function CampaignSettingsForm({ settings }: { settings?: Record<string, string | number | boolean | null> }) {
  return (
    <ActionForm action={saveCampaignSettings} submitLabel="Save Settings" successMessage="Campaign settings saved">
      <div className="form-grid two">
        <label><span>SMS / Minute</span><input name="max_sms_per_minute" type="number" defaultValue={String(settings?.max_sms_per_minute ?? 25)} /></label>
        <label><span>SMS / Hour</span><input name="max_sms_per_hour" type="number" defaultValue={String(settings?.max_sms_per_hour ?? 250)} /></label>
        <label><span>Daily Cap</span><input name="daily_contact_frequency_cap" type="number" defaultValue={String(settings?.daily_contact_frequency_cap ?? 2)} /></label>
        <label><span>Weekly Cap</span><input name="weekly_contact_frequency_cap" type="number" defaultValue={String(settings?.weekly_contact_frequency_cap ?? 5)} /></label>
        <label><span>Quiet Start</span><input name="quiet_hours_start" type="time" defaultValue={String(settings?.quiet_hours_start ?? "20:00")} /></label>
        <label><span>Quiet End</span><input name="quiet_hours_end" type="time" defaultValue={String(settings?.quiet_hours_end ?? "09:00")} /></label>
        <label><span>Booking Window Days</span><input name="booking_attribution_window_days" type="number" defaultValue={String(settings?.booking_attribution_window_days ?? 7)} /></label>
        <label><span>Sale Window Days</span><input name="sale_attribution_window_days" type="number" defaultValue={String(settings?.sale_attribution_window_days ?? 30)} /></label>
        <label><span>Max Recipients</span><input name="max_recipients_per_campaign" type="number" defaultValue={String(settings?.max_recipients_per_campaign ?? 500)} /></label>
      </div>
      <label className="checkbox-row"><input name="quiet_hours_enabled" type="checkbox" defaultChecked={Boolean(settings?.quiet_hours_enabled ?? true)} /> Quiet hours enabled</label>
      <label className="checkbox-row"><input name="weekends_enabled" type="checkbox" defaultChecked={Boolean(settings?.weekends_enabled ?? true)} /> Weekend sending enabled</label>
      <label className="checkbox-row"><input name="approval_required" type="checkbox" defaultChecked={Boolean(settings?.approval_required ?? true)} /> Approval required</label>
      <p>Simulation mode remains enabled in development; no real bulk SMS is sent.</p>
    </ActionForm>
  );
}

export function SuppressionMemberForm({ lists, contacts }: { lists: Option[]; contacts: Option[] }) {
  return (
    <ActionForm action={saveSuppressionMember} submitLabel="Add Suppression" successMessage="Suppression saved">
      <div className="form-grid two">
        <label><span>List</span><select name="suppression_list_id" required>{lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select></label>
        <label><span>Contact</span><select name="contact_id" required>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></label>
      </div>
      <label><span>Reason</span><textarea name="reason" rows={2} required /></label>
    </ActionForm>
  );
}
