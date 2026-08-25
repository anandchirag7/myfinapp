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

import "./lib/error-capture";
import * as routerEntry from "./router";
import * as startEntry from "./start";

(globalThis as any).__TSS_ROUTER_ENTRY__ = routerEntry;
(globalThis as any).__TSS_START_ENTRY__ = startEntry;

import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

const startHandler = createStartHandler(defaultStreamHandler);

async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  const err = consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`);
  console.error(err);
  return new Response(renderErrorPage(err), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const response = await (startHandler as any)(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error("[src/server.ts fetch error]:", error);
      return new Response(renderErrorPage(error), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
