import { formatDate, fromDbStatus } from "@/lib/crm/constants";
import { APP_DISPLAY_NAME } from "@/lib/config/branding";
import { requireCurrentPatient } from "@/lib/portal/patient";
import { getPortalDashboardData } from "@/lib/portal/queries";

export default async function PortalDocumentsPage() {
  const patient = await requireCurrentPatient();
  const data = await getPortalDashboardData(patient);

  return (
    <div className="portal-stack">
      <section className="portal-page-title"><p className="eyebrow">Documents</p><h1>Shared files</h1><p>Only documents explicitly marked patient-visible are shown here.</p></section>
      <section className="portal-panel">
        <div className="record-list">{data.documents.map((document) => <article key={document.id}><strong>{document.filename}</strong><p>{document.portal_description ?? document.description ?? `Shared ${APP_DISPLAY_NAME} document.`}</p><span>{fromDbStatus(document.document_type)} · {formatDate(document.uploaded_at)}</span><a className="strong-link" href={`/api/portal/documents/${document.id}`}>Open secure link</a></article>)}</div>
      </section>
    </div>
  );
}
