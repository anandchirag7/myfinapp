/**
 * Phase 4 Observability & Telemetry Subsystem
 *
 * Provides unified, structured logging, latency profiling, error attribution,
 * and system health metrics for both client and server environments.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  traceId?: string;
  userId?: string;
  householdId?: string;
  route?: string;
  source?: string;
  durationMs?: number;
  [key: string]: unknown;
}

export interface MetricEntry {
  name: string;
  value: number;
  unit: "ms" | "count" | "bytes" | "percentage";
  tags?: Record<string, string>;
  timestamp: number;
}

export interface SystemHealthReport {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptimeSeconds: number;
  environment: string;
  activeMetricsCount: number;
  recentErrorsCount: number;
}

// In-memory ring buffer for recent metrics & telemetry events
const METRICS_BUFFER_LIMIT = 500;
const metricsBuffer: MetricEntry[] = [];
const errorBuffer: Array<{ message: string; timestamp: number; context?: LogContext }> = [];
const startTime = Date.now();

/** Generate short unique trace ID for request or operation tracing */
export function generateTraceId(prefix: string = "tr"): string {
  const rand = Math.random().toString(36).substring(2, 8);
  const time = Date.now().toString(36).slice(-4);
  return `${prefix}_${time}${rand}`;
}

/** Internal structured logger */
function log(level: LogLevel, message: string, context?: LogContext) {
  const timestamp = new Date().toISOString();
  const traceId = context?.traceId ?? "sys";
  const payload = {
    timestamp,
    level,
    traceId,
    message,
    ...context,
  };

  const isServer = typeof window === "undefined";
  const prefix = `[Paisa:${level.toUpperCase()}][${traceId}]`;

  if (level === "error") {
    errorBuffer.push({ message, timestamp: Date.now(), context });
    if (errorBuffer.length > METRICS_BUFFER_LIMIT) errorBuffer.shift();
  }

  if (isServer) {
    if (level === "error") {
      console.error(prefix, message, context ?? "");
    } else if (level === "warn") {
      console.warn(prefix, message, context ?? "");
    } else if (level === "info") {
      console.info(prefix, message, context ?? "");
    } else {
      console.debug(prefix, message, context ?? "");
    }
  } else {
    // Client-side structured output
    const style =
      level === "error"
        ? "color: #ef4444; font-weight: bold"
        : level === "warn"
          ? "color: #f59e0b; font-weight: bold"
          : level === "info"
            ? "color: #06b6d4; font-weight: bold"
            : "color: #6b7280";

    if (level === "error") {
      console.error(`%c${prefix}`, style, message, context ?? "");
    } else if (level === "warn") {
      console.warn(`%c${prefix}`, style, message, context ?? "");
    } else {
      console.log(`%c${prefix}`, style, message, context ?? "");
    }
  }

  return payload;
}

export const logger = {
  debug: (message: string, context?: LogContext) => log("debug", message, context),
  info: (message: string, context?: LogContext) => log("info", message, context),
  warn: (message: string, context?: LogContext) => log("warn", message, context),
  error: (message: string, context?: LogContext) => log("error", message, context),
};

/** Record a numeric performance or count metric */
export function recordMetric(
  name: string,
  value: number,
  unit: MetricEntry["unit"] = "ms",
  tags?: Record<string, string>,
): MetricEntry {
  const entry: MetricEntry = {
    name,
    value,
    unit,
    tags,
    timestamp: Date.now(),
  };

  metricsBuffer.push(entry);
  if (metricsBuffer.length > METRICS_BUFFER_LIMIT) {
    metricsBuffer.shift();
  }

  return entry;
}

/** Measure synchronous execution time */
export function measureSync<T>(
  name: string,
  fn: () => T,
  context?: LogContext,
): { result: T; durationMs: number } {
  const start = performance.now();
  const traceId = context?.traceId ?? generateTraceId("perf");
  try {
    const result = fn();
    const durationMs = Number((performance.now() - start).toFixed(2));
    recordMetric(name, durationMs, "ms", { traceId, ...(context?.source ? { source: context.source } : {}) });
    logger.debug(`Executed ${name} in ${durationMs}ms`, { ...context, traceId, durationMs });
    return { result, durationMs };
  } catch (err) {
    const durationMs = Number((performance.now() - start).toFixed(2));
    logger.error(`Failed ${name} after ${durationMs}ms: ${err instanceof Error ? err.message : String(err)}`, {
      ...context,
      traceId,
      durationMs,
    });
    throw err;
  }
}

/** Measure asynchronous execution time of server functions, db queries, or pipeline jobs */
export async function measureAsync<T>(
  name: string,
  fn: () => Promise<T>,
  context?: LogContext,
): Promise<{ result: T; durationMs: number }> {
  const start = performance.now();
  const traceId = context?.traceId ?? generateTraceId("perf");
  try {
    const result = await fn();
    const durationMs = Number((performance.now() - start).toFixed(2));
    recordMetric(name, durationMs, "ms", { traceId, ...(context?.source ? { source: context.source } : {}) });
    logger.debug(`Executed async ${name} in ${durationMs}ms`, { ...context, traceId, durationMs });
    return { result, durationMs };
  } catch (err) {
    const durationMs = Number((performance.now() - start).toFixed(2));
    logger.error(`Failed async ${name} after ${durationMs}ms: ${err instanceof Error ? err.message : String(err)}`, {
      ...context,
      traceId,
      durationMs,
    });
    throw err;
  }
}

/** Retrieve current telemetry snapshot and system health indicators */
export function getSystemHealth(): SystemHealthReport {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  const recentWindow = Date.now() - 60_000;
  const recentErrors = errorBuffer.filter((e) => e.timestamp > recentWindow).length;

  let status: SystemHealthReport["status"] = "healthy";
  if (recentErrors > 15) {
    status = "unhealthy";
  } else if (recentErrors > 3) {
    status = "degraded";
  }

  return {
    status,
    timestamp: new Date().toISOString(),
    uptimeSeconds,
    environment: typeof window === "undefined" ? "server" : "client",
    activeMetricsCount: metricsBuffer.length,
    recentErrorsCount: recentErrors,
  };
}

/** Export recent metric data for diagnostics */
export function getRecentMetrics(limit: number = 50): MetricEntry[] {
  return metricsBuffer.slice(-limit);
}
