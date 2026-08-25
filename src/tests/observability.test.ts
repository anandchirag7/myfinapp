import { describe, it, expect } from "./test-framework";
import {
  logger,
  generateTraceId,
  recordMetric,
  measureSync,
  measureAsync,
  getSystemHealth,
  getRecentMetrics,
} from "../lib/observability";

export function registerObservabilityTests() {
  describe("Phase 4 Observability & Telemetry Subsystem", () => {
    it("generates unique prefixed trace IDs", () => {
      const tr1 = generateTraceId("req");
      const tr2 = generateTraceId("req");

      expect(tr1.startsWith("req_")).toBeTruthy();
      expect(tr2.startsWith("req_")).toBeTruthy();
      expect(tr1 !== tr2).toBeTruthy();
    });

    it("records and retrieves telemetry metric entries", () => {
      recordMetric("test_pipeline_duration", 142.5, "ms", { bank: "HDFC" });
      const recent = getRecentMetrics(10);

      const found = recent.find((m) => m.name === "test_pipeline_duration");
      expect(found).toBeDefined();
      expect(found?.value).toBe(142.5);
      expect(found?.tags?.bank).toBe("HDFC");
    });

    it("measures synchronous function execution timing", () => {
      const { result, durationMs } = measureSync("heavy_computation", () => {
        let sum = 0;
        for (let i = 0; i < 10000; i++) sum += i;
        return sum;
      });

      expect(result).toBe(49995000);
      expect(durationMs).toBeGreaterThanOrEqual(0);
    });

    it("measures asynchronous execution and profiles promises", async () => {
      const { result, durationMs } = await measureAsync("async_db_fetch", async () => {
        await new Promise((r) => setTimeout(r, 5));
        return { rows: 42 };
      });

      expect(result.rows).toBe(42);
      expect(durationMs).toBeGreaterThanOrEqual(3);
    });

    it("provides system health reports and status metrics", () => {
      logger.info("System health check test log", { source: "test" });
      const health = getSystemHealth();

      expect(health.status).toBe("healthy");
      expect(health.uptimeSeconds).toBeGreaterThanOrEqual(0);
      expect(health.activeMetricsCount).toBeGreaterThanOrEqual(1);
    });
  });
}
