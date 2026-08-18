export type NpsCategory = "detractor" | "passive" | "promoter";

export function npsCategory(score: number): NpsCategory {
  if (score <= 6) return "detractor";
  if (score <= 8) return "passive";
  return "promoter";
}

export function calculateNps(scores: number[]) {
  if (!scores.length) return { score: 0, promoters: 0, passives: 0, detractors: 0, count: 0 };
  const promoters = scores.filter((score) => npsCategory(score) === "promoter").length;
  const passives = scores.filter((score) => npsCategory(score) === "passive").length;
  const detractors = scores.filter((score) => npsCategory(score) === "detractor").length;
  return { score: Math.round(((promoters - detractors) / scores.length) * 100), promoters, passives, detractors, count: scores.length };
}

export function calculateCsat(ratings: number[], positiveThreshold = 4) {
  if (!ratings.length) return { average: 0, positivePercent: 0, count: 0 };
  const positive = ratings.filter((rating) => rating >= positiveThreshold).length;
  return {
    average: ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length,
    positivePercent: (positive / ratings.length) * 100,
    count: ratings.length
  };
}

export function percent(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

export function reviewResponseRate(sent: number, completed: number) {
  return percent(completed, sent);
}

export function shouldEscalateFeedback(input: { score?: number | null; rating?: number | null; npsThreshold?: number; csatThreshold?: number }) {
  return (
    (input.score != null && input.score <= (input.npsThreshold ?? 6)) ||
    (input.rating != null && input.rating <= (input.csatThreshold ?? 2))
  );
}

export function rewardLedgerBalance(events: Array<{ eventType: string; amountCents: number }>) {
  return events.reduce((sum, event) => {
    if (["issued", "grant", "earned", "adjustment"].includes(event.eventType)) return sum + event.amountCents;
    if (["reversed", "reverse", "expired", "expire", "apply"].includes(event.eventType)) return sum - Math.abs(event.amountCents);
    return sum;
  }, 0);
}

export function referralConversionRate(referrals: Array<{ status: string }>) {
  const sold = referrals.filter((referral) => ["sold", "reward_pending", "reward_issued"].includes(referral.status)).length;
  return percent(sold, referrals.length);
}

export function referralNetContribution(revenueCents: number, rewardCostCents: number) {
  return Math.max(0, revenueCents) - Math.max(0, rewardCostCents);
}

export function reactivationPriority(input: { lifetimeRevenueCents: number; monthsSinceLastVisit: number | null; packageUtilizationPercent?: number | null; referralCount?: number }) {
  let score = 0;
  score += Math.min(40, Math.floor(input.lifetimeRevenueCents / 50_000));
  score += Math.min(30, (input.monthsSinceLastVisit ?? 0) * 2);
  if ((input.packageUtilizationPercent ?? 100) < 100) score += 15;
  score += Math.min(15, (input.referralCount ?? 0) * 5);
  return Math.min(100, score);
}

export function reviewTemplateAvoidsGating(text: string) {
  return !/(5[ -]?star|positive review|if you had a good)/i.test(text);
}

export function eligibleForReview(input: { hasCompletedVisit: boolean; hasSucceededPayment: boolean; optedOut: boolean; daysSinceLastRequest: number | null; cooldownDays: number; activeRequestExists: boolean }) {
  if (input.optedOut) return { eligible: false, reason: "Patient is opted out" };
  if (input.activeRequestExists) return { eligible: false, reason: "Active review request already exists" };
  if (input.daysSinceLastRequest != null && input.daysSinceLastRequest < input.cooldownDays) return { eligible: false, reason: "Review request cooldown is active" };
  if (input.hasCompletedVisit || input.hasSucceededPayment) return { eligible: true, reason: "Completed visit or successful payment" };
  return { eligible: false, reason: "No qualifying completed visit or successful payment" };
}
