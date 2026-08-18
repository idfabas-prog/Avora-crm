import Link from "next/link";
import { GhlExceptionActionForm } from "@/components/crm/GoHighLevelForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { formatDateTime } from "@/lib/crm/constants";
import { getGhlReconciliationReport } from "@/lib/integrations/gohighlevel/reports";
import { createClient } from "@/lib/supabase/server";

export default async function GoHighLevelExceptionsPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const report = await getGhlReconciliationReport(supabase, profile);

  return (
    <div className="page-stack">
      <PageHeader action={<Link className="secondary-button" href="/integrations/gohighlevel/reconciliation">Reconciliation</Link>} description="Resolve, review, or ignore GHL sync exceptions without deleting imported data." title="GHL Exceptions" />
      <section className="panel wide-panel">
        <div className="record-list">
          {report.exceptions.map((exception) => (
            <article key={exception.id}>
              <strong>{exception.exception_type}</strong>
              <p>{exception.summary}</p>
              <span>{exception.ghl_connections?.display_name ?? "Connection"} · {formatDateTime(exception.created_at)} · <StatusBadge status={exception.status} /></span>
              <GhlExceptionActionForm exceptionId={exception.id} />
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
