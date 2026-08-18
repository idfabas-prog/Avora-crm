import Link from "next/link";
import { formatMoney } from "@/lib/financial/money";
import { requireCurrentPatient } from "@/lib/portal/patient";
import { createClient } from "@/lib/supabase/server";
import { APP_DISPLAY_NAME } from "@/lib/config/branding";

export default async function PortalReferralsPage() {
  const patient = await requireCurrentPatient();
  const supabase = await createClient();
  const [{ data: codes }, { data: rewards }, { data: credits }] = await Promise.all([
    supabase.from("referral_codes").select("id, code, active, referral_programs(name, reward_type, reward_value)").eq("organization_id", patient.organizationId).eq("contact_id", patient.contactId),
    supabase.from("referral_reward_events").select("id, event_type, reward_type, amount_cents, reason, created_at").eq("organization_id", patient.organizationId).eq("referring_contact_id", patient.contactId).order("created_at", { ascending: false }),
    supabase.from("patient_credit_events").select("id, event_type, amount_cents, reason, created_at").eq("organization_id", patient.organizationId).eq("contact_id", patient.contactId).order("created_at", { ascending: false })
  ]);
  const primaryCode = codes?.[0]?.code;
  const creditBalance = (credits ?? []).reduce((sum, credit) => sum + Number(credit.amount_cents ?? 0), 0);

  return (
    <div className="portal-stack">
      <section className="portal-hero">
        <div>
          <p className="eyebrow">{patient.organizationName}</p>
          <h1>Referrals</h1>
          <p>Share your code with a friend. Demo rewards are tracked as credits only and do not issue cash.</p>
        </div>
        {primaryCode ? <span className="portal-pill">{primaryCode}</span> : null}
      </section>
      <section className="portal-metrics">
        <article><span>Referral Code</span><strong>{primaryCode ?? "Not ready"}</strong><p>{primaryCode ? `/r/${primaryCode}` : `Ask ${APP_DISPLAY_NAME} staff for a code`}</p></article>
        <article><span>Rewards Earned</span><strong>{rewards?.length ?? 0}</strong><p>Ledger events</p></article>
        <article><span>Available Credit</span><strong>{formatMoney(creditBalance)}</strong><p>Development credit ledger</p></article>
      </section>
      <section className="portal-panel">
        <h2>Share Link</h2>
        {primaryCode ? <p className="quiet-text"><Link href={`/r/${primaryCode}`}>{`/r/${primaryCode}`}</Link></p> : <p className="quiet-text">No active referral code is available yet.</p>}
      </section>
      <section className="portal-panel">
        <div className="panel-header"><h2>Reward History</h2><span>Private to your portal account</span></div>
        <div className="record-list">{(rewards ?? []).map((reward) => <article key={reward.id}><strong>{reward.event_type} · {reward.reward_type}</strong><p>{formatMoney(reward.amount_cents)} · {reward.reason}</p></article>)}</div>
      </section>
    </div>
  );
}
