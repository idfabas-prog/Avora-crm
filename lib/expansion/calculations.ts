export type ChecklistItem = {
  category: string;
  title?: string;
  status: string;
  required?: boolean | null;
  blocker?: boolean | null;
  dueDate?: string | null;
};

export type SiteInput = {
  askingRentCents?: number | null;
  squareFeet?: number | null;
  visibilityScore?: number | null;
  parkingScore?: number | null;
  marketScore?: number | null;
  territoryFitScore?: number | null;
  competitionCount?: number | null;
};

export type FinancialPlanInput = {
  startupCostCents: number;
  targetMonthlyRevenueCents: number;
  targetContributionMargin: number;
  monthlyRentCents: number;
  payrollMonthlyCents: number;
  otherMonthlyFixedCostCents: number;
};

export type BudgetItem = {
  budgetCents: number;
  committedCents: number;
  actualCents: number;
};

export type RegionAccessInput = {
  role: string;
  assignedRegionIds: string[];
  requestedRegionId: string | null;
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function calculateReadiness(items: ChecklistItem[]) {
  if (!items.length) {
    return { overall: 0, status: "not_ready" as const, blockers: [] as ChecklistItem[], categoryScores: {} as Record<string, number> };
  }
  const complete = (item: ChecklistItem) => item.status === "complete" || item.status === "not_applicable";
  const blockers = items.filter((item) => item.required && item.blocker && !complete(item));
  const categories = [...new Set(items.map((item) => item.category))];
  const categoryScores = Object.fromEntries(
    categories.map((category) => {
      const categoryItems = items.filter((item) => item.category === category);
      const score = clamp((categoryItems.filter(complete).length / Math.max(1, categoryItems.length)) * 100);
      return [category, score];
    })
  );
  const rawOverall = clamp((items.filter(complete).length / items.length) * 100);
  const overall = blockers.length ? Math.min(79, rawOverall) : rawOverall;
  const status = blockers.length ? "at_risk" : overall >= 90 ? "ready" : overall >= 75 ? "ready_with_review" : "not_ready";
  return { overall, status, blockers, categoryScores };
}

export function siteScore(input: SiteInput) {
  const rentEfficiency = input.askingRentCents && input.squareFeet
    ? clamp(100 - input.askingRentCents / Math.max(1, input.squareFeet) / 35)
    : 50;
  const visibility = input.visibilityScore ?? 50;
  const parking = input.parkingScore ?? 60;
  const market = input.marketScore ?? 50;
  const territoryFit = input.territoryFitScore ?? 60;
  const competition = clamp(100 - (input.competitionCount ?? 5) * 8);
  const score = clamp(rentEfficiency * 0.2 + visibility * 0.2 + parking * 0.15 + market * 0.25 + territoryFit * 0.15 + competition * 0.05);
  return {
    score,
    factors: [
      `Rent efficiency ${rentEfficiency}/100`,
      `Visibility ${visibility}/100`,
      `Parking ${parking}/100`,
      `Market ${market}/100`,
      `Territory fit ${territoryFit}/100`,
      `Competition ${competition}/100`
    ]
  };
}

export function overlapRisk(input: { distanceMiles?: number | null; sharedPostalCodes?: number; sharedLeadSources?: number; sameTerritory?: boolean }) {
  let score = 0;
  const reasons: string[] = [];
  if ((input.distanceMiles ?? 99) <= 8) {
    score += 35;
    reasons.push("Site is within 8 miles of an existing clinic.");
  }
  if ((input.sharedPostalCodes ?? 0) > 0) {
    score += Math.min(35, (input.sharedPostalCodes ?? 0) * 18);
    reasons.push("Postal-code overlap exists.");
  }
  if ((input.sharedLeadSources ?? 0) > 0) {
    score += Math.min(20, (input.sharedLeadSources ?? 0) * 5);
    reasons.push("Lead-source overlap may exist.");
  }
  if (input.sameTerritory) {
    score += 20;
    reasons.push("Site maps to the same operational territory.");
  }
  const risk = score >= 70 ? "high" : score >= 35 ? "moderate" : "low";
  return { risk, score: clamp(score), reasons };
}

export function breakEvenEstimate(input: FinancialPlanInput) {
  const monthlyContribution = Math.round(input.targetMonthlyRevenueCents * input.targetContributionMargin - input.monthlyRentCents - input.payrollMonthlyCents - input.otherMonthlyFixedCostCents);
  return {
    monthlyContribution,
    breakEvenMonths: monthlyContribution <= 0 ? null : Math.ceil(input.startupCostCents / monthlyContribution),
    label: "Planning estimate only; not accounting, tax, or investment advice."
  };
}

export function budgetVariance(items: BudgetItem[]) {
  const budget = items.reduce((sum, item) => sum + item.budgetCents, 0);
  const committed = items.reduce((sum, item) => sum + item.committedCents, 0);
  const actual = items.reduce((sum, item) => sum + item.actualCents, 0);
  return {
    budget,
    committed,
    actual,
    variance: budget - Math.max(committed, actual)
  };
}

export function managementFee(calculationBaseCents: number, feeType: string, rate: number) {
  if (feeType === "flat_monthly") return Math.round(rate);
  if (feeType === "percent" || feeType === "hybrid") return Math.round(calculationBaseCents * rate);
  return 0;
}

export function canAccessRegion(input: RegionAccessInput) {
  if (["owner", "administrator"].includes(input.role)) return true;
  if (!input.requestedRegionId) return input.assignedRegionIds.length > 0;
  return input.assignedRegionIds.includes(input.requestedRegionId);
}

export function assertCloneableConfiguration(tableName: string) {
  const allowed = ["appointment_types", "clinical_templates", "inventory_reorder_settings", "campaign_settings", "call_recording_settings", "communication_settings"];
  const blocked = ["contacts", "appointments", "payments", "messages", "calls", "treatment_sessions", "clinical_photos", "documents"];
  if (blocked.includes(tableName)) throw new Error("Patient, payment, clinical, message, and call data cannot be cloned.");
  if (!allowed.includes(tableName)) throw new Error("Only approved configuration/template records can be cloned.");
}

export function expansionStageRisk(stage: string, readiness: number) {
  if (["paused", "cancelled"].includes(stage)) return "critical";
  if (readiness < 40) return "important";
  if (readiness < 75) return "watch";
  return "low";
}
