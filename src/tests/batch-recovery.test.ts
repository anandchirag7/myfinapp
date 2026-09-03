import { runWithBatchRecovery } from "../lib/batch-recovery";
import { describe, expect, it } from "./test-framework";

export function registerBatchRecoveryTests() {
  describe("Ollama batch JSON recovery", () => {
    it("retries and splits a malformed large batch without losing valid items", async () => {
      const seen = new Map<string, number>();
      const result = await runWithBatchRecovery(
        ["A", "B", "C", "D"],
        async (batch) => {
          const key = batch.join("");
          seen.set(key, (seen.get(key) ?? 0) + 1);
          if (batch.length > 1) throw new Error("invalid JSON");
          return batch;
        },
        { attempts: 2 },
      );
      expect(result.results.flat()).toEqual(["A", "B", "C", "D"]);
      expect(result.retries).toBeGreaterThan(0);
      expect(result.splits).toBe(3);
    });
  });
}
