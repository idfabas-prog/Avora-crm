export type WaitConfig = {
  wait_type?: string;
  amount?: number;
  unit?: string;
  offset_amount?: number;
  offset_unit?: string;
  direction?: "before" | "after";
  weekday?: number;
  time?: string;
  timeout_amount?: number;
  timeout_unit?: string;
};

export type QuietHours = {
  start?: string;
  end?: string;
  timezone?: string;
  respectBusinessDays?: boolean;
};

const unitMs: Record<string, number> = {
  minute: 60_000,
  minutes: 60_000,
  hour: 3_600_000,
  hours: 3_600_000,
  day: 86_400_000,
  days: 86_400_000
};

function parseTime(value: string | undefined, fallback: string) {
  const [hours, minutes] = (value ?? fallback).split(":").map(Number);
  return { hours: hours || 0, minutes: minutes || 0 };
}

function weekend(date: Date) {
  return date.getDay() === 0 || date.getDay() === 6;
}

function advanceToNextBusinessMorning(date: Date, quietHours: QuietHours) {
  const result = new Date(date);
  const end = parseTime(quietHours.end, "08:00");
  result.setHours(end.hours, end.minutes, 0, 0);
  while (weekend(result)) {
    result.setDate(result.getDate() + 1);
    result.setHours(end.hours, end.minutes, 0, 0);
  }
  return result;
}

export function applyQuietHours(runAt: Date, quietHours: QuietHours = {}) {
  let result = new Date(runAt);
  const start = parseTime(quietHours.start, "20:00");
  const end = parseTime(quietHours.end, "08:00");
  const minutes = result.getHours() * 60 + result.getMinutes();
  const startMinutes = start.hours * 60 + start.minutes;
  const endMinutes = end.hours * 60 + end.minutes;
  const wrapsMidnight = startMinutes > endMinutes;
  const quiet = wrapsMidnight
    ? minutes >= startMinutes || minutes < endMinutes
    : minutes >= startMinutes && minutes < endMinutes;

  if (quiet) {
    if (wrapsMidnight && minutes >= startMinutes) {
      result.setDate(result.getDate() + 1);
    }
    result.setHours(end.hours, end.minutes, 0, 0);
  }

  if (quietHours.respectBusinessDays && weekend(result)) {
    result = advanceToNextBusinessMorning(result, quietHours);
  }

  return result;
}

export function computeRelativeWait(config: WaitConfig, now = new Date(), quietHours?: QuietHours) {
  const amount = Number(config.amount ?? config.timeout_amount ?? 0);
  const unit = String(config.unit ?? config.timeout_unit ?? "minute");
  const ms = unitMs[unit] ?? unitMs.minute;
  return applyQuietHours(new Date(now.getTime() + amount * ms), quietHours);
}

export function computeAppointmentRelativeWait(config: WaitConfig, appointmentStart: Date, quietHours?: QuietHours) {
  const amount = Number(config.offset_amount ?? 0);
  const unit = String(config.offset_unit ?? "hour");
  const ms = (unitMs[unit] ?? unitMs.hour) * amount;
  const direction = config.direction ?? "before";
  const target = direction === "before" ? appointmentStart.getTime() - ms : appointmentStart.getTime() + ms;
  return applyQuietHours(new Date(target), quietHours);
}

export function describeWait(config: WaitConfig) {
  if (config.wait_type === "appointment_relative") {
    return `Wait until ${config.offset_amount ?? 0} ${config.offset_unit ?? "hours"} ${config.direction ?? "before"} appointment`;
  }
  if (config.wait_type === "wait_for_condition") {
    return `Wait until condition or timeout after ${config.timeout_amount ?? config.amount ?? 1} ${config.timeout_unit ?? config.unit ?? "day"}`;
  }
  return `Wait ${config.amount ?? 1} ${config.unit ?? "day"}`;
}
