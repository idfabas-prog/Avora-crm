import { PTORequestForm, PTOReviewForm } from "@/components/crm/WorkforceForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { formatDate, fromDbStatus } from "@/lib/crm/constants";
import { createClient } from "@/lib/supabase/server";
import { hasWorkforcePermission } from "@/lib/workforce/permissions";

type Relation<T> = T | T[] | null;

function first<T>(value: Relation<T> | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function hours(minutes: number | null | undefined) {
  return `${(Number(minutes ?? 0) / 60).toFixed(1)}h`;
}

export default async function StaffTimeOffPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();

  if (!hasWorkforcePermission(profile, "workforce.pto.read")) {
    return <div className="page-stack"><PageHeader description="Your current role does not include PTO access." title="Time Off" /></div>;
  }

  const requestsQuery = supabase.from("pto_requests").select("id, user_id, start_date, end_date, requested_minutes, status, reason, users:user_profiles!pto_requests_user_id_fkey(full_name), pto_policies(name)").eq("organization_id", profile.organizationId).order("created_at", { ascending: false }).limit(100);
  if (!hasWorkforcePermission(profile, "workforce.pto.manage")) requestsQuery.eq("user_id", profile.id);
  const [{ data: policies }, { data: balances }, { data: requests }] = await Promise.all([
    supabase.from("pto_policies").select("id, name").eq("organization_id", profile.organizationId).eq("active", true).order("name"),
    supabase.from("pto_balances").select("id, available_minutes, used_minutes, pending_minutes, users:user_profiles!pto_balances_user_id_fkey(full_name), pto_policies(name)").eq("organization_id", profile.organizationId),
    requestsQuery
  ]);

  return (
    <div className="page-stack">
      <PageHeader description="PTO policies, balances, and manager review queue." title="Time Off" />
      <section className="metric-grid">
        <StatCard detail="Loaded policies" label="PTO Policies" value={String(policies?.length ?? 0)} />
        <StatCard detail="Awaiting review" label="Pending Requests" value={String(requests?.filter((request) => request.status === "pending").length ?? 0)} />
        <StatCard detail="Approved requests" label="Approved" value={String(requests?.filter((request) => request.status === "approved").length ?? 0)} />
        <StatCard detail="Balance rows" label="Balances" value={String(balances?.length ?? 0)} />
      </section>
      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Balances</h2><span>Ledger-derived minutes</span></div>
          <div className="record-list">
            {(balances ?? []).map((balance) => {
              const user = first(balance.users);
              const policy = first(balance.pto_policies);
              return <article key={balance.id}><strong>{user?.full_name ?? "Team member"} - {policy?.name ?? "Policy"}</strong><p>Available {hours(balance.available_minutes)} - used {hours(balance.used_minutes)} - pending {hours(balance.pending_minutes)}</p></article>;
            })}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Requests</h2><span>Fictional development requests</span></div>
          <div className="record-list">
            {(requests ?? []).map((request) => {
              const user = first(request.users);
              const policy = first(request.pto_policies);
              return <article key={request.id}><strong>{user?.full_name ?? "Team member"} - <StatusBadge status={fromDbStatus(request.status)} /></strong><p>{policy?.name ?? "PTO"} - {formatDate(request.start_date)} to {formatDate(request.end_date)} - {hours(request.requested_minutes)}</p>{hasWorkforcePermission(profile, "workforce.pto.manage") ? <PTOReviewForm requestId={request.id} status={request.status} /> : null}</article>;
            })}
          </div>
        </section>
        {hasWorkforcePermission(profile, "workforce.pto.request") ? <section className="panel"><div className="panel-header"><h2>Request PTO</h2><span>Employee self-service</span></div><PTORequestForm policies={(policies ?? []).map((policy) => ({ id: policy.id, name: policy.name }))} /></section> : null}
      </section>
    </div>
  );
}
