export function assertPositiveAmount(amountCents: number, label = "Amount") {
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new Error(`${label} must be greater than zero`);
  }
}

export function assertRefundAllowed(amountCents: number, refundableCents: number) {
  assertPositiveAmount(amountCents, "Refund amount");
  if (amountCents > refundableCents) {
    throw new Error("Refund amount exceeds refundable balance");
  }
}
