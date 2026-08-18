"use client";

import {
  createReferral,
  createReviewRequestAction,
  generateReferralCode,
  issueReferralRewardAction,
  mapReviewSourceToLocation,
  markReviewRequestSent,
  resolveFeedbackEscalation,
  saveReactivationCampaign,
  saveReactivationSegment,
  saveReferralProgram,
  saveReviewSource,
  saveReviewTemplate,
  submitFeedbackResponse,
  updateReferralStatus
} from "@/app/reputation-actions";
import { ActionForm } from "@/components/crm/ActionForm";
import { APP_DISPLAY_NAME } from "@/lib/config/branding";

type Option = { id: string; name: string };
type ContactOption = { id: string; name: string; location_id?: string | null };

export function ReviewSourceForm({ source }: { source?: Record<string, string | boolean | null> }) {
  return (
    <ActionForm action={saveReviewSource} submitLabel="Save Source" successMessage="Review source saved">
      <input name="review_source_id" type="hidden" value={String(source?.id ?? "")} />
      <div className="form-grid two">
        <label><span>Name</span><input name="name" required defaultValue={String(source?.name ?? "")} /></label>
        <label><span>Provider</span><select name="provider" defaultValue={String(source?.provider ?? "Google")}><option>Google</option><option>Facebook</option><option>Yelp</option><option>Internal</option><option>Other</option></select></label>
        <label><span>External Location ID</span><input name="external_location_id" defaultValue={String(source?.external_location_id ?? "")} /></label>
        <label><span>Review URL</span><input name="review_url" defaultValue={String(source?.review_url ?? "")} /></label>
      </div>
      <label className="checkbox-row"><input name="active" type="checkbox" defaultChecked={Boolean(source?.active ?? true)} /> Active</label>
    </ActionForm>
  );
}

export function LocationReviewSourceForm({ locations, sources }: { locations: Option[]; sources: Option[] }) {
  return (
    <ActionForm action={mapReviewSourceToLocation} submitLabel="Map Source" successMessage="Location review source mapped">
      <div className="form-grid two">
        <label><span>Location</span><select name="location_id" required>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <label><span>Source</span><select name="review_source_id" required>{sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label>
      </div>
      <label className="checkbox-row"><input name="is_default" type="checkbox" defaultChecked /> Default for location</label>
      <label className="checkbox-row"><input name="active" type="checkbox" defaultChecked /> Active</label>
    </ActionForm>
  );
}

export function ReviewTemplateForm({ template }: { template?: Record<string, string | boolean | null> }) {
  return (
    <ActionForm action={saveReviewTemplate} submitLabel="Save Template" successMessage="Review template saved">
      <input name="template_id" type="hidden" value={String(template?.id ?? "")} />
      <div className="form-grid two">
        <label><span>Name</span><input name="name" required defaultValue={String(template?.name ?? "")} /></label>
        <label><span>Channel</span><select name="channel" defaultValue={String(template?.channel ?? "sms")}><option value="sms">SMS</option><option value="patient_portal">Patient Portal</option><option value="internal_link">Internal Link</option></select></label>
      </div>
      <label><span>Body</span><textarea name="body" required rows={4} defaultValue={String(template?.body ?? `Hi {{first_name}}, thank you for visiting ${APP_DISPLAY_NAME} {{location_name}}. If you have a moment, we would appreciate your honest feedback.`)} /></label>
      <label className="checkbox-row"><input name="active" type="checkbox" defaultChecked={Boolean(template?.active ?? true)} /> Active</label>
    </ActionForm>
  );
}

export function ReviewRequestForm({ contacts, locations, sources }: { contacts: ContactOption[]; locations: Option[]; sources: Option[] }) {
  return (
    <ActionForm action={createReviewRequestAction} submitLabel="Create Request" successMessage="Review request created">
      <div className="form-grid two">
        <label><span>Contact</span><select name="contact_id" required>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></label>
        <label><span>Location</span><select name="location_id" required>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <label><span>Channel</span><select name="request_channel" defaultValue="sms"><option value="sms">SMS</option><option value="patient_portal">Patient Portal</option><option value="internal_link">Internal Link</option></select></label>
        <label><span>Review Source</span><select name="review_source_id"><option value="">Default source</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label>
      </div>
    </ActionForm>
  );
}

export function MarkReviewSentForm({ requestId }: { requestId: string }) {
  return (
    <ActionForm action={markReviewRequestSent} submitLabel="Mark Sent" successMessage="Request marked sent">
      <input name="review_request_id" type="hidden" value={requestId} />
    </ActionForm>
  );
}

export function FeedbackResponseForm({ contacts, locations, surveys, providers, services }: { contacts: ContactOption[]; locations: Option[]; surveys: Option[]; providers: Option[]; services: Option[] }) {
  return (
    <ActionForm action={submitFeedbackResponse} submitLabel="Submit Feedback" successMessage="Feedback recorded">
      <div className="form-grid two">
        <label><span>Contact</span><select name="contact_id" required>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></label>
        <label><span>Location</span><select name="location_id" required>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <label><span>Survey</span><select name="survey_id" required>{surveys.map((survey) => <option key={survey.id} value={survey.id}>{survey.name}</option>)}</select></label>
        <label><span>Provider</span><select name="provider_id"><option value="">Unassigned</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>
        <label><span>Service</span><select name="service_id"><option value="">No service</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
        <label><span>NPS Score</span><input name="score" type="number" min="0" max="10" /></label>
        <label><span>CSAT Rating</span><input name="rating" type="number" min="1" max="5" /></label>
      </div>
      <label><span>Response</span><textarea name="response_text" rows={3} /></label>
    </ActionForm>
  );
}

export function EscalationResolutionForm({ escalationId }: { escalationId: string }) {
  return (
    <ActionForm action={resolveFeedbackEscalation} submitLabel="Update Escalation" successMessage="Escalation updated">
      <input name="feedback_escalation_id" type="hidden" value={escalationId} />
      <div className="form-grid two">
        <label><span>Status</span><select name="status" defaultValue="in_review"><option value="in_review">In Review</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option></select></label>
      </div>
      <label><span>Notes</span><textarea name="notes" rows={2} /></label>
    </ActionForm>
  );
}

export function ReferralProgramForm({ program }: { program?: Record<string, string | number | boolean | null> }) {
  return (
    <ActionForm action={saveReferralProgram} submitLabel="Save Program" successMessage="Referral program saved">
      <input name="referral_program_id" type="hidden" value={String(program?.id ?? "")} />
      <div className="form-grid two">
        <label><span>Name</span><input name="name" required defaultValue={String(program?.name ?? "")} /></label>
        <label><span>Reward Type</span><select name="reward_type" defaultValue={String(program?.reward_type ?? "credit")}><option value="credit">Credit</option><option value="fixed_reward">Fixed Reward</option><option value="discount">Discount</option><option value="non_cash">Non-Cash</option><option value="none">None</option></select></label>
        <label><span>Reward Value</span><input name="reward_value" type="number" min="0" defaultValue={String(program?.reward_value ?? 0)} /></label>
        <label><span>Start Date</span><input name="start_date" type="date" defaultValue={String(program?.start_date ?? "")} /></label>
        <label><span>End Date</span><input name="end_date" type="date" defaultValue={String(program?.end_date ?? "")} /></label>
      </div>
      <label><span>Description</span><textarea name="description" rows={2} defaultValue={String(program?.description ?? "")} /></label>
      <label className="checkbox-row"><input name="active" type="checkbox" defaultChecked={Boolean(program?.active ?? true)} /> Active</label>
    </ActionForm>
  );
}

export function ReferralCodeForm({ contacts, programs }: { contacts: ContactOption[]; programs: Option[] }) {
  return (
    <ActionForm action={generateReferralCode} submitLabel="Generate Code" successMessage="Referral code saved">
      <div className="form-grid two">
        <label><span>Contact</span><select name="contact_id" required>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></label>
        <label><span>Program</span><select name="referral_program_id"><option value="">Default program</option>{programs.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}</select></label>
        <label><span>Code</span><input name="code" required placeholder="ISABELLA25" /></label>
      </div>
    </ActionForm>
  );
}

export function ReferralForm({ contacts, locations, codes }: { contacts: ContactOption[]; locations: Option[]; codes: Option[] }) {
  return (
    <ActionForm action={createReferral} submitLabel="Create Referral" successMessage="Referral created">
      <div className="form-grid two">
        <label><span>Referring Contact</span><select name="referring_contact_id" required>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></label>
        <label><span>Referred Contact</span><select name="referred_contact_id"><option value="">Not linked yet</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></label>
        <label><span>Location</span><select name="location_id"><option value="">No location</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <label><span>Code</span><select name="referral_code_id"><option value="">Manual source</option>{codes.map((code) => <option key={code.id} value={code.id}>{code.name}</option>)}</select></label>
        <label><span>Status</span><select name="status" defaultValue="lead"><option value="lead">Lead</option><option value="booked">Booked</option><option value="showed">Showed</option><option value="sold">Sold</option><option value="reward_pending">Reward Pending</option><option value="lost">Lost</option></select></label>
      </div>
    </ActionForm>
  );
}

export function ReferralStatusForm({ referralId }: { referralId: string }) {
  return (
    <ActionForm action={updateReferralStatus} submitLabel="Update Status" successMessage="Referral updated">
      <input name="referral_id" type="hidden" value={referralId} />
      <div className="form-grid two">
        <label><span>Status</span><select name="status"><option value="booked">Booked</option><option value="showed">Showed</option><option value="sold">Sold</option><option value="reward_pending">Reward Pending</option><option value="reward_issued">Reward Issued</option><option value="lost">Lost</option></select></label>
        <label><span>Sale ID</span><input name="sale_id" /></label>
      </div>
    </ActionForm>
  );
}

export function ReferralRewardForm({ referrals }: { referrals: Option[] }) {
  return (
    <ActionForm action={issueReferralRewardAction} submitLabel="Issue Demo Reward" successMessage="Reward issued">
      <div className="form-grid two">
        <label><span>Referral</span><select name="referral_id" required>{referrals.map((referral) => <option key={referral.id} value={referral.id}>{referral.name}</option>)}</select></label>
        <label><span>Reason</span><input name="reason" defaultValue="Approved fictional demo reward" /></label>
      </div>
    </ActionForm>
  );
}

export function ReactivationSegmentForm() {
  return (
    <ActionForm action={saveReactivationSegment} submitLabel="Save Segment" successMessage="Segment saved">
      <div className="form-grid two">
        <label><span>Name</span><input name="name" required placeholder="180-Day Inactive" /></label>
        <label><span>Rule</span><input name="rule" required placeholder="last_visit_days_gt:180" /></label>
      </div>
      <label><span>Description</span><textarea name="description" rows={2} /></label>
      <label className="checkbox-row"><input name="active" type="checkbox" defaultChecked /> Active</label>
    </ActionForm>
  );
}

export function ReactivationCampaignForm({ segments, workflows }: { segments: Option[]; workflows: Option[] }) {
  return (
    <ActionForm action={saveReactivationCampaign} submitLabel="Save Campaign" successMessage="Campaign saved">
      <div className="form-grid two">
        <label><span>Name</span><input name="name" required /></label>
        <label><span>Segment</span><select name="segment_id"><option value="">No segment</option>{segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.name}</option>)}</select></label>
        <label><span>Workflow</span><select name="workflow_id"><option value="">No workflow</option>{workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}</select></label>
        <label><span>Status</span><select name="status" defaultValue="draft"><option value="draft">Draft</option><option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option></select></label>
        <label><span>Targeted</span><input name="contacts_targeted" type="number" min="0" defaultValue="0" /></label>
        <label><span>Reactivated</span><input name="contacts_reactivated" type="number" min="0" defaultValue="0" /></label>
        <label><span>Bookings</span><input name="bookings_generated" type="number" min="0" defaultValue="0" /></label>
        <label><span>Sales</span><input name="sales_generated" type="number" min="0" defaultValue="0" /></label>
        <label><span>Collected Cents</span><input name="collected_revenue_cents" type="number" min="0" defaultValue="0" /></label>
      </div>
    </ActionForm>
  );
}
