import { normalizePhoneNumber } from "../communications/phone.ts";
import type { CampaignEligibilityInput, CampaignSettings, CampaignVariant, EligibilityStatus } from "./types";

export function campaignSendIdempotencyKey(campaignRunId: string, contactId: string, variantId: string | null) {
  return `campaign-send:${campaignRunId}:${contactId}:${variantId ?? "default"}`;
}

export function validateVariantWeights(variants: CampaignVariant[]) {
  const active = variants.filter((variant) => variant.active);
  const total = active.reduce((sum, variant) => sum + variant.weightPercent, 0);
  return {
    valid: active.length > 0 && total === 100,
    total,
    activeCount: active.length
  };
}

export function assignVariant(contactId: string, variants: CampaignVariant[]) {
  const active = variants.filter((variant) => variant.active && variant.weightPercent > 0);
  const validation = validateVariantWeights(active);
  if (!validation.valid) return null;
  const bucket = hash(contactId) % 100;
  let cursor = 0;
  for (const variant of active) {
    cursor += variant.weightPercent;
    if (bucket < cursor) return variant;
  }
  return active[active.length - 1] ?? null;
}

export function contactFatigueScore(input: { outboundMarketing7d: number; workflowMessages7d: number; reviewRequests30d: number; reactivationMessages30d: number }) {
  return input.outboundMarketing7d * 2 + input.workflowMessages7d + input.reviewRequests30d * 2 + input.reactivationMessages30d * 2;
}

export function evaluateCampaignEligibility(input: CampaignEligibilityInput, settings: Pick<CampaignSettings, "dailyContactFrequencyCap" | "weeklyContactFrequencyCap">): { eligible: boolean; status: EligibilityStatus; reason?: string } {
  if (!["scheduled", "running", "draft"].includes(input.campaignStatus)) return { eligible: false, status: "campaign_inactive", reason: "Campaign is not active for recipient preparation" };
  if (!input.phone || !normalizePhoneNumber(input.phone)) return { eligible: false, status: "invalid_phone", reason: "No valid SMS-capable phone number" };
  if (input.optedOut) return { eligible: false, status: "opted_out", reason: "Contact opted out of SMS" };
  if (input.suppressed) return { eligible: false, status: "suppressed", reason: "Contact is on a suppression list" };
  if (input.locationId && !input.allowedLocationIds.includes(input.locationId)) return { eligible: false, status: "unauthorized_location", reason: "Contact belongs to an unauthorized location" };
  if (input.outboundToday >= settings.dailyContactFrequencyCap || input.outboundThisWeek >= settings.weeklyContactFrequencyCap) return { eligible: false, status: "frequency_capped", reason: "Contact frequency cap reached" };
  if (input.fatigueScore >= 8) return { eligible: false, status: "contact_fatigue", reason: "Contact fatigue threshold reached" };
  return { eligible: true, status: "eligible" };
}

export function nextAllowedSendTime(requested: Date, settings: Pick<CampaignSettings, "quietHoursEnabled" | "quietHoursStart" | "quietHoursEnd" | "weekendsEnabled">) {
  const next = new Date(requested);
  if (!settings.weekendsEnabled) {
    while (next.getDay() === 0 || next.getDay() === 6) {
      next.setDate(next.getDate() + 1);
      next.setHours(9, 0, 0, 0);
    }
  }
  if (!settings.quietHoursEnabled) return next;
  const [startHour, startMinute] = settings.quietHoursStart.split(":").map(Number);
  const [endHour, endMinute] = settings.quietHoursEnd.split(":").map(Number);
  const minutes = next.getHours() * 60 + next.getMinutes();
  const quietStart = startHour * 60 + startMinute;
  const quietEnd = endHour * 60 + endMinute;
  const wrapsMidnight = quietStart > quietEnd;
  const inQuietHours = wrapsMidnight ? minutes >= quietStart || minutes < quietEnd : minutes >= quietStart && minutes < quietEnd;
  if (!inQuietHours) return next;
  if (wrapsMidnight && minutes >= quietStart) next.setDate(next.getDate() + 1);
  next.setHours(endHour, endMinute, 0, 0);
  return next;
}

export function retryableFailure(reason: string) {
  const normalized = reason.toLowerCase();
  if (normalized.includes("opted") || normalized.includes("suppressed") || normalized.includes("invalid") || normalized.includes("hard provider")) return false;
  return true;
}

function hash(value: string) {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) >>> 0;
  }
  return result;
}
