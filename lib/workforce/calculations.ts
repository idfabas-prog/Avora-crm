export type TimeInterval = {
  start: Date;
  end: Date;
};

export type BreakInterval = TimeInterval & {
  paid?: boolean;
};

export type OvertimeRule = {
  weeklyThresholdMinutes: number;
  multiplier: number;
};

export type PayProfile = {
  employmentType: "hourly" | "salary" | "contractor" | "per_diem" | "other";
  hourlyRateCents?: number | null;
  annualSalaryCents?: number | null;
  overtimeEligible: boolean;
  overtimeMultiplier: number;
  annualWorkMinutes?: number | null;
};

export function minutesBetween(start: Date, end: Date) {
  return Math.max(Math.round((end.getTime() - start.getTime()) / 60_000), 0);
}

export function workedMinutes(entry: TimeInterval, breaks: BreakInterval[] = []) {
  const total = minutesBetween(entry.start, entry.end);
  const unpaidBreaks = breaks
    .filter((item) => !item.paid)
    .reduce((sum, item) => sum + minutesBetween(item.start, item.end), 0);
  return Math.max(total - unpaidBreaks, 0);
}

export function splitOvertime(totalWorkedMinutes: number, rule: OvertimeRule) {
  const overtimeMinutes = Math.max(totalWorkedMinutes - rule.weeklyThresholdMinutes, 0);
  return {
    regularMinutes: totalWorkedMinutes - overtimeMinutes,
    overtimeMinutes
  };
}

export function hourlyEquivalentCents(profile: PayProfile) {
  if (profile.hourlyRateCents != null) return profile.hourlyRateCents;
  if (profile.annualSalaryCents == null) return 0;
  const annualMinutes = profile.annualWorkMinutes ?? 124_800;
  return Math.round(profile.annualSalaryCents / (annualMinutes / 60));
}

export function laborCostCents(profile: PayProfile, regularMinutes: number, overtimeMinutes: number, ptoMinutes = 0) {
  const hourly = hourlyEquivalentCents(profile);
  const multiplier = profile.overtimeEligible ? profile.overtimeMultiplier : 1;
  const regularCostCents = Math.round((regularMinutes / 60) * hourly);
  const overtimeCostCents = Math.round((overtimeMinutes / 60) * hourly * multiplier);
  const ptoCostCents = Math.round((ptoMinutes / 60) * hourly);
  return {
    regularCostCents,
    overtimeCostCents,
    ptoCostCents,
    totalCostCents: regularCostCents + overtimeCostCents + ptoCostCents
  };
}

export function ptoAvailableMinutes(events: Array<{ minutes: number }>, pendingMinutes = 0) {
  return events.reduce((sum, event) => sum + event.minutes, 0) - pendingMinutes;
}

export function providerUtilization(treatmentMinutes: number, scheduledClinicalMinutes: number) {
  if (scheduledClinicalMinutes <= 0) return 0;
  return treatmentMinutes / scheduledClinicalMinutes;
}

export function revenuePerLaborHour(revenueCents: number, workedMinutesValue: number) {
  if (workedMinutesValue <= 0) return 0;
  return Math.round(revenueCents / (workedMinutesValue / 60));
}

export function contributionBeforeOverhead(revenueCents: number, inventoryCogsCents: number, laborCents: number) {
  const contributionCents = revenueCents - inventoryCogsCents - laborCents;
  return {
    contributionCents,
    margin: revenueCents > 0 ? contributionCents / revenueCents : 0
  };
}

export function hasScheduleConflict(
  candidate: TimeInterval,
  existing: TimeInterval[]
) {
  return existing.some((interval) => candidate.start < interval.end && candidate.end > interval.start);
}
