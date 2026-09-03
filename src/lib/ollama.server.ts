import { z } from "zod";

const DEFAULT_LOCAL_URL = "http://127.0.0.1:11434";
const DEFAULT_CLOUD_URL = "https://ollama.com";

export type OllamaErrorCode =
  | "configuration"
  | "timeout"
  | "network"
  | "authentication"
  | "rate_limit"
  | "model_unavailable"
  | "provider"
  | "invalid_json"
  | "schema_validation";

export class OllamaError extends Error {
  constructor(
    public readonly code: OllamaErrorCode,
    message: string,
    public readonly retryable = false,
    public readonly status?: number,
    public readonly retryAfterMs?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "OllamaError";
  }
}

export type OllamaMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
  images?: string[];
};

export type OllamaTelemetry = {
  endpoint: string;
  model: string;
  latencyMs: number;
  outcome: "success" | "failure";
  errorCode?: OllamaErrorCode;
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
  numCtx?: number;
  numGpu?: number;
  fetchImpl?: typeof fetch;
  onTelemetry?: (event: OllamaTelemetry) => void;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeBaseUrl(value?: string): string {
  const configured = value?.trim();
  const base = configured || (process.env.OLLAMA_API_KEY ? DEFAULT_CLOUD_URL : DEFAULT_LOCAL_URL);
  return base
    .replace(/\/+$/, "")
    .replace(/\/api$/, "")
    .replace(/\/v1$/, "");
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
  throw new OllamaError("invalid_json", "Ollama returned invalid JSON", true);
}

export function createOllamaClient(options: ClientOptions = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? process.env.OLLAMA_BASE_URL);
  const apiKey = options.apiKey ?? process.env.OLLAMA_API_KEY;
  const model = options.model ?? process.env.OLLAMA_MODEL;
  const embedModel = options.embedModel ?? process.env.OLLAMA_EMBED_MODEL;
  const timeoutMs = options.timeoutMs ?? Number(process.env.OLLAMA_TIMEOUT_MS || 90_000);
  const retries = options.retries ?? Number(process.env.OLLAMA_MAX_RETRIES || 3);
  const numCtx = Math.max(512, options.numCtx ?? Number(process.env.OLLAMA_NUM_CTX || 2048));
  const configuredNumGpu = options.numGpu ?? Number(process.env.OLLAMA_NUM_GPU ?? Number.NaN);
  const fetchImpl = options.fetchImpl ?? fetch;

  const request = async <T>(path: string, init: RequestInit, requestModel = model): Promise<T> => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const started = Date.now();
      try {
        const headers = new Headers(init.headers);
        headers.set("content-type", "application/json");
        if (apiKey) headers.set("authorization", `Bearer ${apiKey}`);
        const response = await fetchImpl(`${baseUrl}/api/${path}`, {
          ...init,
          headers,
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) {
          const body = (await response.text()).slice(0, 300);
          const code: OllamaErrorCode =
            response.status === 401 || response.status === 403
              ? "authentication"
              : response.status === 404
                ? "model_unavailable"
                : response.status === 429
                  ? "rate_limit"
                  : "provider";
          const retryable =
            response.status === 408 || response.status === 429 || response.status >= 500;
          throw new OllamaError(
            code,
            `Ollama ${path} failed (${response.status})${body ? `: ${body}` : ""}`,
            retryable,
            response.status,
            retryAfterMs(response),
          );
        }
        const json = (await response.json()) as T & {
          prompt_eval_count?: number;
          eval_count?: number;
        };
        options.onTelemetry?.({
          endpoint: path,
          model: requestModel || "unknown",
          latencyMs: Date.now() - started,
          outcome: "success",
          promptTokens: json.prompt_eval_count,
          completionTokens: json.eval_count,
        });
        return json;
      } catch (error) {
        const typed =
          error instanceof OllamaError
            ? error
            : error instanceof DOMException && error.name === "TimeoutError"
              ? new OllamaError(
                  "timeout",
                  `Ollama ${path} timed out after ${timeoutMs}ms`,
                  true,
                  undefined,
                  undefined,
                  { cause: error },
                )
              : new OllamaError(
                  "network",
                  `Unable to reach Ollama at ${baseUrl}`,
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

  const assertModel = () => {
    if (!model) throw new OllamaError("configuration", "OLLAMA_MODEL is not configured");
    return model;
  };

  return {
    baseUrl,
    model,
    async version() {
      return request<{ version: string }>("version", { method: "GET" }, "version");
    },
    async tags() {
      return request<{ models?: Array<{ name?: string; model?: string }> }>(
        "tags",
        { method: "GET" },
        "tags",
      );
    },
    async chat(
      messages: OllamaMessage[],
      chatOptions: {
        format?: "json" | Record<string, unknown>;
        temperature?: number;
        numPredict?: number;
      } = {},
    ) {
      const selectedModel = assertModel();
      return request<{ message?: { content?: string }; done?: boolean }>(
        "chat",
        {
          method: "POST",
          body: JSON.stringify({
            model: selectedModel,
            messages,
            stream: false,
            ...(chatOptions.format ? { format: chatOptions.format } : {}),
            options: {
              temperature: chatOptions.temperature ?? 0,
              num_ctx: numCtx,
              ...(Number.isFinite(configuredNumGpu) ? { num_gpu: configuredNumGpu } : {}),
              ...(chatOptions.numPredict ? { num_predict: chatOptions.numPredict } : {}),
            },
          }),
        },
        selectedModel,
      );
    },
    async chatJson<T>(
      messages: OllamaMessage[],
      schema: z.ZodType<T>,
      chatOptions: { numPredict?: number } = {},
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
        if (error instanceof OllamaError) throw error;
        throw new OllamaError(
          "invalid_json",
          "Ollama returned invalid JSON",
          true,
          undefined,
          undefined,
          { cause: error },
        );
      }
      const parsed = schema.safeParse(json);
      if (!parsed.success) {
        throw new OllamaError(
          "schema_validation",
          `Ollama JSON failed validation: ${parsed.error.issues
            .slice(0, 3)
            .map((issue) => issue.message)
            .join("; ")}`,
          true,
        );
      }
      return parsed.data;
    },
    async embed(input: string | string[]) {
      if (!embedModel)
        throw new OllamaError("configuration", "OLLAMA_EMBED_MODEL is not configured");
      return request<{ embeddings: number[][] }>(
        "embed",
        {
          method: "POST",
          body: JSON.stringify({ model: embedModel, input }),
        },
        embedModel,
      );
    },
    async preflight() {
      const selectedModel = assertModel();
      const started = Date.now();
      const [version, tags] = await Promise.all([this.version(), this.tags()]);
      const available = (tags.models ?? []).some((entry) => {
        const name = entry.model ?? entry.name ?? "";
        return name === selectedModel || name.split(":")[0] === selectedModel.split(":")[0];
      });
      if (!available)
        throw new OllamaError(
          "model_unavailable",
          `Configured Ollama model '${selectedModel}' is not installed or accessible`,
        );
      const canary = await this.chatJson(
        [{ role: "user", content: 'Return only {"ok":true}.' }],
        z.object({ ok: z.literal(true) }),
        { numPredict: 20 },
      );
      return {
        ok: canary.ok,
        version: version.version,
        model: selectedModel,
        latencyMs: Date.now() - started,
      };
    },
  };
}

export type OllamaClient = ReturnType<typeof createOllamaClient>;
