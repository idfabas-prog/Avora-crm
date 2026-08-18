export type MarketingPeriod = "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month" | "quarter" | "year_to_date" | "custom";

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

export function getMarketingDateRange(period: MarketingPeriod, now = new Date(), customStart?: string | null, customEnd?: string | null) {
  if (period === "custom" && customStart && customEnd) {
    return { start: startOfDay(new Date(customStart)), end: endOfDay(new Date(customEnd)), label: "Custom" };
  }

  const today = startOfDay(now);
  if (period === "today") return { start: today, end: endOfDay(now), label: "Today" };
  if (period === "yesterday") {
    const day = new Date(today);
    day.setDate(day.getDate() - 1);
    return { start: day, end: endOfDay(day), label: "Yesterday" };
  }
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  if (period === "this_week") return { start: weekStart, end: endOfDay(now), label: "This Week" };
  if (period === "last_week") {
    const start = new Date(weekStart);
    start.setDate(start.getDate() - 7);
    const end = new Date(weekStart);
    end.setMilliseconds(-1);
    return { start, end, label: "Last Week" };
  }
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === "this_month") return { start: monthStart, end: endOfDay(now), label: "This Month" };
  if (period === "last_month") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { start, end, label: "Last Month" };
  }
  if (period === "quarter") {
    const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
    return { start: new Date(now.getFullYear(), quarterMonth, 1), end: endOfDay(now), label: "Quarter" };
  }
  return { start: new Date(now.getFullYear(), 0, 1), end: endOfDay(now), label: "Year to Date" };
}
