import Link from "next/link";
import { ActionForm } from "@/components/crm/ActionForm";
import { MobilePhotoCaptureField } from "@/components/mobile/MobileCaptureFields";
import { MobileRecordCard } from "@/components/mobile/MobileCards";
import { saveMobileDraft } from "@/app/mobile-actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { formatDateTime, fromDbStatus } from "@/lib/crm/constants";
import { getMobileProviderReport } from "@/lib/mobile/reports";
import { createClient } from "@/lib/supabase/server";

type Relation<T> = T | T[] | null;
function first<T>(value: Relation<T> | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function MobileProviderPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const selectedLocationId = await getSelectedLocationId(profile);
  const report = await getMobileProviderReport(supabase, profile, allowedLocationIds(profile, selectedLocationId));

  return (
    <div className="mobile-page">
      <PageHeader description="Provider workflow for today: patients, consents, inventory, photos, and notes." title="Provider Today" />
      <section className="mobile-step-flow">
        <article><span>1</span><strong>Patient / Service</strong></article>
        <article><span>2</span><strong>Consent</strong></article>
        <article><span>3</span><strong>Treatment</strong></article>
        <article><span>4</span><strong>Inventory</strong></article>
        <article><span>5</span><strong>Photos</strong></article>
        <article><span>6</span><strong>Notes</strong></article>
      </section>
      <section className="mobile-section">
        <div className="mobile-section-header"><h2>Today Patients</h2><Link href="/clinical">Clinical</Link></div>
        {report.appointments.map((appointment) => {
          const contact = first(appointment.contacts);
          const type = first(appointment.appointment_types);
          return <MobileRecordCard detail={`${formatDateTime(appointment.start_at)} - ${type?.name ?? "Appointment"}`} href="/clinical" key={appointment.id} status={fromDbStatus(appointment.status)} title={contact ? `${contact.first_name} ${contact.last_name}` : "Patient"} />;
        })}
      </section>
      <section className="mobile-section">
        <div className="mobile-section-header"><h2>Open Sessions</h2><Link href="/inventory">Inventory</Link></div>
        {report.sessions.map((session) => {
          const contact = first(session.contacts);
          const service = first(session.services);
          return <MobileRecordCard detail={`${service?.name ?? "Treatment"} - ${formatDateTime(session.session_date)}`} href={`/clinical/sessions/${session.id}`} key={session.id} status={fromDbStatus(session.status)} title={contact ? `${contact.first_name} ${contact.last_name}` : "Clinical Session"} />;
        })}
      </section>
      <section className="panel mobile-draft-panel">
        <div className="panel-header"><h2>Note Draft</h2><span>Saved under your account only</span></div>
        <ActionForm action={saveMobileDraft} submitLabel="Save Draft" successMessage="Draft saved">
          <input name="draft_type" type="hidden" value="clinical_note" />
          <input name="route" type="hidden" value="/mobile/provider" />
          <input name="sensitivity" type="hidden" value="clinical" />
          <label><span>Clinical note draft</span><textarea name="note" placeholder="Fictional development notes only" rows={4} /></label>
          <MobilePhotoCaptureField />
        </ActionForm>
      </section>
      <section className="mobile-section">
        <div className="mobile-section-header"><h2>Consent & Inventory Alerts</h2></div>
        {report.consents.map((consent) => {
          const contact = first(consent.contacts);
          const template = first(consent.consent_templates);
          return <MobileRecordCard detail={template?.name ?? "Consent"} href="/portal/consents" key={consent.id} status={fromDbStatus(consent.status)} title={contact ? `${contact.first_name} ${contact.last_name}` : "Pending Consent"} />;
        })}
        {report.inventoryAlerts.map((alert) => <MobileRecordCard detail={alert.message} href="/inventory" key={alert.id} status={fromDbStatus(alert.alert_type)} title="Inventory Alert" />)}
      </section>
    </div>
  );
}
