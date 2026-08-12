export type SaleLineInput = {
  quantity: number;
  unitPriceCents: number;
  discountAmountCents?: number;
};

function nonNegativeCents(value: number) {
  return Math.max(Math.round(value), 0);
}

export type SaleTotalsInput = {
  items: SaleLineInput[];
  adjustmentAmountCents?: number;
  paidAmountCents?: number;
  refundedAmountCents?: number;
};

export function calculateLineTotal(item: SaleLineInput) {
  return nonNegativeCents(item.quantity * item.unitPriceCents - (item.discountAmountCents ?? 0));
}

export function calculateSaleTotals(input: SaleTotalsInput) {
  const subtotalCents = input.items.reduce((total, item) => total + item.quantity * item.unitPriceCents, 0);
  const discountAmountCents = input.items.reduce((total, item) => total + (item.discountAmountCents ?? 0), 0);
  const totalAmountCents = nonNegativeCents(subtotalCents - discountAmountCents + (input.adjustmentAmountCents ?? 0));
  const paidAmountCents = nonNegativeCents(input.paidAmountCents ?? 0);
  const refundedAmountCents = nonNegativeCents(input.refundedAmountCents ?? 0);
  const balanceDueCents = nonNegativeCents(totalAmountCents - paidAmountCents + refundedAmountCents);

  return {
    subtotalCents,
    discountAmountCents,
    adjustmentAmountCents: input.adjustmentAmountCents ?? 0,
    totalAmountCents,
    paidAmountCents,
    refundedAmountCents,
    balanceDueCents,
    status: saleStatus(totalAmountCents, paidAmountCents, refundedAmountCents, balanceDueCents)
  };
}

export function saleStatus(totalAmountCents: number, paidAmountCents: number, refundedAmountCents: number, balanceDueCents: number) {
  if (refundedAmountCents > 0 && refundedAmountCents >= paidAmountCents) {
    return "refunded";
  }

  if (refundedAmountCents > 0) {
    return "partially_refunded";
  }

  if (totalAmountCents <= 0 || paidAmountCents <= 0) {
    return "open";
  }

  if (balanceDueCents > 0) {
    return "partially_paid";
  }

  return "paid";
}

export function calculateDiscountAmount(subtotalCents: number, type: "fixed" | "percentage", value: number) {
  if (type === "percentage") {
    return nonNegativeCents(Math.min(subtotalCents, subtotalCents * (value / 100)));
  }

  return nonNegativeCents(Math.min(subtotalCents, Math.round(value)));
}
