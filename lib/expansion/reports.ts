import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentProfile } from "@/lib/auth/profile";
import { formatMoney } from "@/lib/financial/money";
import { assertExpansionPermission, canReadExpansionFinancials, canReadPlannedCompensation } from "./permissions";
import { budgetVariance, calculateReadiness, overlapRisk, siteScore } from "./calculations";

type Relation<T> = T | T[] | null;

type ProjectRow = {
  id: string;
  proposed_name: string;
  market_name: string;
  project_type: string;
  stage: string;
  target_open_date: string | null;
  readiness_score: number | null;
  risk_level: string | null;
  estimated_buildout_cost_cents: number | null;
  estimated_monthly_rent_cents: number | null;
  estimated_launch_budget_cents: number | null;
  notes: string | null;
  regions: Relation<{ id: string; name: string }>;
  territories: Relation<{ id: string; name: string }>;
  owner: Relation<{ full_name: string | null; email: string | null }>;
};

type SiteRow = {
  id: string;
  expansion_project_id: string;
  name: string;
  city: string;
  state: string;
  postal_code: string;
  square_feet: number | null;
  asking_rent_cents: number | null;
  visibility_score: number | null;
  parking_notes: string | null;
  status: string;
  site_score: number | null;
  cannibalization_risk: string | null;
  evaluation_json: Record<string, unknown> | null;
};

type ChecklistRow = {
  id: string;
  expansion_project_id: string;
  category: string;
  title: string;
  due_date: string | null;
  status: string;
  required: boolean | null;
  blocker: boolean | null;
  notes: string | null;
};

type FinancialModelRow = {
  expansion_project_id: string;
  startup_cost_cents: number;
  buildout_cost_cents: number;
  equipment_cost_cents: number;
  launch_marketing_cents: number;
  monthly_rent_cents: number;
  payroll_monthly_cents: number;
  other_monthly_fixed_cost_cents: number;
  target_monthly_revenue_cents: number;
  target_contribution_margin: number | string;
  break_even_months: number | null;
};

type BudgetRow = {
  expansion_project_id: string;
  category: string;
  description: string;
  budget_cents: number;
  committed_cents: number;
  actual_cents: number;
  status: string;
};

type RegionRow = { id: string; name: string; code: string | null; active: boolean };
type TerritoryRow = { id: string; name: string; territory_type: string; status: string; region_id: string | null };
type EntityRow = { id: string; name: string; entity_type: string; active: boolean };
type AlertRow = { id: string; expansion_project_id: string | null; severity: string; title: string; summary: string; status: string };
type BrandAuditRow = { id: string; location_id: string; audit_date: string; status: string; score: number; locations: Relation<{ name: string | null }> };
type FeeRow = { location_id: string; operating_entity_id: string; calculation_base_cents: number; fee_cents: number; status: string };
type RampRow = { expansion_project_id: string; ramp_month: number; metric_key: string; planned_value: number | string; actual_value: number | string; status: string };

export type ExpansionProjectSummary = {
  id: string;
  name: string;
  market: string;
  stage: string;
  type: string;
  region: string;
  territory: string;
  owner: string;
  targetOpenDate: string | null;
  readiness: number;
  readinessStatus: string;
  risk: string;
  budgetCents: number;
  committedCents: number;
  actualCents: number;
  budgetVarianceCents: number;
  blockers: string[];
  overdueCount: number;
  siteCount: number;
  preferredSite: string | null;
};

export type ExpansionPortfolioReport = {
  projects: ExpansionProjectSummary[];
  sites: SiteRow[];
  regions: RegionRow[];
  territories: TerritoryRow[];
  entities: EntityRow[];
  alerts: AlertRow[];
  brandAudits: BrandAuditRow[];
  managementFees: FeeRow[];
  rampMetrics: RampRow[];
  summary: {
    projectsInDevelopment: number;
    averageReadiness: number;
    atRiskProjects: number;
    activeAlerts: number;
    territoriesWithOverlap: number;
    activeRegions: number;
    activeEntities: number;
    plannedLaunchBudgetCents: number;
    managementFeesDraftCents: number;
    averageBrandScore: number | null;
  };
  canSeeFinancials: boolean;
  canSeeCompensation: boolean;
};

function first<T>(value: Relation<T> | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function percent(value: number, total: number) {
  return total <= 0 ? 0 : Math.round((value / total) * 100);
}

function completeStatus(status: string) {
  return status === "complete" || status === "not_applicable";
}

function projectReadiness(project: ProjectRow, checklist: ChecklistRow[]) {
  const calculated = calculateReadiness(
    checklist.map((item) => ({
      category: item.category,
      status: item.status,
      required: item.required,
      blocker: item.blocker,
      dueDate: item.due_date
    }))
  );
  const readiness = checklist.length ? calculated.overall : Number(project.readiness_score ?? 0);
  return { ...calculated, overall: readiness };
}

async function loadPortfolioData(supabase: SupabaseClient, profile: CurrentProfile) {
  const [
    projects,
    sites,
    checklist,
    budgets,
    regions,
    territories,
    entities,
    alerts,
    warnings,
    brandAudits,
    fees,
    rampMetrics
  ] = await Promise.all([
    supabase
      .from("expansion_projects")
      .select("id, proposed_name, market_name, project_type, stage, target_open_date, readiness_score, risk_level, estimated_buildout_cost_cents, estimated_monthly_rent_cents, estimated_launch_budget_cents, notes, regions(id, name), territories(id, name), owner:user_profiles!expansion_projects_assigned_owner_user_id_fkey(full_name, email)")
      .eq("organization_id", profile.organizationId)
      .order("target_open_date", { ascending: true }),
    supabase.from("expansion_sites").select("id, expansion_project_id, name, city, state, postal_code, square_feet, asking_rent_cents, visibility_score, parking_notes, status, site_score, cannibalization_risk, evaluation_json").limit(1000),
    supabase.from("expansion_checklist_items").select("id, expansion_project_id, category, title, due_date, status, required, blocker, notes").limit(2000),
    supabase.from("expansion_budget_items").select("expansion_project_id, category, description, budget_cents, committed_cents, actual_cents, status").limit(1000),
    supabase.from("regions").select("id, name, code, active").eq("organization_id", profile.organizationId).order("name"),
    supabase.from("territories").select("id, name, territory_type, status, region_id").eq("organization_id", profile.organizationId).order("name"),
    supabase.from("operating_entities").select("id, name, entity_type, active").eq("organization_id", profile.organizationId).order("name"),
    supabase.from("expansion_alerts").select("id, expansion_project_id, severity, title, summary, status").eq("organization_id", profile.organizationId).limit(1000),
    supabase.from("territory_overlap_warnings").select("id").eq("organization_id", profile.organizationId).in("status", ["open", "reviewed"]),
    supabase.from("brand_audits").select("id, location_id, audit_date, status, score, locations(name)").eq("organization_id", profile.organizationId).order("audit_date", { ascending: false }).limit(100),
    supabase.from("management_fee_records").select("location_id, operating_entity_id, calculation_base_cents, fee_cents, status").eq("organization_id", profile.organizationId).limit(1000),
    supabase.from("expansion_ramp_metrics").select("expansion_project_id, ramp_month, metric_key, planned_value, actual_value, status").limit(1000)
  ]);

  for (const result of [projects, sites, checklist, budgets, regions, territories, entities, alerts, warnings, brandAudits, fees, rampMetrics]) {
    if (result.error) throw new Error(result.error.message);
  }

  return {
    projects: (projects.data ?? []) as unknown as ProjectRow[],
    sites: (sites.data ?? []) as unknown as SiteRow[],
    checklist: (checklist.data ?? []) as unknown as ChecklistRow[],
    budgets: (budgets.data ?? []) as unknown as BudgetRow[],
    regions: (regions.data ?? []) as unknown as RegionRow[],
    territories: (territories.data ?? []) as unknown as TerritoryRow[],
    entities: (entities.data ?? []) as unknown as EntityRow[],
    alerts: (alerts.data ?? []) as unknown as AlertRow[],
    overlapWarningCount: (warnings.data ?? []).length,
    brandAudits: (brandAudits.data ?? []) as unknown as BrandAuditRow[],
    fees: (fees.data ?? []) as unknown as FeeRow[],
    rampMetrics: (rampMetrics.data ?? []) as unknown as RampRow[]
  };
}

function summarizeProject(project: ProjectRow, sites: SiteRow[], checklist: ChecklistRow[], budgets: BudgetRow[]): ExpansionProjectSummary {
  const projectSites = sites.filter((site) => site.expansion_project_id === project.id);
  const projectChecklist = checklist.filter((item) => item.expansion_project_id === project.id);
  const readiness = projectReadiness(project, projectChecklist);
  const variance = budgetVariance(
    budgets
      .filter((item) => item.expansion_project_id === project.id)
      .map((item) => ({ budgetCents: item.budget_cents, committedCents: item.committed_cents, actualCents: item.actual_cents }))
  );
  const owner = first(project.owner);
  const today = new Date().toISOString().slice(0, 10);

  return {
    id: project.id,
    name: project.proposed_name,
    market: project.market_name,
    stage: project.stage,
    type: project.project_type,
    region: first(project.regions)?.name ?? "Unassigned",
    territory: first(project.territories)?.name ?? "Unassigned",
    owner: owner?.full_name ?? owner?.email ?? "Unassigned",
    targetOpenDate: project.target_open_date,
    readiness: readiness.overall,
    readinessStatus: readiness.status,
    risk: project.risk_level ?? "watch",
    budgetCents: variance.budget || Number(project.estimated_launch_budget_cents ?? 0),
    committedCents: variance.committed,
    actualCents: variance.actual,
    budgetVarianceCents: variance.variance,
    blockers: readiness.blockers.map((item) => item.title ?? item.category),
    overdueCount: projectChecklist.filter((item) => item.due_date !== null && item.due_date < today && !completeStatus(item.status)).length,
    siteCount: projectSites.length,
    preferredSite: projectSites.find((site) => ["preferred", "selected", "loi"].includes(site.status))?.name ?? null
  };
}

export async function getExpansionPortfolio(supabase: SupabaseClient, profile: CurrentProfile): Promise<ExpansionPortfolioReport> {
  assertExpansionPermission(profile, "expansion.read");
  const data = await loadPortfolioData(supabase, profile);
  const projects = data.projects.map((project) => summarizeProject(project, data.sites, data.checklist, data.budgets));
  const averageBrandScore = data.brandAudits.length
    ? Math.round(data.brandAudits.reduce((sum, audit) => sum + Number(audit.score ?? 0), 0) / data.brandAudits.length)
    : null;

  return {
    projects,
    sites: data.sites,
    regions: data.regions,
    territories: data.territories,
    entities: data.entities,
    alerts: data.alerts,
    brandAudits: data.brandAudits,
    managementFees: data.fees,
    rampMetrics: data.rampMetrics,
    summary: {
      projectsInDevelopment: projects.filter((project) => !["open", "cancelled"].includes(project.stage)).length,
      averageReadiness: projects.length ? Math.round(projects.reduce((sum, project) => sum + project.readiness, 0) / projects.length) : 0,
      atRiskProjects: projects.filter((project) => project.risk !== "low" || project.blockers.length > 0 || project.overdueCount > 0).length,
      activeAlerts: data.alerts.filter((alert) => alert.status !== "resolved").length,
      territoriesWithOverlap: data.overlapWarningCount,
      activeRegions: data.regions.filter((region) => region.active).length,
      activeEntities: data.entities.filter((entity) => entity.active).length,
      plannedLaunchBudgetCents: projects.reduce((sum, project) => sum + project.budgetCents, 0),
      managementFeesDraftCents: data.fees.filter((fee) => fee.status === "draft").reduce((sum, fee) => sum + Number(fee.fee_cents ?? 0), 0),
      averageBrandScore
    },
    canSeeFinancials: canReadExpansionFinancials(profile),
    canSeeCompensation: canReadPlannedCompensation(profile)
  };
}

export async function getExpansionProjectSummary(supabase: SupabaseClient, profile: CurrentProfile, projectId: string) {
  const portfolio = await getExpansionPortfolio(supabase, profile);
  const project = portfolio.projects.find((item) => item.id === projectId);
  if (!project) throw new Error("Expansion project was not found or is not available.");

  const [sites, checklist, financialModel, budgets, milestones, staffing, training, inventory, equipment, marketingPlan, documents, rampMetrics] = await Promise.all([
    supabase.from("expansion_sites").select("*").eq("expansion_project_id", projectId).order("site_score", { ascending: false }),
    supabase.from("expansion_checklist_items").select("*").eq("expansion_project_id", projectId).order("due_date", { ascending: true }),
    supabase.from("expansion_financial_models").select("*").eq("expansion_project_id", projectId).maybeSingle(),
    supabase.from("expansion_budget_items").select("*").eq("expansion_project_id", projectId).order("category"),
    supabase.from("expansion_milestones").select("*").eq("expansion_project_id", projectId).order("milestone_date"),
    supabase.from("expansion_staffing_plans").select("*").eq("expansion_project_id", projectId).order("role_name"),
    supabase.from("expansion_training_items").select("*, user_profiles(full_name, email)").eq("expansion_project_id", projectId).order("due_date"),
    supabase.from("expansion_inventory_requirements").select("*, inventory_items(name, unit_of_measure)").eq("expansion_project_id", projectId),
    supabase.from("expansion_equipment_items").select("*, vendors(name)").eq("expansion_project_id", projectId),
    supabase.from("expansion_marketing_plan").select("*").eq("expansion_project_id", projectId).maybeSingle(),
    supabase.from("expansion_document_links").select("*").eq("expansion_project_id", projectId),
    supabase.from("expansion_ramp_metrics").select("*").eq("expansion_project_id", projectId).order("ramp_month")
  ]);

  for (const result of [sites, checklist, financialModel, budgets, milestones, staffing, training, inventory, equipment, marketingPlan, documents, rampMetrics]) {
    if (result.error) throw new Error(result.error.message);
  }

  return {
    project,
    sites: (sites.data ?? []) as unknown as SiteRow[],
    checklist: (checklist.data ?? []) as unknown as ChecklistRow[],
    financialModel: financialModel.data as unknown as FinancialModelRow | null,
    budgets: (budgets.data ?? []) as unknown as BudgetRow[],
    milestones: (milestones.data ?? []) as Record<string, unknown>[],
    staffing: (staffing.data ?? []) as Record<string, unknown>[],
    training: (training.data ?? []) as Record<string, unknown>[],
    inventory: (inventory.data ?? []) as Record<string, unknown>[],
    equipment: (equipment.data ?? []) as Record<string, unknown>[],
    marketingPlan: marketingPlan.data as Record<string, unknown> | null,
    documents: (documents.data ?? []) as Record<string, unknown>[],
    rampMetrics: (rampMetrics.data ?? []) as unknown as RampRow[],
    visibleCompensation: canReadPlannedCompensation(profile)
  };
}

export async function getOpeningReadiness(supabase: SupabaseClient, profile: CurrentProfile, projectId: string) {
  assertExpansionPermission(profile, "expansion.readiness.read");
  const summary = await getExpansionProjectSummary(supabase, profile, projectId);
  const readiness = calculateReadiness(
    summary.checklist.map((item) => ({
      category: item.category,
      status: item.status,
      required: item.required,
      blocker: item.blocker,
      dueDate: item.due_date
    }))
  );
  const hiring = summary.staffing.reduce((sum, row) => sum + Number(row.hired_count ?? 0), 0);
  const planned = summary.staffing.reduce((sum, row) => sum + Number(row.planned_headcount ?? 0), 0);
  const trainingComplete = summary.training.filter((row) => row.status === "complete").length;

  return {
    ...summary,
    readiness,
    staffingReadiness: percent(hiring, planned),
    trainingReadiness: percent(trainingComplete, summary.training.length),
    inventoryReadiness: percent(
      summary.inventory.reduce((sum, row) => sum + Number(row.received_quantity ?? 0), 0),
      summary.inventory.reduce((sum, row) => sum + Number(row.planned_quantity ?? 0), 0)
    )
  };
}

export async function getSiteComparison(supabase: SupabaseClient, profile: CurrentProfile, projectId: string) {
  const summary = await getExpansionProjectSummary(supabase, profile, projectId);
  const marketScore = 75;
  return summary.sites.map((site) => ({
    ...site,
    scorecard: siteScore({
      askingRentCents: site.asking_rent_cents,
      squareFeet: site.square_feet,
      visibilityScore: site.visibility_score,
      parkingScore: site.parking_notes ? 70 : 45,
      marketScore,
      territoryFitScore: site.cannibalization_risk === "high" ? 45 : 75,
      competitionCount: site.cannibalization_risk === "high" ? 8 : 5
    }),
    overlap: overlapRisk({
      sharedPostalCodes: site.postal_code === "33130" ? 1 : 0,
      sameTerritory: summary.project.territory.includes("Miami") && site.cannibalization_risk !== "low"
    })
  }));
}

export async function getExpansionFinancialPlan(supabase: SupabaseClient, profile: CurrentProfile, projectId: string) {
  assertExpansionPermission(profile, "expansion.financials.read");
  const summary = await getExpansionProjectSummary(supabase, profile, projectId);
  const model = summary.financialModel;
  const runway = model
    ? `${formatMoney(model.startup_cost_cents)} startup plan with ${model.break_even_months ?? "TBD"} estimated months to recover.`
    : "No financial model is available.";
  return { ...summary, runway };
}

export async function getTerritorySummary(supabase: SupabaseClient, profile: CurrentProfile) {
  const portfolio = await getExpansionPortfolio(supabase, profile);
  return {
    territories: portfolio.territories,
    overlapCount: portfolio.summary.territoriesWithOverlap,
    activeProjects: portfolio.projects.filter((project) => project.territory !== "Unassigned")
  };
}

export async function getRegionalPerformance(supabase: SupabaseClient, profile: CurrentProfile, regionId?: string) {
  const portfolio = await getExpansionPortfolio(supabase, profile);
  const regions = regionId ? portfolio.regions.filter((region) => region.id === regionId) : portfolio.regions;
  return regions.map((region) => {
    const projects = portfolio.projects.filter((project) => project.region === region.name);
    return {
      ...region,
      projectCount: projects.length,
      averageReadiness: projects.length ? Math.round(projects.reduce((sum, project) => sum + project.readiness, 0) / projects.length) : 0,
      atRiskProjects: projects.filter((project) => project.risk !== "low").length
    };
  });
}

export async function getEntityPerformance(supabase: SupabaseClient, profile: CurrentProfile, entityId?: string) {
  const portfolio = await getExpansionPortfolio(supabase, profile);
  const entities = entityId ? portfolio.entities.filter((entity) => entity.id === entityId) : portfolio.entities;
  return entities.map((entity) => {
    const fees = portfolio.managementFees.filter((fee) => fee.operating_entity_id === entity.id);
    return {
      ...entity,
      managementFeeCents: fees.reduce((sum, fee) => sum + Number(fee.fee_cents ?? 0), 0),
      calculationBaseCents: fees.reduce((sum, fee) => sum + Number(fee.calculation_base_cents ?? 0), 0)
    };
  });
}

export async function getBrandCompliance(supabase: SupabaseClient, profile: CurrentProfile) {
  const portfolio = await getExpansionPortfolio(supabase, profile);
  return portfolio.brandAudits.map((audit) => ({
    ...audit,
    locationName: first(audit.locations)?.name ?? "Location",
    statusLabel: audit.score >= 90 ? "strong" : audit.score >= 80 ? "needs review" : "remediation"
  }));
}

export async function getRampUpPerformance(supabase: SupabaseClient, profile: CurrentProfile) {
  const portfolio = await getExpansionPortfolio(supabase, profile);
  return portfolio.rampMetrics.map((metric) => ({
    ...metric,
    variance: Number(metric.actual_value ?? 0) - Number(metric.planned_value ?? 0)
  }));
}
