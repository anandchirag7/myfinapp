import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/statement-worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.STATEMENT_WORKER_SECRET;
        const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!expected || supplied !== expected)
          return new Response("Unauthorized", { status: 401 });
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { processOneStatementClassification } =
            await import("@/lib/statement-queue.server");
          const result = await processOneStatementClassification(supabaseAdmin);
          return Response.json(result);
        } catch (error) {
          return Response.json(
            { error: String((error as Error)?.message ?? error) },
            { status: 500 },
          );
        }
      },
    },
  },
});
