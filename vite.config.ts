import path from "node:path";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    server: { entry: "server" },
  },
  vite: {
    resolve: {
      alias: {
        "@": path.resolve(process.cwd(), "./src"),
        "#tanstack-router-entry": path.resolve(process.cwd(), "./src/router.tsx"),
        "#tanstack-start-entry": path.resolve(process.cwd(), "./src/start.ts"),
      },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-router",
        "@tanstack/react-store",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    optimizeDeps: {
      exclude: [
        "@tanstack/react-start",
        "@tanstack/react-start-server",
        "@tanstack/start-server-core",
        "@tanstack/start-static-server-functions",
        "@tanstack/react-router-devtools",
      ],
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-router",
        "@tanstack/react-store",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    server: {
      host: "0.0.0.0",
      port: 3000,
      hmr: process.env.DISABLE_HMR !== "true",
      watch: process.env.DISABLE_HMR === "true" ? null : {},
    },
    define: {
      global: "globalThis",
    },
    plugins: process.platform === "win32" ? [] : [mcpPlugin()],
  },
});
