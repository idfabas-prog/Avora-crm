import type { CampaignRecipientAnalytics } from "./types";

export function campaignPerformance(rows: CampaignRecipientAnalytics[]) {
  const sent = rows.filter((row) => Boolean(row.sentAt) || ["sent", "delivered", "replied", "converted"].includes(row.status)).length;
  const delivered = rows.filter((row) => Boolean(row.deliveredAt) || ["delivered", "replied", "converted"].includes(row.status)).length;
  const replied = rows.filter((row) => Boolean(row.repliedAt) || ["replied", "converted"].includes(row.status)).length;
  const booked = rows.filter((row) => Boolean(row.bookedAt)).length;
  const sold = rows.filter((row) => Boolean(row.soldAt) || row.status === "converted").length;
  const failed = rows.filter((row) => row.status === "failed").length;
  const skipped = rows.filter((row) => row.status === "skipped").length;
  const revenueCents = rows.reduce((sum, row) => sum + row.revenueCents, 0);
  return {
    recipients: rows.length,
    sent,
    delivered,
    failed,
    skipped,
    replied,
    booked,
    sold,
    revenueCents,
    replyRate: safeDivide(replied, sent),
    bookingRate: safeDivide(booked, sent),
    salesRate: safeDivide(sold, sent),
    revenuePerRecipientCents: Math.round(safeDivide(revenueCents, rows.length)),
    revenuePerSendCents: Math.round(safeDivide(revenueCents, sent))
  };
}

export function variantPerformance(rows: CampaignRecipientAnalytics[]) {
  const byVariant = new Map<string, CampaignRecipientAnalytics[]>();
  for (const row of rows) {
    const key = row.variantId ?? "unassigned";
    byVariant.set(key, [...(byVariant.get(key) ?? []), row]);
  }
  return Array.from(byVariant.entries()).map(([variantId, variantRows]) => ({
    variantId,
    ...campaignPerformance(variantRows),
    confidence: variantRows.length >= 100 ? "Directional" : "Limited Sample"
  }));
}

export function netCampaignRevenue(paymentCents: number, refundCents: number) {
  return Math.max(0, paymentCents - refundCents);
}

export function campaignInsight(input: { replyRate: number; bookingRate: number; failedRate: number; unsubscribeRate: number; recipients: number; revenuePerSendCents: number }) {
  if (input.recipients < 10) return "Segment too small for a confident read.";
  if (input.failedRate > 0.1) return "Delivery failure rate is elevated.";
  if (input.unsubscribeRate > 0.03) return "Unsubscribe rate is high; review message fit and frequency.";
  if (input.replyRate > 0.15 && input.bookingRate < 0.03) return "High reply rate but low booking rate; review handoff and offer clarity.";
  if (input.revenuePerSendCents > 5000) return "Strong revenue per send in this campaign.";
  return "Campaign performance is within normal demo ranges.";
}

function safeDivide(numerator: number, denominator: number) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return 0;
  return numerator / denominator;
}
