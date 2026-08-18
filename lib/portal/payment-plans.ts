export type PaymentPlanPreviewInput = {
  totalAmountCents: number;
  downPaymentCents: number;
  installmentCount: number;
  frequency: "weekly" | "biweekly" | "monthly" | "custom";
  startDate: string;
};

export type PaymentPlanInstallmentPreview = {
  installmentNumber: number;
  dueDate: string;
  amountCents: number;
};

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

export function buildPaymentPlanSchedule(input: PaymentPlanPreviewInput): PaymentPlanInstallmentPreview[] {
  const financedCents = Math.max(input.totalAmountCents - input.downPaymentCents, 0);
  const count = Math.max(Math.floor(input.installmentCount), 1);
  const baseAmount = Math.floor(financedCents / count);
  const remainder = financedCents - baseAmount * count;
  const start = new Date(`${input.startDate}T00:00:00`);

  return Array.from({ length: count }, (_, index) => {
    const dueDate = input.frequency === "weekly"
      ? addDays(start, index * 7)
      : input.frequency === "biweekly"
        ? addDays(start, index * 14)
        : addMonths(start, index);

    return {
      installmentNumber: index + 1,
      dueDate: dueDate.toISOString().slice(0, 10),
      amountCents: baseAmount + (index === count - 1 ? remainder : 0)
    };
  });
}

export function summarizePaymentPlan(installments: Array<{ amount_cents: number; status: string }>) {
  const totalCents = installments.reduce((sum, item) => sum + item.amount_cents, 0);
  const paidCents = installments.filter((item) => item.status === "paid").reduce((sum, item) => sum + item.amount_cents, 0);
  const failedCount = installments.filter((item) => item.status === "failed" || item.status === "past_due").length;

  return {
    totalCents,
    paidCents,
    remainingCents: Math.max(totalCents - paidCents, 0),
    failedCount
  };
}
