import { ReferralProgramForm } from "@/components/crm/ReputationForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { hasReputationPermission } from "@/lib/reputation/permissions";
import { createClient } from "@/lib/supabase/server";

export default async function ReferralSettingsPage() {
  const profile = await requireCurrentProfile();
  if (!hasReputationPermission(profile, "referrals.manage")) return <div className="page-stack"><PageHeader title="Referral Settings" description="Access denied." /></div>;
  const supabase = await createClient();
  const { data: programs } = await supabase.from("referral_programs").select("id, name, description, reward_type, reward_value, active, start_date, end_date").eq("organization_id", profile.organizationId).order("name");

  return (
    <div className="page-stack">
      <PageHeader description="Referral rewards are ledgered and require staff approval. Cash issuance is not automated." title="Referral Settings" />
      <details className="panel"><summary className="summary-action">Create Referral Program</summary><ReferralProgramForm /></details>
      <section className="panel">
        <div className="panel-header"><h2>Programs</h2><span>Credit and non-cash reward foundation</span></div>
        <div className="record-list">{(programs ?? []).map((program) => <article key={program.id}><strong>{program.name}</strong><p>{program.reward_type} · {program.reward_value} · {program.active ? "Active" : "Inactive"}</p><span>{program.description ?? "No description"}</span></article>)}</div>
      </section>
    </div>
  );
}
