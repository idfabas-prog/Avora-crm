export type CommissionBasis = "gross_sale" | "money_collected" | "net_after_payment_fees" | "custom_manual";
export type CommissionRule = {
  id: string;
  userId: string | null;
  locationId: string | null;
  serviceId: string | null;
  packageId: string | null;
  category: string | null;
  rate: number;
  commissionType: "percentage" | "fixed_amount";
  basis: CommissionBasis;
};

export type CommissionContext = {
  userId: string | null;
  locationId: string | null;
  serviceId: string | null;
  packageId: string | null;
  category: string | null;
};

function specificity(rule: CommissionRule, context: CommissionContext) {
  const exactItem = Boolean(
    (rule.serviceId && rule.serviceId === context.serviceId) ||
    (rule.packageId && rule.packageId === context.packageId)
  );
  const category = Boolean(rule.category && rule.category === context.category);
  const user = Boolean(rule.userId && rule.userId === context.userId);
  const location = Boolean(rule.locationId && rule.locationId === context.locationId);

  if (user && exactItem && location) return 800;
  if (user && exactItem) return 700;
  if (user && category && location) return 600;
  if (user && category) return 500;
  if (user && location) return 400;
  if (user) return 300;
  if (exactItem) return 200;
  return 100;
}

function matches(rule: CommissionRule, context: CommissionContext) {
  if (rule.userId && rule.userId !== context.userId) return false;
  if (rule.locationId && rule.locationId !== context.locationId) return false;
  if (rule.serviceId && rule.serviceId !== context.serviceId) return false;
  if (rule.packageId && rule.packageId !== context.packageId) return false;
  if (rule.category && rule.category !== context.category) return false;
  return true;
}

export function resolveCommissionRule(rules: CommissionRule[], context: CommissionContext) {
  return rules
    .filter((rule) => matches(rule, context))
    .sort((a, b) => specificity(b, context) - specificity(a, context))[0] ?? null;
}

export function calculateCommissionAmount(basisAmountCents: number, rule: Pick<CommissionRule, "commissionType" | "rate">) {
  if (rule.commissionType === "fixed_amount") {
    return Math.round(rule.rate);
  }

  return Math.round(basisAmountCents * rule.rate);
}

export function calculateCommissionReversal(originalCommissionCents: number) {
  return -Math.abs(originalCommissionCents);
}
