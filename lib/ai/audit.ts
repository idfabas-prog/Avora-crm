import type { CurrentProfile } from "@/lib/auth/profile";
import { getAiConfig } from "./config";
import { sanitizePromptSummary } from "./safety";

type SupabaseLike = {
  from: (table: string) => {
    insert: (payload: Record<string, unknown>) => {
      select: (columns: string) => {
        single: () => PromiseLike<{ data: { id: string } | null; error: { message: string } | null }>;
      };
    };
  };
};

export async function logAiRequest(
  supabase: unknown,
  profile: CurrentProfile,
  input: {
    feature: string;
    prompt: string;
    status: string;
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
    durationMs?: number;
    errorCode?: string | null;
    trace?: Record<string, unknown>;
  }
) {
  const config = getAiConfig();
  const db = supabase as SupabaseLike;
  const result = await db.from("ai_requests").insert({
    organization_id: profile.organizationId,
    user_id: profile.id,
    feature: input.feature,
    prompt_summary: sanitizePromptSummary(input.prompt),
    model: input.model ?? config.model,
    input_tokens: Math.round(input.inputTokens ?? 0),
    output_tokens: Math.round(input.outputTokens ?? 0),
    estimated_cost: 0,
    status: input.status,
    error_code: input.errorCode ?? null,
    duration_ms: input.durationMs ?? 0,
    trace_json: input.trace ?? {}
  }).select("id").single();
  return result.data?.id ?? null;
}
