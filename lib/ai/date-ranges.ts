export type PeriodKey = "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month" | "mtd_prior_equivalent" | "quarter" | "year_to_date";

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function getDateRange(period: PeriodKey = "this_month", now = new Date()) {
  const today = startOfDay(now);
  if (period === "today") return { start: today, end: now, label: "today" };
  if (period === "yesterday") {
    const start = new Date(today.getTime() - 86_400_000);
    return { start, end: today, label: "yesterday" };
  }
  if (period === "this_week") {
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay());
    return { start, end: now, label: "this week" };
  }
  if (period === "last_week") {
    const end = new Date(today);
    end.setDate(today.getDate() - today.getDay());
    const start = new Date(end);
    start.setDate(end.getDate() - 7);
    return { start, end, label: "last week" };
  }
  if (period === "last_month") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start, end, label: "last month" };
  }
  if (period === "mtd_prior_equivalent") {
    const daysElapsed = now.getDate() - 1;
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(start);
    end.setDate(start.getDate() + daysElapsed);
    end.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
    return { start, end, label: "prior month equivalent period" };
  }
  if (period === "quarter") {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    return { start: new Date(now.getFullYear(), quarterStartMonth, 1), end: now, label: "this quarter" };
  }
  if (period === "year_to_date") return { start: new Date(now.getFullYear(), 0, 1), end: now, label: "year to date" };
  return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now, label: "this month" };
}

export function inferPeriod(question: string): PeriodKey {
  const text = question.toLowerCase();
  if (text.includes("today")) return "today";
  if (text.includes("yesterday")) return "yesterday";
  if (text.includes("last week")) return "last_week";
  if (text.includes("this week") || text.includes("week")) return "this_week";
  if (text.includes("last month")) return "last_month";
  if (text.includes("quarter")) return "quarter";
  if (text.includes("year")) return "year_to_date";
  return "this_month";
}
