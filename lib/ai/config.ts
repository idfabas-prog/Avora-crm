import type { AiMode } from "./types";

export function getAiMode(): AiMode {
  const value = (process.env.AI_MODE ?? "development").toLowerCase();
  if (value === "disabled") return "disabled";
  if (value === "enabled") return "enabled";
  return "development";
}

export function getAiConfig() {
  return {
    mode: getAiMode(),
    operatingMode: (process.env.AI_OPERATING_MODE ?? "development").toLowerCase(),
    configured: Boolean(process.env.OPENAI_API_KEY),
    model: process.env.OPENAI_MODEL ?? "gpt-5",
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
    maxDailyRequests: Number(process.env.AI_MAX_DAILY_REQUESTS ?? 100),
    maxTokensPerRequest: Number(process.env.AI_MAX_TOKENS_PER_REQUEST ?? 1200)
  };
}

export function aiFeatureEnabled(featureKey: string) {
  if (getAiMode() === "disabled") return false;
  return Boolean(featureKey);
}
