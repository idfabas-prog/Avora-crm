import { notFound } from "next/navigation";
import { ClinicalDocumentMetadataForm, ClinicalNoteActions, ClinicalNoteForm, ClinicalPhotoMetadataForm, ConsentSignForm, FollowupCompleteForm, TreatmentSessionStatusForms } from "@/components/crm/ClinicalForms";
import { TreatmentInventoryUsageForm } from "@/components/crm/InventoryForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { clinicalLocationAllowed, hasClinicalPermission } from "@/lib/clinical/permissions";
import { formatDate, formatDateTime, fromDbStatus } from "@/lib/crm/constants";
import { formatMoney } from "@/lib/financial/money";
import { hasInventoryPermission } from "@/lib/inventory/permissions";
import { createClient } from "@/lib/supabase/server";

function relation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ClinicalSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireCurrentProfile();
  if (!hasClinicalPermission(profile, "clinical.sessions.read")) notFound();

  const supabase = await createClient();
  const { data: session, error } = await supabase
    .from("treatment_sessions")
    .select("id, organization_id, location_id, contact_id, treatment_plan_id, package_entitlement_id, service_id, provider_id, status, documentation_status, scheduled_at, started_at, completed_at, session_number, treatment_area, documentation_json, clinical_summary, aftercare_plan, followup_plan, contacts(first_name, last_name, email, phone), services(name, category), locations(name), provider:user_profiles!treatment_sessions_provider_id_fkey(full_name), package_entitlements(total_quantity, used_quantity, remaining_quantity, status), treatment_plans(name, status)")
    .eq("id", id)
    .eq("organization_id", profile.organizationId)
    .single();

  if (error || !session || !clinicalLocationAllowed(profile, session.location_id)) notFound();

  const [
    { data: notes },
    { data: addenda },
    { data: consents },
    { data: photos },
    { data: documents },
    { data: followups },
    { data: services },
    { data: inventoryLots },
    { data: inventoryUsage }
  ] = await Promise.all([
    supabase.from("clinical_notes").select("id, note_type, body, locked_at, signed_at, created_at, author:user_profiles!clinical_notes_author_user_id_fkey(full_name)").eq("treatment_session_id", id).eq("organization_id", profile.organizationId).order("created_at", { ascending: false }),
    supabase.from("clinical_note_addenda").select("id, clinical_note_id, addendum_text, created_at, author:user_profiles!clinical_note_addenda_author_user_id_fkey(full_name)").eq("organization_id", profile.organizationId).order("created_at", { ascending: false }),
    supabase.from("consent_records").select("id, status, signed_by_name, signed_at, consent_templates(name, version, consent_type)").eq("treatment_session_id", id).eq("organization_id", profile.organizationId),
    supabase.from("clinical_photos").select("id, photo_type, body_area, capture_date, storage_path, notes").eq("treatment_session_id", id).eq("organization_id", profile.organizationId).order("capture_date", { ascending: false }),
    supabase.from("clinical_documents").select("id, document_type, filename, storage_path, uploaded_at, description, status").eq("treatment_session_id", id).eq("organization_id", profile.organizationId).order("uploaded_at", { ascending: false }),
    supabase.from("treatment_followups").select("id, status, due_at, followup_type, notes, completed_at").eq("treatment_session_id", id).eq("organization_id", profile.organizationId).order("due_at", { ascending: true }),
    supabase.from("services").select("id, name").eq("organization_id", profile.organizationId).eq("active", true).order("name"),
    hasInventoryPermission(profile, "inventory.read")
      ? supabase.from("inventory_lots").select("id, lot_number, expiration_date, quantity_available, cost_per_unit_cents, inventory_items(name, unit_of_measure), locations(name)").eq("organization_id", profile.organizationId).eq("location_id", session.location_id).eq("status", "active").gt("quantity_available", 0).order("expiration_date", { ascending: true })
      : Promise.resolve({ data: [] }),
    hasInventoryPermission(profile, "inventory.read")
      ? supabase.from("treatment_inventory_usage").select("id, quantity_used, unit_cost_cents, total_cost_cents, created_at, inventory_items(name, unit_of_measure), inventory_lots(lot_number), recorder:user_profiles!treatment_inventory_usage_recorded_by_fkey(full_name)").eq("treatment_session_id", id).eq("organization_id", profile.organizationId).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] })
  ]);

  const contact = relation(session.contacts);
  const service = relation(session.services);
  const location = relation(session.locations);
  const provider = relation(session.provider);
  const entitlement = relation(session.package_entitlements);
  const plan = relation(session.treatment_plans);
  const serviceOptions = (services ?? []).map((item) => ({ id: item.id, name: item.name }));
  const inventoryLotOptions = (inventoryLots ?? []).map((lot) => {
    const lotItem = relation(lot.inventory_items);
    const lotLocation = relation(lot.locations);
    return { id: lot.id, name: `${lotItem?.name ?? "Item"} ${lot.lot_number ? `#${lot.lot_number}` : ""} - ${lotLocation?.name ?? "Location"} (${lot.quantity_available} ${lotItem?.unit_of_measure ?? "unit"})` };
  });
  const directTreatmentCostCents = (inventoryUsage ?? []).reduce((sum, item) => sum + Number(item.total_cost_cents ?? 0), 0);

  return (
    <div className="page-stack">
      <PageHeader
        description={`${service?.name ?? "Treatment"} for ${contact?.first_name ?? ""} ${contact?.last_name ?? ""}`}
        title="Treatment Session"
      />
      <section className="profile-hero">
        <div>
          <StatusBadge status={fromDbStatus(session.status)} />
          <h2>{contact?.first_name} {contact?.last_name}</h2>
          <p>{location?.name ?? "Unassigned"} · {formatDateTime(session.scheduled_at)}</p>
        </div>
        <dl>
          <div><dt>Provider</dt><dd>{provider?.full_name ?? "Unassigned"}</dd></div>
          <div><dt>Session</dt><dd>{session.session_number ?? "-"}</dd></div>
          <div><dt>Documentation</dt><dd>{fromDbStatus(session.documentation_status)}</dd></div>
          <div><dt>Plan</dt><dd>{plan?.name ?? "No plan"}</dd></div>
        </dl>
      </section>
      {hasClinicalPermission(profile, "clinical.sessions.write") ? <section className="panel"><TreatmentSessionStatusForms sessionId={session.id} /></section> : null}
      <section className="session-detail-grid">
        <section className="panel">
          <div className="panel-header"><h2>Documentation</h2><span>Provider-entered treatment record</span></div>
          <dl className="settings-list">
            <div><dt>Treatment Area</dt><dd>{session.treatment_area ?? "Not documented"}</dd></div>
            <div><dt>Started</dt><dd>{formatDateTime(session.started_at)}</dd></div>
            <div><dt>Completed</dt><dd>{formatDateTime(session.completed_at)}</dd></div>
            <div><dt>Summary</dt><dd>{session.clinical_summary ?? "Not documented"}</dd></div>
            <div><dt>Aftercare</dt><dd>{session.aftercare_plan ?? "Not documented"}</dd></div>
            <div><dt>Follow-Up Plan</dt><dd>{session.followup_plan ?? "Not documented"}</dd></div>
          </dl>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Entitlement</h2><span>Package utilization</span></div>
          {entitlement ? (
            <dl className="settings-list">
              <div><dt>Status</dt><dd>{fromDbStatus(entitlement.status)}</dd></div>
              <div><dt>Total</dt><dd>{entitlement.total_quantity}</dd></div>
              <div><dt>Used</dt><dd>{entitlement.used_quantity}</dd></div>
              <div><dt>Remaining</dt><dd>{entitlement.remaining_quantity}</dd></div>
            </dl>
          ) : <p className="quiet-text">No package entitlement linked to this session.</p>}
        </section>
        {hasInventoryPermission(profile, "inventory.read") ? (
          <section className="panel">
            <div className="panel-header"><h2>Inventory Used</h2><span>Internal direct treatment cost {formatMoney(directTreatmentCostCents)}</span></div>
            {hasInventoryPermission(profile, "inventory.write") ? <TreatmentInventoryUsageForm lots={inventoryLotOptions} sessionId={session.id} /> : null}
            <div className="record-list">
              {(inventoryUsage ?? []).map((usage) => {
                const item = relation(usage.inventory_items);
                const lot = relation(usage.inventory_lots);
                const recorder = relation(usage.recorder);
                return <article key={usage.id}><strong>{item?.name ?? "Item"} - {formatMoney(usage.total_cost_cents)}</strong><p>{usage.quantity_used} {item?.unit_of_measure ?? "unit"} from lot {lot?.lot_number ?? "No lot"}</p><span>{formatMoney(usage.unit_cost_cents)} each - recorded by {recorder?.full_name ?? "Unknown"} on {formatDateTime(usage.created_at)}</span></article>;
              })}
            </div>
          </section>
        ) : null}
        <section className="panel">
          <div className="panel-header"><h2>Clinical Notes</h2><span>Signed notes lock and require addenda</span></div>
          {hasClinicalPermission(profile, "clinical.notes.write") ? <ClinicalNoteForm contactId={session.contact_id} locationId={session.location_id} sessionId={session.id} planId={session.treatment_plan_id} /> : null}
          <div className="record-list">
            {(notes ?? []).map((note) => {
              const author = relation(note.author);
              const noteAddenda = (addenda ?? []).filter((item) => item.clinical_note_id === note.id);
              return (
                <article key={note.id}>
                  <strong>{fromDbStatus(note.note_type)} · {author?.full_name ?? "Unknown"}</strong>
                  <p>{note.body}</p>
                  <span>{formatDateTime(note.created_at)} · {note.locked_at ? `Signed ${formatDateTime(note.signed_at)}` : "Draft"}</span>
                  {hasClinicalPermission(profile, "clinical.notes.sign") || hasClinicalPermission(profile, "clinical.notes.write") ? <ClinicalNoteActions locked={Boolean(note.locked_at)} noteId={note.id} /> : null}
                  {noteAddenda.map((addendum) => <p key={addendum.id} className="quiet-text">Addendum {formatDateTime(addendum.created_at)}: {addendum.addendum_text}</p>)}
                </article>
              );
            })}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Consents</h2><span>Simulated signatures for development</span></div>
          <div className="record-list">
            {(consents ?? []).map((consent) => {
              const template = relation(consent.consent_templates);
              return (
                <article key={consent.id}>
                  <strong>{template?.name ?? "Consent"}</strong>
                  <p>{fromDbStatus(consent.status)} · version {template?.version ?? 1}</p>
                  <span>{consent.signed_at ? `Signed by ${consent.signed_by_name} on ${formatDate(consent.signed_at)}` : "Pending signature"}</span>
                  {consent.status !== "signed" && hasClinicalPermission(profile, "clinical.consents.manage") ? <ConsentSignForm consentId={consent.id} defaultName={`${contact?.first_name ?? "Demo"} ${contact?.last_name ?? "Contact"}`} /> : null}
                </article>
              );
            })}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Photos</h2><span>Private bucket metadata</span></div>
          {hasClinicalPermission(profile, "clinical.photos.write") ? <ClinicalPhotoMetadataForm contactId={session.contact_id} locationId={session.location_id} sessionId={session.id} services={serviceOptions} /> : null}
          <div className="record-list">{(photos ?? []).map((photo) => <article key={photo.id}><strong>{fromDbStatus(photo.photo_type)} · {photo.body_area ?? "Area not set"}</strong><p>{photo.storage_path}</p><span>{formatDate(photo.capture_date)} · {photo.notes ?? "No notes"}</span></article>)}</div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Documents</h2><span>Private bucket metadata</span></div>
          {hasClinicalPermission(profile, "clinical.documents.write") ? <ClinicalDocumentMetadataForm contactId={session.contact_id} locationId={session.location_id} sessionId={session.id} planId={session.treatment_plan_id} /> : null}
          <div className="record-list">{(documents ?? []).map((document) => <article key={document.id}><strong>{document.filename}</strong><p>{document.storage_path}</p><span>{fromDbStatus(document.document_type)} · {fromDbStatus(document.status)}</span></article>)}</div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Follow-Ups</h2><span>Aftercare queue</span></div>
          <div className="record-list">{(followups ?? []).map((followup) => <article key={followup.id}><strong>{fromDbStatus(followup.followup_type)}</strong><p>Due {formatDateTime(followup.due_at)} · {fromDbStatus(followup.status)}</p>{followup.status !== "completed" && hasClinicalPermission(profile, "clinical.sessions.write") ? <FollowupCompleteForm followupId={followup.id} /> : null}</article>)}</div>
        </section>
      </section>
    </div>
  );
}
