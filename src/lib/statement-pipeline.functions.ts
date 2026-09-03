import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { WEB_ENRICHMENT_NOTICE_VERSION } from "./merchant-web-enrichment";

const startInput = z.object({
  accountId: z.string().uuid(),
  bank: z.string().min(1).max(100),
  fileName: z.string().min(1),
  mimeType: z.string(),
  base64: z.string().min(1),
});

/**
 * Reliable path: parse -> normalize -> dedupe -> lookup -> bounded AI
 * classification. The server returns only after every unknown pattern is
 * classified or explicitly reported as unresolved.
 */
export const startStatementUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => startInput.parse(d))
  .handler(async ({ context, data }) => {
    const { getRequestUrl } = await import("@tanstack/react-start/server");
    const { runStatementUpload } = await import("./statement-pipeline.server");
    return runStatementUpload({
      supabase: context.supabase,
      userId: context.userId,
      input: data,
      origin: getRequestUrl().origin,
    });
  });

const uploadIdInput = z.object({ uploadId: z.string().uuid() });

/** Poll fallback for clients without realtime. */
export const getStatementUploadStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => uploadIdInput.parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("statement_uploads")
      .select(
        "id, status, total_transactions, unique_patterns, processed_transactions, result, error",
      )
      .eq("id", data.uploadId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

const correctionInput = z.object({
  corrections: z
    .array(
      z.object({
        normalizedPattern: z.string().min(1),
        payeeName: z.string().min(1).max(120),
        category: z.string().max(80).nullable().optional(),
      }),
    )
    .min(1)
    .max(2000),
});

/**
 * User confirmation loop: household-scoped memory always wins on re-import.
 * Person-like or sensitive data is never promoted to the global dictionary.
 */
export const saveMerchantCorrections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => correctionInput.parse(d))
  .handler(async ({ context, data }) => {
    const { saveCorrections } = await import("./statement-pipeline.server");
    return saveCorrections(context.supabase, context.userId, data.corrections);
  });

const feedbackInput = z.object({
  entityId: z.string().uuid(),
  normalizedFingerprint: z.string().min(1).max(180),
  aliasText: z.string().min(1).max(180),
  relation: z.enum(["positive", "negative"]),
  recurring: z.boolean().default(false),
});

/** Persist explicit merge / do-not-merge feedback as household-only memory. */
export const saveStatementResolutionFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => feedbackInput.parse(d))
  .handler(async ({ context, data }) => {
    const { getHouseholdId } = await import("./household.server");
    const householdId = await getHouseholdId(context);
    const { error } = await (context.supabase as any).from("merchant_aliases").upsert(
      {
        entity_id: data.entityId,
        household_id: householdId,
        alias_text: data.aliasText,
        normalized_fingerprint: data.normalizedFingerprint,
        relation: data.relation,
        source: "user_confirmed",
        resolver_version: "3.0.0",
        confidence: 1,
        recurring: data.recurring,
      },
      { onConflict: "household_id,normalized_fingerprint,entity_id,relation" },
    );
    if (error) throw new Error(error.message);
    return { saved: true, relation: data.relation };
  });

/** Record or revoke the one-time disclosure for Ollama merchant web search. */
export const setStatementWebEnrichmentConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ enabled: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({
        statement_web_enrichment_consent_at: data.enabled ? new Date().toISOString() : null,
        statement_web_enrichment_provider: data.enabled ? "ollama" : null,
        statement_web_enrichment_notice_version: data.enabled
          ? WEB_ENRICHMENT_NOTICE_VERSION
          : null,
      } as any)
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { enabled: data.enabled, provider: data.enabled ? "ollama" : null };
  });

/** Public-safe capability metadata; never exposes the API key. */
export const getStatementWebEnrichmentCapability = createServerFn({ method: "GET" }).handler(
  async () => {
    const { getMerchantWebEnrichmentCapability } = await import("./merchant-web-enrichment.server");
    return getMerchantWebEnrichmentCapability();
  },
);
