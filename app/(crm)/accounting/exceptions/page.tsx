import { ResolveAccountingExceptionForm } from "@/components/crm/AccountingForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { fromDbStatus, formatDate } from "@/lib/crm/constants";
import { hasAccountingPermission } from "@/lib/accounting/permissions";
import { getAccountingExceptions } from "@/lib/accounting/reports";
import { createClient } from "@/lib/supabase/server";

export default async function AccountingExceptionsPage() {
  const profile = await requireCurrentProfile();
  if (!hasAccountingPermission(profile, "accounting.exceptions.read")) {
    return <div className="page-stack"><PageHeader title="Accounting Exceptions" description="Your role does not include accounting exception access." /></div>;
  }
  const supabase = await createClient();
  const selectedLocationId = await getSelectedLocationId(profile);
  const exceptions = await getAccountingExceptions(supabase, profile, allowedLocationIds(profile, selectedLocationId));

  return (
    <div className="page-stack">
      <PageHeader description="Missing mappings, reconciliation gaps, and post-close review flags." title="Accounting Exceptions" />
      <section className="panel wide-panel">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Type</th><th>Severity</th><th>Status</th><th>Location</th><th>Message</th><th>Created</th><th>Action</th></tr></thead>
            <tbody>
              {exceptions.map((exception) => (
                <tr key={exception.id}>
                  <td>{fromDbStatus(exception.exception_type)}</td>
                  <td>{exception.severity}</td>
                  <td><StatusBadge status={fromDbStatus(exception.status)} /></td>
                  <td>{exception.locationName}</td>
                  <td>{exception.message}</td>
                  <td>{formatDate(exception.created_at)}</td>
                  <td>{exception.status !== "resolved" && hasAccountingPermission(profile, "accounting.exceptions.manage") ? <ResolveAccountingExceptionForm exceptionId={exception.id} /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
