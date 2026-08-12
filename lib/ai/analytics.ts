import type { CurrentProfile } from "@/lib/auth/profile";
import { getFinancialSummary } from "@/lib/financial/queries";
import { formatMoney } from "@/lib/financial/money";
import { getDateRange, inferPeriod } from "./date-ranges";
import type { AiTrace } from "./types";

type CountResult = PromiseLike<{ count: number | null; error: { message: string } | null }>;
type LooseQuery = PromiseLike<{ data: unknown[] | null; count: number | null; error: { message: string } | null }> & {
  eq: (column: string, value: string) => LooseQuery;
  gt: (column: string, value: string | number) => LooseQuery;
  gte: (column: string, value: string) => LooseQuery;
  lt: (column: string, value: string) => LooseQuery;
  in: (column: string, values: string[]) => LooseQuery;
  order: (column: string, options?: { ascending?: boolean }) => LooseQuery;
  limit: (count: number) => LooseQuery;
};
type LooseSupabase = {
  from: (table: string) => {
    select: (columns: string, options?: { count?: "exact"; head?: boolean }) => LooseQuery;
  };
};

async function count(query: CountResult) {
  const result = await query;
  if (result.error) throw new Error(result.error.message);
  return result.count ?? 0;
}

function firstRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function numberValue(row: unknown, key: string) {
  return Number((row as Record<string, unknown>)[key] ?? 0);
}

function withLocation<T extends { in: (column: string, values: string[]) => T }>(query: T, locationIds: string[]) {
  return locationIds.length ? query.in("location_id", locationIds) : query;
}

export async function getOwnerAnalytics(supabase: unknown, profile: CurrentProfile, locationIds: string[], question: string) {
  const db = supabase as LooseSupabase;
  const period = inferPeriod(question);
  const range = getDateRange(period);
  const previous = period === "this_month" ? getDateRange("last_month") : getDateRange("last_week");
  const [financial, prevFinancial, leads, consults, completed, noShows, opportunities] = await Promise.all([
    getFinancialSummary(supabase as never, { organizationId: profile.organizationId, locationIds, startDate: range.start.toISOString(), endDate: range.end.toISOString() }),
    getFinancialSummary(supabase as never, { organizationId: profile.organizationId, locationIds, startDate: previous.start.toISOString(), endDate: previous.end.toISOString() }),
    count(withLocation(db.from("contacts").select("*", { count: "exact", head: true }).eq("organization_id", profile.organizationId).gte("created_at", range.start.toISOString()).lt("created_at", range.end.toISOString()), locationIds)),
    count(withLocation(db.from("appointments").select("*", { count: "exact", head: true }).eq("organization_id", profile.organizationId).gte("start_at", range.start.toISOString()).lt("start_at", range.end.toISOString()), locationIds)),
    count(withLocation(db.from("appointments").select("*", { count: "exact", head: true }).eq("organization_id", profile.organizationId).eq("status", "completed").gte("start_at", range.start.toISOString()).lt("start_at", range.end.toISOString()), locationIds)),
    count(withLocation(db.from("appointments").select("*", { count: "exact", head: true }).eq("organization_id", profile.organizationId).eq("status", "no_show").gte("start_at", range.start.toISOString()).lt("start_at", range.end.toISOString()), locationIds)),
    count(withLocation(db.from("opportunities").select("*", { count: "exact", head: true }).eq("organization_id", profile.organizationId).gte("created_at", range.start.toISOString()).lt("created_at", range.end.toISOString()), locationIds))
  ]);
  const trace: AiTrace = {
    tools: ["getOwnerAnalytics", "getFinancialSummary"],
    dateRange: { start: range.start.toISOString(), end: range.end.toISOString(), label: range.label },
    locations: locationIds,
    recordCounts: { leads, appointments: consults, completed_appointments: completed, no_shows: noShows, opportunities }
  };
  return {
    facts: [
      `Collected revenue is ${formatMoney(financial.collectedCents)} for the current access scope.`,
      `Net collected revenue is ${formatMoney(financial.netCollectedCents)} after refunds.`,
      `${leads} leads and ${consults} appointments are in the ${range.label} range.`,
      `${completed} appointments completed and ${noShows} were marked no-show.`
    ],
    analysis: [
      `Show rate is ${consults ? Math.round((completed / consults) * 100) : 0}%.`,
      `Outstanding balance is ${formatMoney(financial.outstandingCents)}.`,
      `Compared with ${previous.label}, collected revenue changed by ${formatMoney(financial.collectedCents - prevFinancial.collectedCents)}.`
    ],
    recommendations: [
      noShows > 0 ? "Review no-show follow-up and rebooking tasks today." : "Keep appointment confirmation workflows active.",
      financial.outstandingCents > 0 ? "Prioritize outstanding-balance follow-up with non-destructive tasks or calls." : "No outstanding-balance priority detected."
    ],
    trace
  };
}

export async function getWorkflowPerformance(supabase: unknown, profile: CurrentProfile) {
  const db = supabase as LooseSupabase;
  const { data } = await db.from("workflow_enrollments").select("status, workflows(name)").eq("organization_id", profile.organizationId).limit(500);
  const rows = data ?? [];
  return {
    facts: [`${rows.length} workflow enrollments were inspected.`],
    analysis: [`${rows.filter((row) => (row as { status?: string }).status === "failed").length} enrollments are failed.`],
    recommendations: ["Review failed enrollment logs before changing workflow timing or copy."],
    trace: { tools: ["getWorkflowPerformance"], locations: [], recordCounts: { workflow_enrollments: rows.length } }
  };
}

export async function getSalespersonPerformance(supabase: unknown, profile: CurrentProfile, locationIds: string[], question: string) {
  const db = supabase as LooseSupabase;
  const period = inferPeriod(question);
  const range = getDateRange(period);
  const { data: staffData } = await db
    .from("user_profiles")
    .select("id, full_name, roles(name)")
    .eq("organization_id", profile.organizationId)
    .order("full_name")
    .limit(50);
  const staffRows = (staffData ?? []).filter((row) => {
    const relation = firstRelation((row as { roles?: { name?: string | null } | { name?: string | null }[] | null }).roles);
    return relation?.name === "salesperson";
  });
  const staff = staffRows.length ? staffRows : staffData ?? [];
  const rows = await Promise.all(staff.map(async (row) => {
    const user = row as { id: string; full_name?: string | null };
    const [leads, opportunities, salesResult, overdueTasks, unansweredConversations] = await Promise.all([
      count(withLocation(db.from("contacts").select("*", { count: "exact", head: true }).eq("organization_id", profile.organizationId).eq("assigned_to", user.id).gte("created_at", range.start.toISOString()).lt("created_at", range.end.toISOString()), locationIds)),
      count(withLocation(db.from("opportunities").select("*", { count: "exact", head: true }).eq("organization_id", profile.organizationId).eq("assigned_to", user.id).gte("created_at", range.start.toISOString()).lt("created_at", range.end.toISOString()), locationIds)),
      withLocation(db.from("sales").select("id, total_amount_cents, paid_amount_cents").eq("organization_id", profile.organizationId).eq("salesperson_id", user.id).gte("sale_date", range.start.toISOString()).lt("sale_date", range.end.toISOString()), locationIds),
      count(withLocation(db.from("tasks").select("*", { count: "exact", head: true }).eq("organization_id", profile.organizationId).eq("assigned_to", user.id).in("status", ["open", "in_progress"]).lt("due_at", new Date().toISOString()), locationIds)),
      count(withLocation(db.from("conversations").select("*", { count: "exact", head: true }).eq("organization_id", profile.organizationId).eq("assigned_user_id", user.id).gt("unread_count", "0"), locationIds))
    ]);
    const sales = salesResult.data ?? [];
    const collectedCents = sales.reduce<number>((sum, sale) => sum + numberValue(sale, "paid_amount_cents"), 0);
    const grossSalesCents = sales.reduce<number>((sum, sale) => sum + numberValue(sale, "total_amount_cents"), 0);
    return {
      id: user.id,
      name: user.full_name ?? "Unnamed salesperson",
      leads,
      opportunities,
      sales: sales.length,
      closeRate: opportunities ? Math.round((sales.length / opportunities) * 100) : 0,
      averageTicketCents: sales.length ? Math.round(grossSalesCents / sales.length) : 0,
      collectedCents,
      overdueTasks,
      unansweredConversations
    };
  }));
  const sortedByCloseRate = [...rows].sort((a, b) => b.closeRate - a.closeRate);
  const needsFollowUp = [...rows].sort((a, b) => (b.overdueTasks + b.unansweredConversations) - (a.overdueTasks + a.unansweredConversations));
  const top = sortedByCloseRate[0];
  const followUp = needsFollowUp[0];
  return {
    facts: [
      `${rows.length} sales staff records were analyzed for ${range.label}.`,
      top ? `${top.name} has the highest close rate at ${top.closeRate}% from ${top.opportunities} opportunities and ${top.sales} sales.` : "No salesperson activity was found in the selected period.",
      followUp ? `${followUp.name} has ${followUp.overdueTasks} overdue follow-ups and ${followUp.unansweredConversations} unread assigned conversations.` : "No follow-up risk was found."
    ],
    analysis: rows.map((row) => `${row.name}: ${row.leads} leads, ${row.opportunities} opportunities, ${row.sales} sales, ${formatMoney(row.collectedCents)} collected, average ticket ${formatMoney(row.averageTicketCents)}.`).slice(0, 6),
    recommendations: [
      followUp && (followUp.overdueTasks > 0 || followUp.unansweredConversations > 0)
        ? `Prioritize ${followUp.name}'s overdue tasks and unread conversations today.`
        : "Keep follow-up queues current; no major coaching flag was detected.",
      "Review individual conversations before giving coaching feedback; this summary uses aggregate CRM activity only."
    ],
    trace: {
      tools: ["getSalespersonPerformance"],
      dateRange: { start: range.start.toISOString(), end: range.end.toISOString(), label: range.label },
      locations: locationIds,
      recordCounts: { salespeople: rows.length }
    }
  };
}
