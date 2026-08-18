import { requireCurrentProfile } from "@/lib/auth/profile";
import { getSelectedLocationId } from "@/lib/crm/location";
import { rowsToCsv, csvMoney } from "@/lib/financial/csv";
import { assertExecutivePermission } from "@/lib/executive/permissions";
import { getExecutiveReport } from "@/lib/executive/reports";
import { createClient } from "@/lib/supabase/server";

type ExportType = "scorecards" | "kpis" | "targets" | "forecasts" | "alerts" | "contribution" | "weekly-review";

function download(csv: string, filename: string) {
  return new Response(csv, {
    headers: {
      "content-disposition": `attachment; filename="${filename}"`,
      "content-type": "text/csv; charset=utf-8"
    }
  });
}

function pct(value: number | null) {
  return value === null ? "" : (value * 100).toFixed(2);
}

export async function GET(request: Request) {
  const profile = await requireCurrentProfile();
  assertExecutivePermission(profile, "executive.reports.read");
  const type = ((new URL(request.url).searchParams.get("type") ?? "scorecards") as ExportType);
  const supabase = await createClient();
  const selectedLocationId = await getSelectedLocationId(profile);
  const report = await getExecutiveReport(supabase, profile, { selectedLocationId });

  if (type === "kpis") {
    const rows = Object.entries(report.company).map(([key, value]) => [key, value]);
    return download(rowsToCsv(["metric", "value"], rows), "avora-executive-kpis.csv");
  }

  if (type === "targets") {
    const rows = report.targets.map((target) => [target.location_id ?? "company", target.metric_key, target.period_type, target.target_value, target.warning_threshold, target.critical_threshold, target.effective_start, target.effective_end, target.active]);
    return download(rowsToCsv(["scope", "metric", "period", "target", "warning", "critical", "effective_start", "effective_end", "active"], rows), "avora-executive-targets.csv");
  }

  if (type === "forecasts") {
    const rows = report.forecasts.map((forecast) => [forecast.label, forecast.actualValue, forecast.forecastValue, forecast.targetValue, forecast.gapToTarget, forecast.confidence]);
    return download(rowsToCsv(["forecast", "actual", "forecast", "target", "gap", "confidence"], rows), "avora-executive-forecasts.csv");
  }

  if (type === "alerts") {
    const rows = report.alerts.map((alert) => [alert.locationName, alert.alertType, alert.severity, alert.status, alert.title, alert.summary, alert.generatedAt]);
    return download(rowsToCsv(["location", "type", "severity", "status", "title", "summary", "generated_at"], rows), "avora-executive-alerts.csv");
  }

  if (type === "contribution") {
    const rows = [
      ["Collected Revenue", csvMoney(report.company.collectedRevenueCents)],
      ["Refunds", csvMoney(report.company.refundsCents)],
      ["Net Collected Revenue", csvMoney(report.company.netCollectedRevenueCents)],
      ["Inventory COGS", csvMoney(report.company.inventoryCogsCents)],
      ["Direct Labor Cost", csvMoney(report.company.directLaborCostCents)],
      ["Contribution Before Overhead", csvMoney(report.company.contributionBeforeOverheadCents)],
      ["Contribution Margin %", pct(report.company.contributionMarginPercent)]
    ];
    return download(rowsToCsv(["metric", "value"], rows), "avora-executive-contribution.csv");
  }

  if (type === "weekly-review") {
    return download(rowsToCsv(["section", "summary"], report.weeklyReview.map((row) => ["weekly_review", row])), "avora-weekly-operating-review.csv");
  }

  const rows = report.locationScorecards.map((scorecard) => [
    scorecard.locationName,
    scorecard.score,
    scorecard.maturityStage,
    csvMoney(scorecard.kpis.netCollectedRevenueCents),
    pct(scorecard.kpis.contributionMarginPercent),
    scorecard.kpis.roas.toFixed(2),
    pct(scorecard.kpis.closeRatePercent),
    pct(scorecard.kpis.showRatePercent),
    pct(scorecard.kpis.noShowRatePercent),
    pct(scorecard.kpis.directLaborCostCents / Math.max(1, scorecard.kpis.netCollectedRevenueCents)),
    pct(scorecard.kpis.providerUtilizationPercent),
    scorecard.kpis.nps ?? "",
    csvMoney(scorecard.kpis.referralRevenueCents),
    csvMoney(scorecard.kpis.reactivationRevenueCents),
    scorecard.kpis.lowStockItems + scorecard.kpis.outOfStockItems
  ]);
  return download(rowsToCsv(["location", "score", "maturity", "net_collected", "contribution_margin_pct", "roas", "close_rate_pct", "show_rate_pct", "no_show_rate_pct", "labor_cost_pct", "provider_utilization_pct", "nps", "referral_revenue", "reactivation_revenue", "inventory_alerts"], rows), "avora-executive-scorecards.csv");
}
