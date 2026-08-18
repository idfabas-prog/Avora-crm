export type LiveGate =
  | "payments"
  | "telephony"
  | "campaigns"
  | "accounting"
  | "push"
  | "ai"
  | "ghl";

const gateEnv: Record<LiveGate, string> = {
  payments: "PAYMENTS_ALLOW_LIVE_CHARGES",
  telephony: "TELEPHONY_ALLOW_LIVE_CALLS",
  campaigns: "CAMPAIGNS_ALLOW_LIVE_SENDS",
  accounting: "ACCOUNTING_ALLOW_LIVE_EXPORTS",
  push: "PUSH_ALLOW_LIVE_SENDS",
  ai: "AI_LIVE_PROVIDER_ENABLED",
  ghl: "GHL_READ_SYNC_ENABLED"
};

export function liveGateEnabled(gate: LiveGate, env: NodeJS.ProcessEnv = process.env) {
  return env[gateEnv[gate]] === "true";
}

export function assertLiveGate(gate: LiveGate, env: NodeJS.ProcessEnv = process.env) {
  if (!liveGateEnabled(gate, env)) {
    throw new Error(`Live ${gate} actions are disabled by the Phase 20 production gate`);
  }
}

export function integrationGateSummary(env: NodeJS.ProcessEnv = process.env) {
  return (Object.keys(gateEnv) as LiveGate[]).map((gate) => ({
    gate,
    envVar: gateEnv[gate],
    liveEnabled: liveGateEnabled(gate, env)
  }));
}
