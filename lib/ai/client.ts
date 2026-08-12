import { getAiConfig } from "./config";
import { systemSafetyPrompt } from "./safety";

export type AiCompletionInput = {
  feature: string;
  prompt: string;
  context: Record<string, unknown>;
};

export async function completeWithAi(input: AiCompletionInput) {
  const config = getAiConfig();
  if (config.mode === "disabled") {
    return { text: "AI is disabled.", inputTokens: 0, outputTokens: 0, model: config.model, mock: true };
  }
  if (config.mode === "development" || !config.configured) {
    return {
      text: `Development AI response for ${input.feature}. The answer is generated from structured CRM metrics and safe mock summarization.`,
      inputTokens: JSON.stringify(input.context).length / 4,
      outputTokens: 80,
      model: config.model,
      mock: true
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: config.model,
        input: [
          { role: "system", content: systemSafetyPrompt() },
          {
            role: "user",
            content: `Question: ${input.prompt}\n\nTrusted structured CRM context:\n${JSON.stringify(input.context).slice(0, config.maxTokensPerRequest * 4)}`
          }
        ],
        max_output_tokens: config.maxTokensPerRequest,
        store: false
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`OpenAI request failed with ${response.status}`);
    }
    const data = await response.json() as { output_text?: string; usage?: { input_tokens?: number; output_tokens?: number } };
    return {
      text: data.output_text ?? "AI completed without text output.",
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
      model: config.model,
      mock: false
    };
  } finally {
    clearTimeout(timeout);
  }
}
