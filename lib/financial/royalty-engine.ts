export type RoyaltyBasis = "gross_sale" | "money_collected" | "net_after_refunds";
export type RoyaltyRule = {
  id: string;
  locationId: string | null;
  category: string | null;
  serviceId: string | null;
  packageId: string | null;
  rate: number;
  basis: RoyaltyBasis;
};

export type RoyaltyContext = {
  locationId: string | null;
  category: string | null;
  serviceId: string | null;
  packageId: string | null;
};

function matches(rule: RoyaltyRule, context: RoyaltyContext) {
  if (rule.locationId && rule.locationId !== context.locationId) return false;
  if (rule.serviceId && rule.serviceId !== context.serviceId) return false;
  if (rule.packageId && rule.packageId !== context.packageId) return false;
  if (rule.category && rule.category !== context.category) return false;
  return true;
}

function specificity(rule: RoyaltyRule, context: RoyaltyContext) {
  const exactItem = Boolean(
    (rule.serviceId && rule.serviceId === context.serviceId) ||
    (rule.packageId && rule.packageId === context.packageId)
  );
  const category = Boolean(rule.category && rule.category === context.category);
  const location = Boolean(rule.locationId && rule.locationId === context.locationId);

  if (exactItem && location) return 500;
  if (exactItem) return 400;
  if (category && location) return 300;
  if (category) return 200;
  return 100;
}

export function resolveRoyaltyRule(rules: RoyaltyRule[], context: RoyaltyContext) {
  return rules
    .filter((rule) => matches(rule, context))
    .sort((a, b) => specificity(b, context) - specificity(a, context))[0] ?? null;
}

export function calculateRoyaltyAmount(basisAmountCents: number, rate: number) {
  return Math.round(basisAmountCents * rate);
}

export function calculateRoyaltyReversal(originalRoyaltyCents: number) {
  return -Math.abs(originalRoyaltyCents);
}
