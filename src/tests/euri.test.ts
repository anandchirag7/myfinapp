import { z } from "zod";
import { describe, expect, it } from "./test-framework";
import { createEuriClient, EuriError } from "../lib/euri.server";

export function registerEuriTests() {
  describe("Euri cloud provider contract", () => {
    it("calls OpenAI-compatible chat/completions with Bearer auth and parses JSON", async () => {
      const requests: Array<{ url: string; auth: string | null; body: any }> = [];
      const client = createEuriClient({
        baseUrl: "https://api.euron.one/api/v1/euri/",
        apiKey: "euri-test-key",
        model: "euri-chat-fast",
        retries: 0,
        fetchImpl: async (url, init) => {
          const headers = new Headers(init?.headers);
          requests.push({
            url: String(url),
            auth: headers.get("authorization"),
            body: JSON.parse(String(init?.body ?? "{}")),
          });
          return new Response(
            JSON.stringify({
              choices: [{ message: { content: '```json\n{"ok":true}\n```' } }],
              usage: { prompt_tokens: 10, completion_tokens: 5 },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        },
      });

      const result = await client.chatJson(
        [{ role: "user", content: "ping" }],
        z.object({ ok: z.literal(true) }),
      );
      expect(result.ok).toBe(true);
      expect(requests[0]?.url).toBe("https://api.euron.one/api/v1/euri/chat/completions");
      expect(requests[0]?.auth).toBe("Bearer euri-test-key");
      expect(requests[0]?.body.model).toBe("euri-chat-fast");
      expect(requests[0]?.body.response_format?.type).toBe("json_object");
    });

    it("throws configuration error when EURI_API_KEY is missing", async () => {
      const client = createEuriClient({
        apiKey: "",
        retries: 0,
      });

      let caught: unknown;
      try {
        await client.checkAvailability();
      } catch (error) {
        caught = error;
      }
      expect(caught instanceof EuriError).toBe(true);
      expect((caught as EuriError).code).toBe("configuration");
    });

    it("maps 429 rate-limit with Retry-After into retryable EuriError", async () => {
      const client = createEuriClient({
        apiKey: "euri-test-key",
        retries: 0,
        fetchImpl: async () =>
          new Response("rate limited", {
            status: 429,
            headers: { "retry-after": "2" },
          }),
      });

      let caught: unknown;
      try {
        await client.chat([{ role: "user", content: "hi" }]);
      } catch (error) {
        caught = error;
      }
      expect(caught instanceof EuriError).toBe(true);
      expect((caught as EuriError).code).toBe("rate_limit");
      expect((caught as EuriError).retryable).toBe(true);
      expect((caught as EuriError).retryAfterMs).toBe(2000);
    });

    it("sorts embeddings by index from /embeddings endpoint", async () => {
      const client = createEuriClient({
        apiKey: "euri-test-key",
        embedModel: "euri-embedding",
        retries: 0,
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              data: [
                { index: 1, embedding: [0.3, 0.4] },
                { index: 0, embedding: [0.1, 0.2] },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      });

      const res = await client.embed(["a", "b"]);
      expect(res.embeddings).toEqual([
        [0.1, 0.2],
        [0.3, 0.4],
      ]);
    });
  });
}
