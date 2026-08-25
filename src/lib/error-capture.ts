if (typeof globalThis !== 'undefined') {
  if (!('module' in globalThis) || !(globalThis as any).module) {
    (globalThis as any).module = { exports: {} };
  }
  if (!('exports' in globalThis) || !(globalThis as any).exports) {
    (globalThis as any).exports = (globalThis as any).module.exports;
  }
  if (!('global' in globalThis) || !(globalThis as any).global) {
    (globalThis as any).global = globalThis;
  }
  if (!('require' in globalThis) || !(globalThis as any).require) {
    const req = function(id: string) {
      return (globalThis as any).module?.exports || {};
    };
    req.resolve = (id: string) => id;
    req.cache = {};
    req.extensions = {};
    (globalThis as any).require = req;
  }
}

// Captures the original Error out-of-band so server.ts can recover the stack
// when h3 has already swallowed the throw into a generic 500 Response.

let lastCapturedError: { error: unknown; at: number } | undefined;
const TTL_MS = 5_000;

function record(error: unknown) {
  lastCapturedError = { error, at: Date.now() };
}

if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("error", (event) => record((event as ErrorEvent).error ?? event));
  globalThis.addEventListener("unhandledrejection", (event) =>
    record((event as PromiseRejectionEvent).reason),
  );
}

if (typeof process !== "undefined" && typeof process.on === "function") {
  process.on("uncaughtException", (err) => {
    console.error("[Uncaught Exception in process]:", err);
    record(err);
  });
  process.on("unhandledRejection", (reason) => {
    console.error("[Unhandled Rejection in process]:", reason);
    record(reason);
  });
}

export function consumeLastCapturedError(): unknown {
  if (!lastCapturedError) return undefined;
  if (Date.now() - lastCapturedError.at > TTL_MS) {
    lastCapturedError = undefined;
    return undefined;
  }
  const { error } = lastCapturedError;
  lastCapturedError = undefined;
  return error;
}
