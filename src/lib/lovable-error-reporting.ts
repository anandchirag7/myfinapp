/**
 * Generic error reporter — replaces the Lovable-specific reporter.
 * In production, integrate Sentry, LogRocket, or your preferred service here.
 */
export function reportError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  console.error(
    "[Paisa Error]",
    {
      source: context.boundary ?? "unknown",
      route: window.location.pathname,
      ...context,
    },
    error,
  );
}

// Re-export with old name for backward compatibility during migration
export const reportLovableError = reportError;
