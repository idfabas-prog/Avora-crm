import { ConsentSignatureForm } from "@/components/portal/PortalForms";
import { formatDate, fromDbStatus } from "@/lib/crm/constants";
import { requireCurrentPatient } from "@/lib/portal/patient";
import { getPortalDashboardData } from "@/lib/portal/queries";

function template(value: { name?: string; content_text?: string } | { name?: string; content_text?: string }[] | null) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PortalConsentsPage() {
  const patient = await requireCurrentPatient();
  const data = await getPortalDashboardData(patient);

  return (
    <div className="portal-stack">
      <section className="portal-page-title"><p className="eyebrow">Consents</p><h1>Review and sign</h1></section>
      <section className="portal-panel">
        <div className="record-list">{data.consentRecords.map((consent) => {
          const consentTemplate = template(consent.consent_templates);
          const pending = consent.status === "pending" || consent.status === "required";
          return (
            <article key={consent.id}>
              <strong>{consentTemplate?.name ?? "Consent"}</strong>
              <p>{consentTemplate?.content_text ?? "Review this fictional development consent before signing."}</p>
              <span>{fromDbStatus(consent.status)}{consent.signed_at ? ` · Signed ${formatDate(consent.signed_at)}` : ""}</span>
              {pending ? <ConsentSignatureForm consentId={consent.id} defaultName={patient.fullName} /> : null}
            </article>
          );
        })}</div>
      </section>
    </div>
  );
}
