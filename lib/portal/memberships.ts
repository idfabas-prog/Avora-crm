export type BenefitEvent = {
  benefit_key: string;
  event_type: "grant" | "use" | "expire" | "restore" | "adjustment";
  quantity: number;
};

export function summarizeMembershipBenefits(events: BenefitEvent[]) {
  const balances = new Map<string, number>();

  for (const event of events) {
    const current = balances.get(event.benefit_key) ?? 0;
    balances.set(event.benefit_key, current + event.quantity);
  }

  return Array.from(balances.entries()).map(([benefitKey, remaining]) => ({
    benefitKey,
    remaining
  }));
}

export function isMembershipBillableInDemo(mode: string | undefined) {
  return mode !== "production";
}
