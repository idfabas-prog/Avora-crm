import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { assertAiPermission } from "@/lib/ai/permissions";
import { formatDateTime } from "@/lib/crm/constants";
import { formatMoney } from "@/lib/financial/money";

type LeadRow = {
  id: string;
  score: number;
  label: string;
  factors_json: Array<{ label: string; points: number }> | null;
  calculated_at: string | null;
  contacts: { id: string; first_name: string | null; last_name: string | null; last_activity_at: string | null } | { id: string; first_name: string | null; last_name: string | null; last_activity_at: string | null }[] | null;
  opportunities: { id: string; name: string | null; value_cents: number | null } | { id: string; name: string | null; value_cents: number | null }[] | null;
  locations: { name: string | null } | { name: string | null }[] | null;
};

function firstRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function leadLabel(label: string) {
  if (label === "hot") return "Hot";
  if (label === "warm") return "Warm";
  if (label === "nurture") return "Nurture";
  return "Low Priority";
}

export default async function FollowUpPage() {
  const profile = await requireCurrentProfile();
  assertAiPermission(profile, "ai.lead_scoring");
  const supabase = await createClient();
  const selectedLocationId = await getSelectedLocationId(profile);
  const locationIds = allowedLocationIds(profile, selectedLocationId);
  let query = supabase
    .from("lead_scores")
    .select("id, score, label, factors_json, calculated_at, contacts(id, first_name, last_name, last_activity_at), opportunities(id, name, value_cents), locations(name)")
    .eq("organization_id", profile.organizationId)
    .order("score", { ascending: false })
    .limit(50);
  if (locationIds.length) query = query.in("location_id", locationIds);
  const { data } = await query;
  const rows = (data ?? []) as unknown as LeadRow[];

  return (
    <div className="page-stack">
      <PageHeader description="AI-assisted priority queue. Recommendations are grounded in CRM state and do not auto-message leads." title="Follow-Up Priority" />
      <section className="follow-up-grid">
        {rows.map((row) => {
          const contact = firstRelation(row.contacts);
          const opportunity = firstRelation(row.opportunities);
          const location = firstRelation(row.locations);
          const rankedFactors = [...(row.factors_json ?? [])].sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
          const reason = rankedFactors[0]?.label ?? "Review CRM activity";
          return (
            <article className="follow-up-card" key={row.id}>
              <div className="follow-up-card-header">
                <div>
                  <span>{location?.name ?? "Unassigned"}</span>
                  <strong>{contact ? <Link href={`/contacts/${contact.id}`}>{contact.first_name} {contact.last_name}</Link> : "Unknown Contact"}</strong>
                </div>
                <div className="score-pill"><strong>{row.score}</strong><span>{leadLabel(row.label)}</span></div>
              </div>
              <dl>
                <div><dt>Opportunity</dt><dd>{opportunity?.name ?? "No opportunity"}</dd></div>
                <div><dt>Value</dt><dd>{formatMoney(opportunity?.value_cents ?? 0)}</dd></div>
                <div><dt>Last Activity</dt><dd>{formatDateTime(contact?.last_activity_at)}</dd></div>
                <div><dt>Recommended Action</dt><dd>{reason}</dd></div>
              </dl>
              <details>
                <summary>Why this priority?</summary>
                <ul>{rankedFactors.map((factor) => <li key={`${factor.label}-${factor.points}`}>{factor.label} <span>{factor.points > 0 ? "+" : ""}{factor.points}</span></li>)}</ul>
              </details>
            </article>
          );
        })}
        {!rows.length ? <section className="panel"><strong>No high-priority follow-ups are currently identified.</strong><p className="quiet-text">Recalculate lead scores from contact profiles after new activity.</p></section> : null}
      </section>
    </div>
  );
}
