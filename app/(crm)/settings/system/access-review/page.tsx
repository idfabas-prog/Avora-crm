import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { accessReviewRisk, assertSystemAccess } from "@/lib/system/audits";

type AccessReviewUser = {
  id: string;
  full_name: string;
  email: string;
  title: string | null;
  roles: { name: string } | { name: string }[] | null;
};

export default async function AccessReviewPage() {
  const profile = await requireCurrentProfile();
  assertSystemAccess(profile);
  const supabase = await createClient();
  const { data: users } = await supabase
    .from("user_profiles")
    .select("id, full_name, email, title, roles(name), user_locations(locations(name))")
    .eq("organization_id", profile.organizationId)
    .order("full_name");

  return (
    <div className="page-stack">
      <PageHeader description="Owner review of users, roles, locations, and high-risk permissions. No automatic revocation occurs." title="Access Review" />
      <section className="settings-grid">
        {((users ?? []) as unknown as AccessReviewUser[]).map((user) => {
          const role = Array.isArray(user.roles) ? user.roles[0]?.name : user.roles?.name;
          const risk = accessReviewRisk(role === "owner" ? ["system.manage", "system.features.manage"] : [], null);
          return (
            <article className="settings-card" key={user.id}>
              <div><h2>{user.full_name}</h2><StatusBadge status={risk.status} /></div>
              <dl>
                <div><dt>Email</dt><dd>{user.email}</dd></div>
                <div><dt>Title</dt><dd>{user.title ?? "Not set"}</dd></div>
                <div><dt>Role</dt><dd>{role ?? "member"}</dd></div>
                <div><dt>High-Risk Permissions</dt><dd>{risk.highRiskPermissions.join(", ") || "None inferred"}</dd></div>
              </dl>
            </article>
          );
        })}
      </section>
    </div>
  );
}
