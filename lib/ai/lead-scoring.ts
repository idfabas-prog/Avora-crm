import type { LeadScoreResult, LeadScoreFactor } from "./types";

type LeadInput = {
  leadSource?: string | null;
  status?: string | null;
  lifetimeValueCents?: number | null;
  lastActivityAt?: string | null;
  opportunityValueCents?: number | null;
  opportunityStatus?: string | null;
  appointmentStatus?: string | null;
  messageCount?: number;
  inboundCount?: number;
  openTaskCount?: number;
  overdueTaskCount?: number;
  noShowCount?: number;
};

function daysSince(value?: string | null, now = new Date()) {
  if (!value) return 999;
  return Math.max(0, Math.floor((now.getTime() - new Date(value).getTime()) / 86_400_000));
}

function label(score: number): LeadScoreResult["label"] {
  if (score >= 75) return "hot";
  if (score >= 50) return "warm";
  if (score >= 25) return "nurture";
  return "low_priority";
}

export function calculateLeadScore(input: LeadInput, now = new Date()): LeadScoreResult {
  const factors: LeadScoreFactor[] = [];
  const add = (name: string, points: number) => {
    factors.push({ label: name, points });
  };

  if (input.leadSource) add(`Lead source present: ${input.leadSource}`, 8);
  if (["consult_booked", "consult booked"].includes(String(input.status))) add("Consult booked", 18);
  if (input.appointmentStatus === "completed" || input.appointmentStatus === "checked_in") add("Appointment showed/completed", 22);
  if (input.appointmentStatus === "no_show") add("Prior no-show", -15);
  if ((input.inboundCount ?? 0) > 0) add("Inbound engagement", 15);
  if ((input.messageCount ?? 0) >= 3) add("Multiple conversation touches", 8);
  if ((input.opportunityValueCents ?? 0) >= 500_000) add("High-value opportunity", 14);
  if (input.opportunityStatus === "won") add("Already sold", -20);
  if (daysSince(input.lastActivityAt, now) <= 1) add("Recent activity", 12);
  if (daysSince(input.lastActivityAt, now) > 7) add("No recent activity", -12);
  if ((input.overdueTaskCount ?? 0) > 0) add("Overdue follow-up task", 10);
  if ((input.openTaskCount ?? 0) === 0) add("No follow-up task assigned", 6);
  if ((input.noShowCount ?? 0) > 0) add("No-show history", -8);

  const score = Math.max(0, Math.min(100, 35 + factors.reduce((sum, factor) => sum + factor.points, 0)));
  const resultLabel = label(score);
  const recommendedAction = resultLabel === "hot"
    ? "Call today and send a concise follow-up SMS if unanswered."
    : resultLabel === "warm"
      ? "Send a helpful follow-up and create a due task."
      : resultLabel === "nurture"
        ? "Keep in nurture with a light touch."
        : "Wait unless the lead re-engages.";

  return { score, label: resultLabel, factors, recommendedAction };
}
