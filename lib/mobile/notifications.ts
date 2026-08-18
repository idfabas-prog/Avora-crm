import { APP_DISPLAY_NAME } from "../config/branding.ts";

const sensitiveWords = ["diagnosis", "treatment notes", "payment failed", "balance due", "clinical photo", "prescription"];

export function sanitizeNotificationBody(body: string) {
  const lower = body.toLowerCase();
  if (sensitiveWords.some((word) => lower.includes(word))) {
    return `You have a new ${APP_DISPLAY_NAME} update.`;
  }
  return body.slice(0, 140);
}

export function notificationPreferenceSummary(preferences: Record<string, boolean>) {
  return Object.entries(preferences).filter(([, enabled]) => enabled).map(([key]) => key);
}
