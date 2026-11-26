import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const DEFAULT_EURI_BASE_URL = "https://api.euron.one/api/v1/euri";

export function createEuriGatewayProvider(apiKey?: string) {
  const key = (apiKey ?? process.env.EURI_API_KEY)?.trim();
  const baseURL = (process.env.EURI_BASE_URL || DEFAULT_EURI_BASE_URL).replace(/\/+$/, "");
  return createOpenAICompatible({
    name: "euri",
    baseURL,
    headers: key ? { Authorization: `Bearer ${key}` } : {},
  });
}

/** @deprecated Use createEuriGatewayProvider instead. */
export const createLovableAiGatewayProvider = createEuriGatewayProvider;
