import type { CommissionRule, CommissionContext } from "@/lib/financial/commission-engine";
import type { RoyaltyRule } from "@/lib/financial/royalty-engine";

export type NamedRuleContext = {
  employee?: string | null;
  location?: string | null;
  service?: string | null;
  package?: string | null;
  category?: string | null;
};

function formatPreviewMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    style: "currency"
  }).format(cents / 100);
}

export function commissionPriority(rule: Pick<CommissionRule, "userId" | "locationId" | "serviceId" | "packageId" | "category">, context?: CommissionContext) {
  const exactItem = Boolean(rule.serviceId || rule.packageId);
  const category = Boolean(rule.category);
  const user = Boolean(rule.userId);
  const location = Boolean(rule.locationId);

  if (user && exactItem && location) return 1;
  if (user && exactItem) return 2;
  if (user && category && location) return 3;
  if (user && category) return 4;
  if (user && location) return 5;
  if (user) return 6;
  if (exactItem) return 7;
  if (context) return 8;
  return 8;
}

export function royaltyPriority(rule: Pick<RoyaltyRule, "locationId" | "serviceId" | "packageId" | "category">) {
  const exactItem = Boolean(rule.serviceId || rule.packageId);
  const category = Boolean(rule.category);
  const location = Boolean(rule.locationId);

  if (exactItem && location) return 1;
  if (exactItem) return 2;
  if (category && location) return 3;
  if (category) return 4;
  if (location) return 5;
  return 6;
}

export function previewCommissionRule(
  rule: Pick<CommissionRule, "commissionType" | "rate" | "basis">,
  names: NamedRuleContext
) {
  const who = names.employee ?? "Selected employee";
  const target = names.service ?? names.package ?? names.category ?? "all eligible sales";
  const place = names.location ? ` in ${names.location}` : "";
  const amount = rule.commissionType === "fixed_amount" ? formatPreviewMoney(rule.rate) : `${(rule.rate * 100).toFixed(2)}%`;
  return `${who} earns ${amount} of ${rule.basis.replaceAll("_", " ")} on ${target}${place}.`;
}

export function previewRoyaltyRule(rule: Pick<RoyaltyRule, "rate" | "basis">, names: NamedRuleContext) {
  const target = names.service ?? names.package ?? names.category ?? "all eligible revenue";
  const place = names.location ? ` in ${names.location}` : "";
  return `${target}${place} uses a ${(rule.rate * 100).toFixed(2)}% royalty rate on ${rule.basis.replaceAll("_", " ")}.`;
}

type ConflictRule = {
  id: string;
  userId?: string | null;
  locationId?: string | null;
  serviceId?: string | null;
  packageId?: string | null;
  category?: string | null;
  effectiveStartDate?: string | null;
  effectiveEndDate?: string | null;
  active?: boolean | null;
};

function overlapsDates(a: ConflictRule, b: ConflictRule) {
  const aStart = a.effectiveStartDate ?? "0001-01-01";
  const bStart = b.effectiveStartDate ?? "0001-01-01";
  const aEnd = a.effectiveEndDate ?? "9999-12-31";
  const bEnd = b.effectiveEndDate ?? "9999-12-31";
  return aStart <= bEnd && bStart <= aEnd;
}

export function findCommissionConflicts(candidate: ConflictRule, existing: ConflictRule[]) {
  const candidatePriority = commissionPriority({
    userId: candidate.userId ?? null,
    locationId: candidate.locationId ?? null,
    serviceId: candidate.serviceId ?? null,
    packageId: candidate.packageId ?? null,
    category: candidate.category ?? null
  });

  return existing.filter((rule) => {
    if (rule.id === candidate.id || rule.active === false || candidate.active === false) return false;
    if (!overlapsDates(candidate, rule)) return false;
    const sameScope =
      (rule.userId ?? null) === (candidate.userId ?? null) &&
      (rule.locationId ?? null) === (candidate.locationId ?? null) &&
      (rule.serviceId ?? null) === (candidate.serviceId ?? null) &&
      (rule.packageId ?? null) === (candidate.packageId ?? null) &&
      (rule.category ?? null) === (candidate.category ?? null);
    return sameScope && commissionPriority({
      userId: rule.userId ?? null,
      locationId: rule.locationId ?? null,
      serviceId: rule.serviceId ?? null,
      packageId: rule.packageId ?? null,
      category: rule.category ?? null
    }) === candidatePriority;
  });
}
