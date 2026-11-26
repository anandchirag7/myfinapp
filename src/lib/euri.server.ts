import { z } from "zod";

export const DEFAULT_EURI_BASE_URL = "https://api.euron.one/api/v1/euri";
export const DEFAULT_EURI_MODEL = "euri-chat-fast";
export const DEFAULT_EURI_EMBED_MODEL = "euri-embedding";

export type EuriErrorCode =
  | "configuration"
  | "timeout"
  | "network"
  | "authentication"
  | "rate_limit"
  | "model_unavailable"
  | "provider"
  | "invalid_json"
  | "schema_validation";

export class EuriError extends Error {
  constructor(
    public readonly code: EuriErrorCode,
    message: string,
    public readonly retryable = false,
    public readonly status?: number,
    public readonly retryAfterMs?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "EuriError";
  }
}

export type EuriMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
};

export type EuriTelemetry = {
  endpoint: string;
  model: string;
  latencyMs: number;
  outcome: "success" | "failure";
  errorCode?: EuriErrorCode;
  promptTokens?: number;
  completionTokens?: number;
};

type ClientOptions = {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  embedModel?: string;
  timeoutMs?: number;
  retries?: number;
  fetchImpl?: typeof fetch;
  onTelemetry?: (event: EuriTelemetry) => void;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeBaseUrl(value?: string): string {
  const configured = value?.trim();
  const base = configured || DEFAULT_EURI_BASE_URL;
  return base.replace(/\/+$/, "");
}

function retryAfterMs(response: Response): number | undefined {
  const value = response.headers.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  for (const candidate of [trimmed, fenced]) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the first complete-looking JSON object below.
    }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      // Converted to a typed error by the caller.
    }
  }
  throw new EuriError("invalid_json", "Euri returned invalid JSON", true);
}

export function createEuriClient(options: ClientOptions = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? process.env.EURI_BASE_URL);
  const apiKey = (options.apiKey ?? process.env.EURI_API_KEY)?.trim();
  const model = (options.model ?? process.env.EURI_MODEL)?.trim() || DEFAULT_EURI_MODEL;
  const embedModel =
    (options.embedModel ?? process.env.EURI_EMBED_MODEL)?.trim() || DEFAULT_EURI_EMBED_MODEL;
  const timeoutMs = options.timeoutMs ?? Number(process.env.EURI_TIMEOUT_MS || 90_000);
  const retries = options.retries ?? Number(process.env.EURI_MAX_RETRIES || 3);
  const fetchImpl = options.fetchImpl ?? fetch;

  const assertApiKey = () => {
    if (!apiKey) {
      throw new EuriError("configuration", "EURI_API_KEY is not configured");
    }
    return apiKey;
  };

  const request = async <T>(path: string, init: RequestInit, requestModel = model): Promise<T> => {
    const key = assertApiKey();
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const started = Date.now();
      try {
        const headers = new Headers(init.headers);
        headers.set("content-type", "application/json");
        headers.set("authorization", `Bearer ${key}`);
        const response = await fetchImpl(`${baseUrl}/${path}`, {
          ...init,
          headers,
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) {
          const body = (await response.text()).slice(0, 300);
          const code: EuriErrorCode =
            response.status === 401 || response.status === 403
              ? "authentication"
              : response.status === 404
                ? "model_unavailable"
                : response.status === 429
                  ? "rate_limit"
                  : "provider";
          const retryable =
            response.status === 408 || response.status === 429 || response.status >= 500;
          throw new EuriError(
            code,
            `Euri ${path} failed (${response.status})${body ? `: ${body}` : ""}`,
            retryable,
            response.status,
            retryAfterMs(response),
          );
        }
        const json = (await response.json()) as T & {
          usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
          };
        };
        options.onTelemetry?.({
          endpoint: path,
          model: requestModel || "unknown",
          latencyMs: Date.now() - started,
          outcome: "success",
          promptTokens: json.usage?.prompt_tokens,
          completionTokens: json.usage?.completion_tokens,
        });
        return json;
      } catch (error) {
        const typed =
          error instanceof EuriError
            ? error
            : error instanceof DOMException && error.name === "TimeoutError"
              ? new EuriError(
                  "timeout",
                  `Euri ${path} timed out after ${timeoutMs}ms`,
                  true,
                  undefined,
                  undefined,
                  { cause: error },
                )
              : new EuriError(
                  "network",
                  `Unable to reach Euri at ${baseUrl}`,
                  true,
                  undefined,
                  undefined,
                  { cause: error },
                );
        lastError = typed;
        options.onTelemetry?.({
          endpoint: path,
          model: requestModel || "unknown",
          latencyMs: Date.now() - started,
          outcome: "failure",
          errorCode: typed.code,
        });
        if (!typed.retryable || attempt === retries) throw typed;
        const delay =
          typed.retryAfterMs ??
          Math.min(8_000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
        await sleep(delay);
      }
    }
    throw lastError;
  };

  return {
    baseUrl,
    model,
    embedModel,
    async chat(
      messages: EuriMessage[],
      chatOptions: {
        format?: "json" | Record<string, unknown>;
        temperature?: number;
        numPredict?: number;
        model?: string;
      } = {},
    ) {
      const selectedModel = chatOptions.model ?? model;
      const response = await request<{
        choices?: Array<{ message?: { content?: string } }>;
      }>(
        "chat/completions",
        {
          method: "POST",
          body: JSON.stringify({
            model: selectedModel,
            messages,
            temperature: chatOptions.temperature ?? 0,
            ...(chatOptions.numPredict ? { max_tokens: chatOptions.numPredict } : {}),
            ...(chatOptions.format === "json"
              ? { response_format: { type: "json_object" } }
              : chatOptions.format && typeof chatOptions.format === "object"
                ? { response_format: { type: "json_schema", json_schema: chatOptions.format } }
                : {}),
          }),
        },
        selectedModel,
      );
      return {
        message: {
          content: response.choices?.[0]?.message?.content ?? "",
        },
        done: true,
      };
    },
    async chatJson<T>(
      messages: EuriMessage[],
      schema: z.ZodType<T>,
      chatOptions: { numPredict?: number; model?: string } = {},
    ): Promise<T> {
      const response = await this.chat(messages, {
        format: "json",
        temperature: 0,
        ...chatOptions,
      });
      let json: unknown;
      try {
        json = extractJson(response.message?.content ?? "");
      } catch (error) {
        if (error instanceof EuriError) throw error;
        throw new EuriError(
          "invalid_json",
          "Euri returned invalid JSON",
          true,
          undefined,
          undefined,
          { cause: error },
        );
      }
      const parsed = schema.safeParse(json);
      if (!parsed.success) {
        throw new EuriError(
          "schema_validation",
          `Euri JSON failed validation: ${parsed.error.issues
            .slice(0, 3)
            .map((issue) => issue.message)
            .join("; ")}`,
          true,
        );
      }
      return parsed.data;
    },
    async embed(input: string | string[]) {
      const response = await request<{
        data?: Array<{ embedding: number[]; index?: number }>;
      }>(
        "embeddings",
        {
          method: "POST",
          body: JSON.stringify({ model: embedModel, input }),
        },
        embedModel,
      );
      const sorted = [...(response.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      return {
        embeddings: sorted.map((item) => item.embedding),
      };
    },
    async checkAvailability() {
      assertApiKey();
      return {
        ok: true as const,
        version: "euri-cloud",
        model,
        latencyMs: 0,
      };
    },
    async preflight() {
      const availability = await this.checkAvailability();
      const started = Date.now();
      const canary = await this.chatJson(
        [{ role: "user", content: 'Return only {"ok":true}.' }],
        z.object({ ok: z.literal(true) }),
        { numPredict: 20 },
      );
      return {
        ok: canary.ok,
        version: availability.version,
        model: availability.model,
        latencyMs: availability.latencyMs + Date.now() - started,
      };
    },
  };
}

export type EuriClient = ReturnType<typeof createEuriClient>;
