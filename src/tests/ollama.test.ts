import { z } from "zod";
import { describe, expect, it } from "./test-framework";
import { createOllamaClient, OllamaError } from "../lib/ollama.server";

const jsonResponse = (value: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

export function registerOllamaTests() {
  describe("Ollama provider contract", () => {
    it("uses native endpoints and bearer authentication", async () => {
      const requests: Array<{ url: string; authorization: string | null }> = [];
      const client = createOllamaClient({
        baseUrl: "https://ollama.example/v1/",
        apiKey: "secret",
        model: "test-model",
        retries: 0,
        fetchImpl: (async (input, init) => {
          requests.push({
            url: String(input),
            authorization: new Headers(init?.headers).get("authorization"),
          });
          return jsonResponse({ message: { content: '{"ok":true}' }, done: true });
        }) as typeof fetch,
      });
      const result = await client.chatJson(
        [{ role: "user", content: "canary" }],
        z.object({ ok: z.literal(true) }),
      );
      expect(result.ok).toBe(true);
      expect(requests[0]?.url).toBe("https://ollama.example/api/chat");
      expect(requests[0]?.authorization).toBe("Bearer secret");
    });

    it("returns typed schema failures", async () => {
      const client = createOllamaClient({
        baseUrl: "http://ollama.test",
        model: "test-model",
        retries: 0,
        fetchImpl: (async () =>
          jsonResponse({ message: { content: '{"ok":false}' } })) as typeof fetch,
      });
      let caught: unknown;
      try {
        await client.chatJson(
          [{ role: "user", content: "canary" }],
          z.object({ ok: z.literal(true) }),
        );
      } catch (error) {
        caught = error;
      }
      expect(caught instanceof OllamaError).toBe(true);
      expect((caught as OllamaError).code).toBe("schema_validation");
    });

    it("surfaces provider failures with retry metadata", async () => {
      const client = createOllamaClient({
        baseUrl: "http://ollama.test",
        model: "test-model",
        retries: 0,
        fetchImpl: (async () =>
          jsonResponse({ error: "busy" }, 429, { "retry-after": "2" })) as typeof fetch,
      });
      let caught: unknown;
      try {
        await client.chat([{ role: "user", content: "canary" }]);
      } catch (error) {
        caught = error;
      }
      expect(caught instanceof OllamaError).toBe(true);
      expect((caught as OllamaError).code).toBe("rate_limit");
      expect((caught as OllamaError).retryable).toBe(true);
      expect((caught as OllamaError).retryAfterMs).toBe(2000);
    });

    it("checks model availability without requiring a JSON chat canary", async () => {
      const requests: string[] = [];
      const client = createOllamaClient({
        baseUrl: "http://ollama.test",
        model: "llama3.1",
        retries: 0,
        fetchImpl: (async (input) => {
          const url = String(input);
          requests.push(url);
          if (url.endsWith("/api/version")) return jsonResponse({ version: "1.0.0" });
          if (url.endsWith("/api/tags")) return jsonResponse({ models: [{ name: "llama3.1:latest" }] });
          return jsonResponse({ message: { content: "not-json" } });
        }) as typeof fetch,
      });

      const result = await client.checkAvailability();
      expect(result.ok).toBe(true);
      expect(requests.some((url) => url.endsWith("/api/chat"))).toBe(false);
    });
  });
}
