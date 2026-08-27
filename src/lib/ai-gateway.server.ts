import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * Creates an AI provider for the Vercel AI SDK using any OpenAI-compatible API.
 *
 * Configure via environment variables:
 *   OLLAMA_BASE_URL — Base URL of the OpenAI-compatible API (e.g., https://api.openai.com/v1)
 *   AI_API_KEY      — API key for the provider (e.g., OpenAI API key)
 */
export function createAiProvider(apiKey?: string) {
  const baseURL = process.env.OLLAMA_BASE_URL;
  if (!baseURL) {
    throw new Error(
      "Missing OLLAMA_BASE_URL environment variable. Set it to your AI provider's OpenAI-compatible base URL.",
    );
  }
  const key = apiKey || process.env.AI_API_KEY || "";
  return createOpenAICompatible({
    name: "ai-provider",
    baseURL,
    headers: key ? { Authorization: `Bearer ${key}` } : {},
  });
}

// Backward-compatible alias
export const createLovableAiGatewayProvider = createAiProvider;
