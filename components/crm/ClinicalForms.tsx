import {
  addClinicalAddendum,
  addClinicalDocumentMetadata,
  addClinicalPhotoMetadata,
  adjustEntitlement,
  cancelTreatmentSession,
  completeTreatmentFollowup,
  completeTreatmentSession,
  createClinicalNote,
  createTreatmentPlan,
  createTreatmentSession,
  saveClinicalServiceSetting,
  saveClinicalTemplate,
  saveConsentTemplate,
  signClinicalNote,
  signConsentRecord,
  startTreatmentSession
} from "@/app/clinical-actions";
import { ActionForm } from "@/components/crm/ActionForm";

type Option = { id: string; name: string };

export function TreatmentPlanForm({
  contactId,
  locations,
  providers,
  services,
  entitlements
}: {
  contactId: string;
  locations: Option[];
  providers: Option[];
  services: Option[];
  entitlements: Option[];
}) {
  return (
    <ActionForm action={createTreatmentPlan} submitLabel="Create Treatment Plan" successMessage="Treatment plan created">
      <input name="contact_id" type="hidden" value={contactId} />
      <div className="form-grid two">
        <label><span>Plan Name</span><input name="name" required /></label>
        <label><span>Status</span><select name="status" defaultValue="active"><option value="draft">Draft</option><option value="active">Active</option><option value="on_hold">On Hold</option></select></label>
        <label><span>Location</span><select name="location_id" required>{locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span>Provider</span><select name="provider_id"><option value="">Unassigned</option>{providers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span>Start Date</span><input name="start_date" required type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></label>
        <label><span>Target Completion</span><input name="target_completion_date" type="date" /></label>
        <label><span>Service</span><select name="service_id"><option value="">No item yet</option>{services.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span>Package Entitlement</span><select name="package_entitlement_id"><option value="">No linked entitlement</option>{entitlements.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span>Planned Sessions</span><input name="planned_sessions" defaultValue="3" min="1" type="number" /></label>
        <label><span>Interval Days</span><input name="interval_days" defaultValue="30" min="0" type="number" /></label>
      </div>
      <label><span>Description</span><textarea name="description" rows={3} /></label>
      <label><span>Plan Item Notes</span><textarea name="item_notes" rows={3} /></label>
    </ActionForm>
  );
}

export function TreatmentSessionForm({
  contactId,
  locations,
  providers,
  services,
  plans,
  planItems,
  entitlements
}: {
  contactId: string;
  locations: Option[];
  providers: Option[];
  services: Option[];
  plans: Option[];
  planItems: Option[];
  entitlements: Option[];
}) {
  return (
    <ActionForm action={createTreatmentSession} submitLabel="Create Treatment Session" successMessage="Treatment session created">
      <input name="contact_id" type="hidden" value={contactId} />
      <div className="form-grid two">
        <label><span>Service</span><select name="service_id" required>{services.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span>Status</span><select name="status" defaultValue="scheduled"><option value="planned">Planned</option><option value="scheduled">Scheduled</option></select></label>
        <label><span>Location</span><select name="location_id" required>{locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span>Provider</span><select name="provider_id"><option value="">Me / Unassigned</option>{providers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span>Scheduled At</span><input name="scheduled_at" type="datetime-local" /></label>
        <label><span>Session #</span><input name="session_number" min="1" type="number" /></label>
        <label><span>Treatment Plan</span><select name="treatment_plan_id"><option value="">No plan</option>{plans.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span>Plan Item</span><select name="treatment_plan_item_id"><option value="">No plan item</option>{planItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span>Entitlement</span><select name="package_entitlement_id"><option value="">No entitlement</option>{entitlements.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span>Treatment Area</span><input name="treatment_area" /></label>
      </div>
      <label><span>Clinical Summary</span><textarea name="clinical_summary" rows={3} /></label>
    </ActionForm>
  );
}

export function TreatmentSessionStatusForms({ sessionId }: { sessionId: string }) {
  return (
    <div className="quick-actions">
      <form action={startTreatmentSession}><input name="treatment_session_id" type="hidden" value={sessionId} /><button type="submit">Start Treatment</button></form>
      <details>
        <summary className="summary-action">Complete Treatment</summary>
        <ActionForm action={completeTreatmentSession} submitLabel="Complete Session" successMessage="Session completed">
          <input name="treatment_session_id" type="hidden" value={sessionId} />
          <div className="form-grid two">
            <label><span>Treatment Area</span><input name="treatment_area" /></label>
            <label><span>Documentation</span><select name="documentation_status" defaultValue="completed"><option value="completed">Completed</option><option value="signed">Signed</option></select></label>
            <label><span>Treatment Performed</span><input name="treatment_performed" /></label>
            <label><span>Product / Device</span><input name="product_device_used" /></label>
            <label><span>Lot / Reference</span><input name="lot_reference" /></label>
            <label><span>Settings / Parameters</span><input name="settings_parameters" /></label>
            <label><span>Amount / Quantity</span><input name="amount_quantity" /></label>
            <label><span>Patient Tolerance</span><input name="patient_tolerance" /></label>
          </div>
          <label><span>Immediate Response</span><textarea name="immediate_response" rows={2} /></label>
          <label><span>Clinical Summary</span><textarea name="clinical_summary" rows={3} /></label>
          <label><span>Aftercare</span><textarea name="aftercare_plan" rows={3} /></label>
          <label><span>Follow-Up Plan</span><textarea name="followup_plan" rows={3} /></label>
          <div className="form-grid two">
            <label><span>Follow-Up Days</span><input name="followup_days" defaultValue="7" min="0" type="number" /></label>
            <label><span>Follow-Up Type</span><select name="followup_type" defaultValue="clinical_review"><option value="24-hour check">24-Hour Check</option><option value="1-week follow-up">1-Week Follow-Up</option><option value="1-month follow-up">1-Month Follow-Up</option><option value="progress photo">Progress Photo</option><option value="package review">Package Review</option><option value="clinical_review">Clinical Review</option></select></label>
          </div>
        </ActionForm>
      </details>
      {["cancelled", "no_show"].map((status) => <form action={cancelTreatmentSession} key={status}><input name="treatment_session_id" type="hidden" value={sessionId} /><input name="status" type="hidden" value={status} /><button type="submit">{status === "no_show" ? "Mark No-Show" : "Cancel"}</button></form>)}
    </div>
  );
}

export function ClinicalNoteForm({ contactId, locationId, sessionId, planId }: { contactId: string; locationId?: string | null; sessionId?: string | null; planId?: string | null }) {
  return (
    <ActionForm action={createClinicalNote} submitLabel="Add Clinical Note" successMessage="Clinical note added">
      <input name="contact_id" type="hidden" value={contactId} />
      <input name="location_id" type="hidden" value={locationId ?? ""} />
      <input name="treatment_session_id" type="hidden" value={sessionId ?? ""} />
      <input name="treatment_plan_id" type="hidden" value={planId ?? ""} />
      <label><span>Note Type</span><select name="note_type"><option value="general_clinical">General Clinical</option><option value="follow_up">Follow-Up</option><option value="treatment">Treatment</option><option value="provider">Provider</option><option value="clinical_communication">Clinical Communication</option></select></label>
      <label><span>Clinical Note</span><textarea name="body" required rows={4} /></label>
    </ActionForm>
  );
}

export function ClinicalNoteActions({ noteId, locked }: { noteId: string; locked: boolean }) {
  return locked ? (
    <details>
      <summary className="summary-action">Add Addendum</summary>
      <ActionForm action={addClinicalAddendum} submitLabel="Add Addendum" successMessage="Addendum added">
        <input name="clinical_note_id" type="hidden" value={noteId} />
        <label><span>Addendum</span><textarea name="addendum_text" required rows={3} /></label>
      </ActionForm>
    </details>
  ) : (
    <form action={signClinicalNote}><input name="clinical_note_id" type="hidden" value={noteId} /><button className="secondary-button" type="submit">Sign Note</button></form>
  );
}

export function ConsentSignForm({ consentId, defaultName }: { consentId: string; defaultName: string }) {
  return (
    <ActionForm action={signConsentRecord} submitLabel="Sign Simulated Consent" successMessage="Consent signed">
      <input name="consent_record_id" type="hidden" value={consentId} />
      <label><span>Signed By</span><input name="signed_by_name" defaultValue={defaultName} required /></label>
      <label><span>Signature Reference</span><input name="signature_reference" defaultValue="simulated-development-signature" /></label>
    </ActionForm>
  );
}

export function FollowupCompleteForm({ followupId }: { followupId: string }) {
  return (
    <ActionForm action={completeTreatmentFollowup} submitLabel="Complete Follow-Up" successMessage="Follow-up completed">
      <input name="followup_id" type="hidden" value={followupId} />
      <label><span>Notes</span><textarea name="notes" rows={2} /></label>
    </ActionForm>
  );
}

export function EntitlementAdjustmentForm({ entitlementId }: { entitlementId: string }) {
  return (
    <details>
      <summary className="summary-action">Adjust Entitlement</summary>
      <ActionForm action={adjustEntitlement} submitLabel="Record Adjustment" successMessage="Entitlement adjusted">
        <input name="entitlement_id" type="hidden" value={entitlementId} />
        <label><span>Quantity</span><input name="quantity" defaultValue="1" required type="number" /></label>
        <label><span>Reason</span><textarea name="reason" required rows={2} /></label>
      </ActionForm>
    </details>
  );
}

export function ClinicalPhotoMetadataForm({ contactId, locationId, sessionId, services }: { contactId: string; locationId?: string | null; sessionId?: string | null; services: Option[] }) {
  return (
    <ActionForm action={addClinicalPhotoMetadata} submitLabel="Add Photo Metadata" successMessage="Photo metadata added">
      <input name="contact_id" type="hidden" value={contactId} />
      <input name="location_id" type="hidden" value={locationId ?? ""} />
      <input name="treatment_session_id" type="hidden" value={sessionId ?? ""} />
      <div className="form-grid two">
        <label><span>Type</span><select name="photo_type"><option value="before">Before</option><option value="after">After</option><option value="progress">Progress</option><option value="treatment">Treatment</option><option value="other">Other</option></select></label>
        <label><span>Service</span><select name="service_id"><option value="">No service</option>{services.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span>Body Area</span><input name="body_area" /></label>
        <label><span>Capture Date</span><input name="capture_date" defaultValue={new Date().toISOString().slice(0, 10)} required type="date" /></label>
      </div>
      <label><span>Private Storage Path</span><input name="storage_path" placeholder="avora/demo/example.jpg" required /></label>
      <label><span>Notes</span><textarea name="notes" rows={2} /></label>
    </ActionForm>
  );
}

export function ClinicalDocumentMetadataForm({ contactId, locationId, sessionId, planId }: { contactId: string; locationId?: string | null; sessionId?: string | null; planId?: string | null }) {
  return (
    <ActionForm action={addClinicalDocumentMetadata} submitLabel="Add Document Metadata" successMessage="Document metadata added">
      <input name="contact_id" type="hidden" value={contactId} />
      <input name="location_id" type="hidden" value={locationId ?? ""} />
      <input name="treatment_session_id" type="hidden" value={sessionId ?? ""} />
      <input name="treatment_plan_id" type="hidden" value={planId ?? ""} />
      <div className="form-grid two">
        <label><span>Type</span><select name="document_type"><option value="consent">Consent</option><option value="external_record">External Record</option><option value="lab">Lab</option><option value="treatment_document">Treatment Document</option><option value="referral">Referral</option><option value="other">Other</option></select></label>
        <label><span>Filename</span><input name="filename" required /></label>
      </div>
      <label><span>Private Storage Path</span><input name="storage_path" required /></label>
      <label><span>Description</span><textarea name="description" rows={2} /></label>
    </ActionForm>
  );
}

export function ClinicalServiceSettingForm({
  setting,
  services
}: {
  setting?: {
    id?: string;
    service_id?: string | null;
    requires_clinical_session?: boolean | null;
    requires_consent?: boolean | null;
    requires_photo_tracking?: boolean | null;
    requires_provider?: boolean | null;
    allow_package_entitlement?: boolean | null;
    default_followup_days?: number | null;
    entitlement_policy?: string | null;
    warning_only_missing_consent?: boolean | null;
    active?: boolean | null;
  };
  services: Option[];
}) {
  return (
    <ActionForm action={saveClinicalServiceSetting} submitLabel="Save Service Setting" successMessage="Clinical service setting saved">
      <input name="id" type="hidden" value={setting?.id ?? ""} />
      <div className="form-grid two">
        <label><span>Service</span><select name="service_id" required defaultValue={setting?.service_id ?? ""}>{services.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span>Entitlement Policy</span><select name="entitlement_policy" defaultValue={setting?.entitlement_policy ?? "after_successful_payment"}><option value="sale_created">Sale Created</option><option value="after_deposit">After Deposit</option><option value="after_successful_payment">After Successful Payment</option><option value="sale_paid">Sale Paid</option><option value="manual_activation">Manual Activation</option></select></label>
        <label><span>Default Follow-Up Days</span><input name="default_followup_days" min="0" type="number" defaultValue={setting?.default_followup_days ?? 7} /></label>
      </div>
      <div className="checkbox-grid">
        <label className="checkbox-row"><input name="requires_clinical_session" type="checkbox" defaultChecked={setting?.requires_clinical_session ?? true} /> Requires clinical session</label>
        <label className="checkbox-row"><input name="requires_consent" type="checkbox" defaultChecked={setting?.requires_consent ?? false} /> Requires consent</label>
        <label className="checkbox-row"><input name="requires_photo_tracking" type="checkbox" defaultChecked={setting?.requires_photo_tracking ?? false} /> Requires photo tracking</label>
        <label className="checkbox-row"><input name="requires_provider" type="checkbox" defaultChecked={setting?.requires_provider ?? true} /> Requires provider</label>
        <label className="checkbox-row"><input name="allow_package_entitlement" type="checkbox" defaultChecked={setting?.allow_package_entitlement ?? true} /> Allow package entitlements</label>
        <label className="checkbox-row"><input name="warning_only_missing_consent" type="checkbox" defaultChecked={setting?.warning_only_missing_consent ?? true} /> Missing consent is warning only</label>
        <label className="checkbox-row"><input name="active" type="checkbox" defaultChecked={setting?.active ?? true} /> Active</label>
      </div>
    </ActionForm>
  );
}

export function ClinicalTemplateForm({
  template,
  services
}: {
  template?: { id?: string; service_id?: string | null; name?: string | null; template_type?: string | null; schema_json?: unknown; active?: boolean | null };
  services: Option[];
}) {
  return (
    <ActionForm action={saveClinicalTemplate} submitLabel="Save Clinical Template" successMessage="Clinical template saved">
      <input name="id" type="hidden" value={template?.id ?? ""} />
      <div className="form-grid two">
        <label><span>Name</span><input name="name" required defaultValue={template?.name ?? ""} /></label>
        <label><span>Service</span><select name="service_id" defaultValue={template?.service_id ?? ""}><option value="">All services</option>{services.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span>Type</span><select name="template_type" defaultValue={template?.template_type ?? "treatment_documentation"}><option value="treatment_documentation">Treatment Documentation</option><option value="followup">Follow-Up</option><option value="photo_protocol">Photo Protocol</option></select></label>
      </div>
      <label><span>Template JSON</span><textarea name="schema_json" required rows={6} defaultValue={JSON.stringify(template?.schema_json ?? { fields: [] }, null, 2)} /></label>
      <label className="checkbox-row"><input name="active" type="checkbox" defaultChecked={template?.active ?? true} /> Active</label>
    </ActionForm>
  );
}

export function ConsentTemplateForm({
  template,
  services
}: {
  template?: { id?: string; service_id?: string | null; name?: string | null; version?: number | null; content_reference?: string | null; content_text?: string | null; consent_type?: string | null; active?: boolean | null };
  services: Option[];
}) {
  return (
    <ActionForm action={saveConsentTemplate} submitLabel="Save Consent Template" successMessage="Consent template saved">
      <input name="id" type="hidden" value={template?.id ?? ""} />
      <div className="form-grid two">
        <label><span>Name</span><input name="name" required defaultValue={template?.name ?? ""} /></label>
        <label><span>Service</span><select name="service_id" defaultValue={template?.service_id ?? ""}><option value="">All services</option>{services.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span>Version</span><input name="version" min="1" type="number" defaultValue={template?.version ?? 1} /></label>
        <label><span>Type</span><select name="consent_type" defaultValue={template?.consent_type ?? "treatment"}><option value="treatment">Treatment</option><option value="clinical_photo">Clinical Photo</option><option value="marketing_photo">Marketing Photo</option><option value="other">Other</option></select></label>
      </div>
      <label><span>Content Reference</span><input name="content_reference" defaultValue={template?.content_reference ?? ""} /></label>
      <label><span>Consent Text</span><textarea name="content_text" rows={6} defaultValue={template?.content_text ?? ""} /></label>
      <label className="checkbox-row"><input name="active" type="checkbox" defaultChecked={template?.active ?? true} /> Active</label>
    </ActionForm>
  );
}
