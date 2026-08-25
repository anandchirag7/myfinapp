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

import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error("[TanStack Start SSR Error caught in middleware]:", error);
    return new Response(renderErrorPage(error), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware],
}));
