export function dollarsToCents(value: FormDataEntryValue | string | number | null | undefined) {
  if (typeof value === "number") {
    return Math.round(value * 100);
  }

  const text = String(value ?? "").trim();
  if (!text) {
    return 0;
  }

  return Math.round(Number(text.replace(/[$,\s]/g, "")) * 100);
}

export function centsToDollars(cents: number | null | undefined) {
  return (cents ?? 0) / 100;
}

export function formatMoney(cents: number | null | undefined, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(centsToDollars(cents));
}

export function nonNegativeCents(value: number) {
  return Math.max(Math.round(value), 0);
}
