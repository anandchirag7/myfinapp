import { decideStatementRollout, householdRolloutBucket } from "../lib/statement-rollout";
import { describe, expect, it } from "./test-framework";

export function registerStatementReleaseETests() {
  describe("Statement import Release E controlled rollout", () => {
    it("assigns households to stable deterministic canary buckets", () => {
      const first = householdRolloutBucket("household-a", "resolver_v2");
      expect(first).toBe(householdRolloutBucket("household-a", "resolver_v2"));
      expect(first).toBeGreaterThanOrEqual(0);
      expect(first).toBeLessThan(100);
    });

    it("respects percentage gates without moving existing buckets", () => {
      const household = "household-canary";
      const bucket = householdRolloutBucket(household, "resolver_v2");
      const below = decideStatementRollout(
        {
          feature: "resolver_v2",
          enabled: true,
          rolloutPercent: bucket,
          shadow: true,
          rollback: false,
        },
        household,
      );
      const above = decideStatementRollout(
        {
          feature: "resolver_v2",
          enabled: true,
          rolloutPercent: bucket + 1,
          shadow: true,
          rollback: false,
        },
        household,
      );
      expect(below.active).toBe(false);
      expect(above.active).toBe(true);
    });

    it("makes rollback override enabled and 100-percent rollout", () => {
      const decision = decideStatementRollout(
        {
          feature: "web_enrichment",
          enabled: true,
          rolloutPercent: 100,
          shadow: true,
          rollback: true,
        },
        "household-a",
      );
      expect(decision.active).toBe(false);
      expect(decision.shadow).toBe(false);
      expect(decision.reason).toBe("rollback");
    });

    it("keeps disabled features inactive", () => {
      const decision = decideStatementRollout(
        {
          feature: "resolver_v2",
          enabled: false,
          rolloutPercent: 100,
          shadow: true,
          rollback: false,
        },
        "household-a",
      );
      expect(decision.active).toBe(false);
      expect(decision.reason).toBe("disabled");
    });
  });
}
