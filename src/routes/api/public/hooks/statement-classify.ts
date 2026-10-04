/**
 * Background worker for statement payee classification.
 *
 * Compatibility endpoint for queued or retried classification jobs. The
 * primary upload path now awaits the same classifier directly. Authenticated
 * by the single-use job token stored on the
 * `statement_uploads` row — no session, no service key from the caller.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
  uploadId: z.string().uuid(),
  jobToken: z.string().min(10),
  pending: z
    .array(
      z.object({
        pattern: z.string().min(1),
        samples: z.array(z.string()).default([]),
        type: z.string().default("expense"),
        count: z.number().optional(),
      }),
    )
    .default([]),
  userCategoryNames: z.array(z.string()).optional(),
  householdId: z.string().uuid().optional(),
});

export const Route = createFileRoute("/api/public/hooks/statement-classify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: z.infer<typeof bodySchema>;
        try {
          payload = bodySchema.parse(await request.json());
        } catch {
          return new Response("Bad request", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: row } = await supabaseAdmin
          .from("statement_uploads")
          .select("id, status, result, unique_patterns")
          .eq("id", payload.uploadId)
          .maybeSingle();

        const result = (row?.result ?? {}) as Record<string, any>;
        if (!row || result.job_token !== payload.jobToken) {
          return new Response("Unauthorized", { status: 401 });
        }
        if (row.status === "complete" || row.status === "failed") {
          return new Response("ok");
        }

        try {
          const { createOllamaClient } = await import("@/lib/ollama.server");
          await createOllamaClient().checkAvailability();
          const { classifyPendingPatterns } = await import("@/lib/statement-classify.server");

          // Build CategoryIndex for pattern persistence (if householdId provided)
          let categoryIndex;
          if (payload.householdId && payload.userCategoryNames?.length) {
            const { buildCategoryIndex } = await import("@/lib/category-resolver");
            // Fetch full category entries for the index
            const { data: catRows } = await supabaseAdmin
              .from("categories")
              .select("id, name, kind, parent_id")
              .eq("household_id", payload.householdId);
            if (catRows?.length) {
              categoryIndex = buildCategoryIndex(catRows);
            }
          }

          const classified = await classifyPendingPatterns({
            admin: supabaseAdmin,
            uploadId: payload.uploadId,
            pending: payload.pending,
            userCategoryNames: payload.userCategoryNames,
            householdId: payload.householdId,
            categoryIndex,
          });

          const resolved = { ...(result.resolved ?? {}), ...classified.resolved };
          await supabaseAdmin
            .from("statement_uploads")
            .update({
              status: classified.diagnostics.failedPatterns.length ? "partial" : "complete",
              processed_transactions: Object.keys(resolved).length,
              error: classified.diagnostics.failedPatterns.length
                ? `${classified.diagnostics.failedPatterns.length} patterns remain unresolved`
                : null,
              result: {
                ...result,
                resolved,
                pending: classified.diagnostics.failedPatterns,
                classification: classified.diagnostics,
              },
            })
            .eq("id", payload.uploadId);

          return new Response("ok");
        } catch (e: any) {
          await supabaseAdmin
            .from("statement_uploads")
            .update({ status: "failed", error: String(e?.message ?? e).slice(0, 500) })
            .eq("id", payload.uploadId);
          return new Response("Classification failed", { status: 500 });
        }
      },
    },
  },
});
