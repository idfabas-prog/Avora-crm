import { DevelopmentTelephonyAdapter } from "./development-adapter";
import type { TelephonyAdapter } from "./types";

export function getTelephonyMode() {
  const mode = process.env.TELEPHONY_MODE ?? "development";
  if (mode === "live") return "live";
  if (mode === "disabled") return "disabled";
  return "development";
}

export function getTelephonyAdapter(): TelephonyAdapter {
  const mode = getTelephonyMode();
  if (mode === "live") {
    throw new Error("Live telephony is not enabled in Phase 15. Use TELEPHONY_MODE=development.");
  }
  if (mode === "disabled") {
    throw new Error("Telephony is disabled.");
  }
  return new DevelopmentTelephonyAdapter();
}
