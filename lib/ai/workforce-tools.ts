import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentProfile } from "@/lib/auth/profile";
import { formatMoney } from "@/lib/financial/money";
import { getWorkforceSummary } from "@/lib/workforce/reports";

function hours(minutes: number) {
  return (minutes / 60).toFixed(1);
}

export async function getWorkforcePerformanceSummary(supabase: SupabaseClient, profile: CurrentProfile, locationIds: string[], question = "") {
  const report = await getWorkforceSummary(supabase, { organizationId: profile.organizationId, locationIds });
  const exceptions = report.attendanceExceptions.filter((item) => item.status === "open");
  const overtimeRows = report.laborCosts.filter((row) => Number(row.overtime_minutes ?? 0) > 0);
  const questionText = question.toLowerCase();

  return {
    facts: [
      `${report.summary.scheduledShifts} shifts are loaded for the selected allowed location scope.`,
      `${report.summary.openTimeEntries} employees are currently clocked in.`,
      `Worked time is ${hours(report.summary.workedMinutes)} hours with ${hours(report.summary.overtimeMinutes)} overtime hours.`,
      `Labor cost in loaded records is ${formatMoney(report.summary.laborCostCents)}.`,
      `Revenue per labor hour is ${formatMoney(report.summary.revenuePerLaborHourCents)}.`
    ],
    analysis: [
      exceptions.length ? `${exceptions.length} open attendance exceptions need manager review.` : "No open attendance exceptions appear in the loaded rows.",
      report.summary.pendingPto ? `${report.summary.pendingPto} PTO requests are pending.` : "No PTO requests are pending.",
      overtimeRows.length ? `Overtime appears for ${overtimeRows.length} labor cost records.` : "No overtime labor cost rows appear in the current result set.",
      questionText.includes("utilization") ? `Provider utilization estimate is ${Math.round(report.summary.providerUtilization * 100)}%.` : "Workforce AI is read-only and cannot approve PTO, change shifts, or edit time."
    ],
    recommendations: [
      exceptions.length ? "Review late, missed, and early clock events before approving timesheets." : "Keep attendance exception monitoring active before payroll export.",
      overtimeRows.length ? "Review schedule coverage before adding more overtime." : "Use the schedule view to prevent avoidable overtime as volume grows.",
      "Use the payroll export only as a payroll-support file; it does not calculate taxes or issue pay."
    ],
    trace: {
      tools: ["getStaffScheduleSummary", "getCurrentClockedIn", "getLaborCostSummary", "getOvertimeSummary", "getPTOOverview", "getProviderUtilization", "getRevenuePerLaborHour", "getStaffingExceptions"],
      locations: locationIds,
      recordCounts: {
        staff_shifts: report.shifts.length,
        time_entries: report.timeEntries.length,
        pto_requests: report.ptoRequests.length,
        attendance_exceptions: report.attendanceExceptions.length,
        labor_cost_records: report.laborCosts.length
      },
      filters: { question }
    }
  };
}

export const getStaffScheduleSummary = getWorkforcePerformanceSummary;
export const getCurrentClockedIn = getWorkforcePerformanceSummary;
export const getLaborCostSummary = getWorkforcePerformanceSummary;
export const getOvertimeSummary = getWorkforcePerformanceSummary;
export const getPTOOverview = getWorkforcePerformanceSummary;
export const getProviderUtilization = getWorkforcePerformanceSummary;
export const getRevenuePerLaborHour = getWorkforcePerformanceSummary;
export const getStaffingExceptions = getWorkforcePerformanceSummary;
