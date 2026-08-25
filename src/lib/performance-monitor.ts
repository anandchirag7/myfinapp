/**
 * Client-Side Performance Monitor & Route Latency Observer
 *
 * Tracks navigation performance, route render timings, and client layout health.
 */

import { recordMetric, logger } from "./observability";

export interface NavigationTiming {
  route: string;
  loadDurationMs: number;
  domInteractiveMs?: number;
  timestamp: number;
}

const timingsHistory: NavigationTiming[] = [];

/** Initialize client-side performance observers */
export function initPerformanceMonitoring() {
  if (typeof window === "undefined" || !("performance" in window)) {
    return;
  }

  try {
    // Record initial page load metrics
    window.addEventListener("load", () => {
      setTimeout(() => {
        const perfEntries = performance.getEntriesByType("navigation");
        if (perfEntries.length > 0) {
          const nav = perfEntries[0] as PerformanceNavigationTiming;
          const loadTime = Number((nav.loadEventEnd - nav.startTime).toFixed(1));
          const ttfb = Number((nav.responseStart - nav.requestStart).toFixed(1));
          const domInteractive = Number((nav.domInteractive - nav.startTime).toFixed(1));

          recordMetric("web_vitals_ttfb", ttfb, "ms", { route: window.location.pathname });
          recordMetric("web_vitals_page_load", loadTime, "ms", { route: window.location.pathname });
          recordMetric("web_vitals_dom_interactive", domInteractive, "ms", {
            route: window.location.pathname,
          });

          logger.debug("Page load performance captured", {
            route: window.location.pathname,
            loadDurationMs: loadTime,
            ttfb,
            domInteractive,
          });
        }
      }, 0);
    });
  } catch (err) {
    logger.warn("Performance observer initialization skipped", { error: String(err) });
  }
}

/** Record route transition latency */
export function trackRouteTransition(fromRoute: string, toRoute: string, durationMs: number) {
  const timing: NavigationTiming = {
    route: toRoute,
    loadDurationMs: Number(durationMs.toFixed(1)),
    timestamp: Date.now(),
  };

  timingsHistory.push(timing);
  if (timingsHistory.length > 100) timingsHistory.shift();

  recordMetric("route_transition_duration", timing.loadDurationMs, "ms", {
    from: fromRoute,
    to: toRoute,
  });

  logger.debug(`Route transition -> ${toRoute} completed in ${timing.loadDurationMs}ms`, {
    from: fromRoute,
    to: toRoute,
    durationMs: timing.loadDurationMs,
  });
}

/** Retrieve recorded navigation timings */
export function getRecentRouteTimings(limit: number = 20): NavigationTiming[] {
  return timingsHistory.slice(-limit);
}
