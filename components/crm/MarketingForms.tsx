"use client";

import { addContactAttribution, addMarketingSpend, correctContactAttribution, saveMarketingCampaign, saveMarketingSource } from "@/app/marketing-actions";
import { ActionForm } from "@/components/crm/ActionForm";

type Option = { id: string; name: string };

export function MarketingSourceForm({ source }: { source?: { id?: string; name?: string | null; channel?: string | null; provider?: string | null; active?: boolean | null } }) {
  return (
    <ActionForm action={saveMarketingSource} submitLabel="Save Source" successMessage="Marketing source saved">
      <input name="source_id" type="hidden" value={source?.id ?? ""} />
      <div className="form-grid two">
        <label><span>Name</span><input name="name" required defaultValue={source?.name ?? ""} /></label>
        <label><span>Channel</span><select name="channel" defaultValue={source?.channel ?? "Meta"}><option>Meta</option><option>Google</option><option>TikTok</option><option>Organic Search</option><option>Organic Social</option><option>Referral</option><option>Website</option><option>Walk-In</option><option>Email</option><option>SMS</option><option>Existing Patient</option><option>Direct</option><option>Unknown</option><option>Other</option></select></label>
        <label><span>Provider</span><select name="provider" defaultValue={source?.provider ?? "manual"}><option value="manual">manual</option><option value="meta">meta</option><option value="google">google</option><option value="highlevel">highlevel</option><option value="website">website</option><option value="referral">referral</option><option value="tiktok">tiktok</option><option value="unknown">unknown</option><option value="other">other</option></select></label>
      </div>
      <label><span>Aliases</span><input name="aliases" placeholder="Facebook, FB, facebook_lead_ads" /></label>
      <label className="checkbox-row"><input name="active" type="checkbox" defaultChecked={source?.active ?? true} /> Active</label>
    </ActionForm>
  );
}

export function MarketingCampaignForm({ campaign, sources, locations }: { campaign?: Record<string, string | number | boolean | null>; sources: Option[]; locations: Option[] }) {
  return (
    <ActionForm action={saveMarketingCampaign} submitLabel="Save Campaign" successMessage="Campaign saved">
      <input name="campaign_id" type="hidden" value={String(campaign?.id ?? "")} />
      <div className="form-grid two">
        <label><span>Name</span><input name="name" required defaultValue={String(campaign?.name ?? "")} /></label>
        <label><span>Source</span><select name="source_id" required defaultValue={String(campaign?.source_id ?? "")}>{sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label>
        <label><span>Location</span><select name="location_id" defaultValue={String(campaign?.location_id ?? "")}><option value="">Organization-wide</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <label><span>Status</span><select name="status" defaultValue={String(campaign?.status ?? "active")}><option value="draft">Draft</option><option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option><option value="archived">Archived</option></select></label>
        <label><span>Service Category</span><input name="service_category" defaultValue={String(campaign?.service_category ?? "")} /></label>
        <label><span>Objective</span><input name="objective" defaultValue={String(campaign?.objective ?? "")} /></label>
        <label><span>Start Date</span><input name="start_date" type="date" required defaultValue={String(campaign?.start_date ?? new Date().toISOString().slice(0, 10))} /></label>
        <label><span>End Date</span><input name="end_date" type="date" defaultValue={String(campaign?.end_date ?? "")} /></label>
        <label><span>Budget</span><input name="budget" defaultValue={campaign?.budget_cents ? String(Number(campaign.budget_cents) / 100) : ""} /></label>
        <label><span>External Campaign ID</span><input name="external_campaign_id" defaultValue={String(campaign?.external_campaign_id ?? "")} /></label>
      </div>
      <input name="provider" type="hidden" value={String(campaign?.provider ?? "manual")} />
      <label className="checkbox-row"><input name="active" type="checkbox" defaultChecked={Boolean(campaign?.active ?? true)} /> Active</label>
    </ActionForm>
  );
}

export function MarketingSpendForm({ sources, campaigns, locations }: { sources: Option[]; campaigns: Option[]; locations: Option[] }) {
  return (
    <ActionForm action={addMarketingSpend} submitLabel="Add Spend" successMessage="Marketing spend added">
      <div className="form-grid two">
        <label><span>Source</span><select name="source_id" required>{sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label>
        <label><span>Campaign</span><select name="campaign_id"><option value="">No campaign</option>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label>
        <label><span>Location</span><select name="location_id"><option value="">Organization-wide</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <label><span>Date</span><input name="spend_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></label>
        <label><span>Spend</span><input name="spend" required placeholder="250.00" /></label>
        <label><span>Impressions</span><input name="impressions" type="number" min="0" /></label>
        <label><span>Clicks</span><input name="clicks" type="number" min="0" /></label>
        <label><span>Leads</span><input name="leads" type="number" min="0" /></label>
      </div>
      <input name="provider" type="hidden" value="manual" />
    </ActionForm>
  );
}

export function ContactAttributionForm({ contactId, sources, campaigns }: { contactId: string; sources: Option[]; campaigns: Option[] }) {
  return (
    <ActionForm action={addContactAttribution} submitLabel="Add Attribution" successMessage="Attribution added">
      <input name="contact_id" type="hidden" value={contactId} />
      <div className="form-grid two">
        <label><span>Source</span><select name="source_id"><option value="">Unknown</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label>
        <label><span>Campaign</span><select name="campaign_id"><option value="">No campaign</option>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label>
        <label><span>Type</span><select name="attribution_type"><option value="first_touch">First Touch</option><option value="last_touch">Last Touch</option><option value="lead_creation">Lead Creation</option><option value="manual">Manual</option></select></label>
        <label><span>Click ID</span><input name="external_click_id" /></label>
      </div>
      <label><span>Landing Page</span><input name="landing_page" /></label>
      <label><span>Referrer</span><input name="referrer" /></label>
      <label><span>Reason</span><textarea name="reason" rows={2} /></label>
      <label className="checkbox-row"><input name="is_primary" type="checkbox" /> Set as primary attribution</label>
    </ActionForm>
  );
}

export function AttributionCorrectionForm({ oldAttributionId, sources, campaigns }: { oldAttributionId: string; sources: Option[]; campaigns: Option[] }) {
  return (
    <ActionForm action={correctContactAttribution} submitLabel="Correct Attribution" successMessage="Attribution corrected">
      <input name="old_contact_attribution_id" type="hidden" value={oldAttributionId} />
      <div className="form-grid two">
        <label><span>New Source</span><select name="source_id" required>{sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label>
        <label><span>New Campaign</span><select name="campaign_id"><option value="">No campaign</option>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label>
      </div>
      <label><span>Reason</span><textarea name="reason" rows={3} required /></label>
    </ActionForm>
  );
}
