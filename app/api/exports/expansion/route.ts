import { NextResponse } from "next/server";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { getBrandCompliance, getExpansionPortfolio, getRegionalPerformance, getTerritorySummary } from "@/lib/expansion/reports";

function csv(rows: Array<Record<string, string | number | null | undefined>>) {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
  return [headers.join(","), ...rows.map((row) => headers.map((header) => escape(row[header])).join(","))].join("\n");
}

export async function GET(request: Request) {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const type = new URL(request.url).searchParams.get("type") ?? "projects";
  const portfolio = await getExpansionPortfolio(supabase, profile);
  const rows: Array<Record<string, string | number | null | undefined>> =
    type === "territories"
      ? (await getTerritorySummary(supabase, profile)).territories.map((territory) => ({ name: territory.name, type: territory.territory_type, status: territory.status }))
      : type === "regions"
      ? (await getRegionalPerformance(supabase, profile)).map((region) => ({ name: region.name, code: region.code, projects: region.projectCount, readiness: region.averageReadiness, at_risk: region.atRiskProjects }))
      : type === "brand_audits"
      ? (await getBrandCompliance(supabase, profile)).map((audit) => ({ location: audit.locationName, score: audit.score, status: audit.status, audit_date: audit.audit_date }))
      : type === "management_fees"
      ? portfolio.managementFees.map((fee) => ({ location_id: fee.location_id, entity_id: fee.operating_entity_id, base_cents: fee.calculation_base_cents, fee_cents: fee.fee_cents, status: fee.status }))
      : portfolio.projects.map((project) => ({
          project: project.name,
          market: project.market,
          stage: project.stage,
          region: project.region,
          territory: project.territory,
          readiness: project.readiness,
          risk: project.risk,
          target_open_date: project.targetOpenDate,
          budget_cents: portfolio.canSeeFinancials ? project.budgetCents : null
        }));

  return new NextResponse(csv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="avora-expansion-${type}.csv"`
    }
  });
}
