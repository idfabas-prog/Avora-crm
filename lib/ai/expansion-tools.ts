import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentProfile } from "@/lib/auth/profile";
import { formatMoney } from "@/lib/financial/money";
import {
  getBrandCompliance,
  getEntityPerformance,
  getExpansionPortfolio,
  getRegionalPerformance,
  getSiteComparison,
  getTerritorySummary
} from "@/lib/expansion/reports";

export async function getExpansionIntelligenceSummary(supabase: SupabaseClient, profile: CurrentProfile, locationIds: string[], question = "") {
  const portfolio = await getExpansionPortfolio(supabase, profile);
  const regions = await getRegionalPerformance(supabase, profile);
  const entities = await getEntityPerformance(supabase, profile);
  const territories = await getTerritorySummary(supabase, profile);
  const brand = await getBrandCompliance(supabase, profile);
  const mostAtRisk = [...portfolio.projects].sort((a, b) => (b.blockers.length + b.overdueCount + (b.risk === "important" ? 2 : 0)) - (a.blockers.length + a.overdueCount + (a.risk === "important" ? 2 : 0)))[0];
  const strongestRegion = [...regions].sort((a, b) => b.averageReadiness - a.averageReadiness)[0];
  const weakestBrand = [...brand].sort((a, b) => a.score - b.score)[0];
  const projectForSiteQuestion = portfolio.projects.find((project) => question.toLowerCase().includes(project.name.toLowerCase().split(" ")[0])) ?? portfolio.projects[0];
  const siteComparison = projectForSiteQuestion ? await getSiteComparison(supabase, profile, projectForSiteQuestion.id) : [];
  const strongestSite = [...siteComparison].sort((a, b) => b.scorecard.score - a.scorecard.score)[0];

  return {
    facts: [
      `${portfolio.projects.length} expansion projects are visible in the user's authorized organization scope.`,
      `Average opening readiness is ${portfolio.summary.averageReadiness}%, with ${portfolio.summary.atRiskProjects} project(s) at risk.`,
      `${portfolio.summary.territoriesWithOverlap} territory overlap warning(s) require human review.`,
      `Planned launch budget across visible projects is ${formatMoney(portfolio.summary.plannedLaunchBudgetCents)}.`,
      `${portfolio.summary.activeAlerts} active expansion alert(s) are visible.`
    ],
    analysis: [
      mostAtRisk ? `${mostAtRisk.name} has the highest visible risk signal: ${mostAtRisk.readiness}% readiness, ${mostAtRisk.blockers.length} blocker(s), and ${mostAtRisk.overdueCount} overdue item(s).` : "No expansion project risk signal is available yet.",
      strongestRegion ? `${strongestRegion.name} is currently the strongest region by expansion readiness at ${strongestRegion.averageReadiness}%.` : "No regional readiness data is available yet.",
      weakestBrand ? `${weakestBrand.locationName} has the weakest latest brand compliance score at ${weakestBrand.score}/100.` : "No brand audit score is available yet.",
      strongestSite ? `${strongestSite.name} is the strongest visible site option for ${projectForSiteQuestion?.name ?? "the selected project"} at ${strongestSite.scorecard.score}/100; overlap risk is ${strongestSite.overlap.risk}.` : "No site comparison rows are available yet."
    ],
    recommendations: [
      mostAtRisk ? `Review ${mostAtRisk.name}'s blocker list and overdue checklist before advancing stage.` : "Seed expansion projects and checklist rows before relying on readiness recommendations.",
      territories.overlapCount ? "Resolve territory overlap warnings with human review; these records are operational warnings, not legal territory determinations." : "No territory overlap review is currently flagged.",
      "Keep expansion AI advisory: it may summarize readiness, risks, and priorities, but it must not select leases, approve locations, create ownership interests, sign agreements, or move money."
    ],
    trace: {
      tools: [
        "getExpansionPortfolio",
        "getExpansionProjectSummary",
        "getOpeningReadiness",
        "getTerritorySummary",
        "getRegionalPerformance",
        "getEntityPerformance",
        "getBrandCompliance",
        "getRampUpPerformance",
        "getExpansionFinancialPlan",
        "getSiteComparison"
      ],
      locations: locationIds,
      recordCounts: {
        expansion_projects: portfolio.projects.length,
        expansion_sites: portfolio.sites.length,
        regions: regions.length,
        territories: territories.territories.length,
        operating_entities: entities.length,
        brand_audits: brand.length,
        expansion_alerts: portfolio.alerts.length,
        ramp_metrics: portfolio.rampMetrics.length
      },
      filters: { question, project_for_site_question: projectForSiteQuestion?.name ?? null }
    }
  };
}

export const getExpansionPortfolioTool = getExpansionIntelligenceSummary;
export const getExpansionProjectSummaryTool = getExpansionIntelligenceSummary;
export const getOpeningReadinessTool = getExpansionIntelligenceSummary;
export const getTerritorySummaryTool = getExpansionIntelligenceSummary;
export const getRegionalPerformanceTool = getExpansionIntelligenceSummary;
export const getEntityPerformanceTool = getExpansionIntelligenceSummary;
export const getBrandComplianceTool = getExpansionIntelligenceSummary;
export const getRampUpPerformanceTool = getExpansionIntelligenceSummary;
export const getExpansionFinancialPlanTool = getExpansionIntelligenceSummary;
export const getSiteComparisonTool = getExpansionIntelligenceSummary;
