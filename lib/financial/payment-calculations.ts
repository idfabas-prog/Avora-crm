export type PaymentSummaryInput = {
  payments: Array<{ amountCents: number; status: string }>;
  refunds: Array<{ amountCents: number; status: string }>;
};

function nonNegativeCents(value: number) {
  return Math.max(Math.round(value), 0);
}

export function summarizePayments(input: PaymentSummaryInput) {
  const grossCollectedCents = input.payments
    .filter((payment) => payment.status === "succeeded")
    .reduce((total, payment) => total + payment.amountCents, 0);
  const refundedCents = input.refunds
    .filter((refund) => refund.status === "succeeded")
    .reduce((total, refund) => total + refund.amountCents, 0);

  return {
    grossCollectedCents,
    refundedCents,
    netCollectedCents: nonNegativeCents(grossCollectedCents - refundedCents)
  };
}

export function refundableAmount(paymentAmountCents: number, refundedCents: number) {
  return nonNegativeCents(paymentAmountCents - refundedCents);
}
