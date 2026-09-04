/**
 * Server-only orchestration for the statement upload pipeline.
 *
 * Synchronous phase (fast, always < a few seconds):
 *   parse -> normalize -> dedupe -> user override lookup -> dictionary lookup
 * Background phase (detached invocation):
 *   batched AI classification of unknown patterns, streamed to the client via
 *   realtime updates on `statement_uploads`.
 */

import { normalizePattern } from "./statement-normalize";
import { extractRowsFromAOA, parsePdfWithAI, type ExtractedTxn } from "./statement-parse.server";
import { resolveFromLookups, type ResolvedMap } from "./statement-classify.server";
import { lookupPatternCategories } from "./pattern-categories.functions";
import { buildCategoryIndex, resolveCategoryId } from "./category-resolver";
import {
  extractLedgerControls,
  reconcileLedger,
  type LedgerControlTotals,
  type LedgerReconciliation,
} from "./statement-ledger";
import {
  linkReversalGroups,
  parseNarrationFingerprint,
  transactionTypeForFingerprint,
  type NarrationFingerprint,
} from "./statement-fingerprint";

import { getHouseholdId as getHhId } from "@/lib/household.server";

export type PipelineTxn = ExtractedTxn & {
  pattern: string;
  fingerprint: NarrationFingerprint;
  reversal_group_id?: string;
};
type ParsedStatement = { transactions: ExtractedTxn[]; controls: LedgerControlTotals | null };

export type PendingPattern = {
  pattern: string;
  samples: string[];
  type: string;
  count: number;
  counterpartyKind?: string;
};

async function getHouseholdId(supabase: any, userId: string): Promise<string> {
  return getHhId({ supabase, userId });
}

async function parseFile(
  supabase: any,
  householdId: string,
  input: { bank: string; fileName: string; mimeType: string; base64: string },
): Promise<ParsedStatement> {
  const lower = input.fileName.toLowerCase();
  const isPdf = input.mimeType === "application/pdf" || lower.endsWith(".pdf");
  const isExcel =
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls") ||
    input.mimeType.includes("spreadsheet") ||
    input.mimeType.includes("excel");
  const isCsv = lower.endsWith(".csv") || lower.endsWith(".txt") || input.mimeType.includes("csv");
  const isOfx = lower.endsWith(".ofx") || lower.endsWith(".qfx");
  const isQif = lower.endsWith(".qif");

  if (isOfx || isQif) {
    const { parseOfx, parseQif } = await import("./statement-parse-ofx.server");
    const text = Buffer.from(input.base64, "base64").toString("utf-8");
    return { transactions: isOfx ? parseOfx(text) : parseQif(text), controls: null };
  }

  if (isExcel) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(Buffer.from(input.base64, "base64"), { type: "buffer", cellDates: false });
    for (const name of wb.SheetNames) {
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name]!, {
        header: 1,
        raw: true,
        blankrows: false,
      }) as any[][];
      const rows = extractRowsFromAOA(aoa);
      if (rows.length) return { transactions: rows, controls: extractLedgerControls(aoa) };
    }
    return { transactions: [], controls: null };
  }

  if (isCsv) {
    const XLSX = await import("xlsx");
    const text = Buffer.from(input.base64, "base64").toString("utf-8");
    const wb = XLSX.read(text, { type: "string" });
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]!]!, {
      header: 1,
      raw: true,
      blankrows: false,
    }) as any[][];
    return { transactions: extractRowsFromAOA(aoa), controls: extractLedgerControls(aoa) };
  }

  if (isPdf) {
    const { createOllamaClient } = await import("./ollama.server");
    await createOllamaClient().preflight();
    const { data: cats } = await supabase
      .from("categories")
      .select("name")
      .eq("household_id", householdId);
    const { transactions } = await parsePdfWithAI(
      input.base64,
      input.fileName,
      input.bank,
      (cats ?? []).map((c: any) => c.name).join(", "),
      "",
    );
    return { transactions, controls: null };
  }

  throw new Error("Unsupported file type. Upload CSV, XLS, XLSX, PDF, OFX or QIF.");
}

export type UploadResult = {
  uploadId: string;
  importToken: string;
  transactions: PipelineTxn[];
  resolved: ResolvedMap;
  pending: PendingPattern[];
  categories: Array<{ id: string; name: string; kind: string; parent_id: string | null }>;
  existingPayees: Array<{ id: string; merchant: string; category_id: string | null }>;
  patternCategories: Record<string, string>;
  classificationStatus: "queued" | "complete" | "partial" | "failed";
  classificationError: string | null;
  ledger: LedgerReconciliation;
  archived: boolean;
};

export async function runStatementUpload(opts: {
  supabase: any;
  userId: string;
  input: { accountId: string; bank: string; fileName: string; mimeType: string; base64: string };
  origin: string;
  /** Re-parse of an existing archived upload: reuse the row, skip re-archiving. */
  existingUploadId?: string;
}): Promise<UploadResult> {
  const { supabase, userId, input, origin } = opts;
  const householdId = await getHouseholdId(supabase, userId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { loadStatementRollouts } = await import("./statement-rollout.server");
  const rollout = await loadStatementRollouts(supabaseAdmin, householdId);
  const jobToken = crypto.randomUUID();
  const importToken = crypto.randomUUID();

  let uploadId: string;
  if (opts.existingUploadId) {
    uploadId = opts.existingUploadId;
    const { error: upErr } = await supabase
      .from("statement_uploads")
      .update({
        status: "parsing",
        error: null,
        import_token: importToken,
        result: { job_token: jobToken },
      })
      .eq("id", uploadId);
    if (upErr) throw new Error(upErr.message);
  } else {
    const { data: uploadRow, error: insertError } = await supabase
      .from("statement_uploads")
      .insert({
        user_id: userId,
        household_id: householdId,
        filename: input.fileName,
        status: "parsing",
        import_token: importToken,
        mime_type: input.mimeType || null,
        result: { job_token: jobToken },
      })
      .select("id")
      .single();
    if (insertError) throw new Error(insertError.message);
    uploadId = uploadRow.id as string;
  }

  // Optional private archive of the original file (audit + re-parse).
  let archived = !!opts.existingUploadId;
  if (!opts.existingUploadId) {
    const { loadArchiveSettings, archiveOriginal } = await import("./statement-archive.server");
    const settings = await loadArchiveSettings(supabase, householdId);
    if (settings.archive_enabled) {
      const path = await archiveOriginal({
        supabase,
        householdId,
        uploadId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        base64: input.base64,
        retentionDays: settings.retention_days,
      });
      archived = !!path;
    }
  }

  const fail = async (message: string) => {
    await supabase
      .from("statement_uploads")
      .update({ status: "failed", error: message.slice(0, 500) })
      .eq("id", uploadId);
  };

  try {
    const parsed = await parseFile(supabase, householdId, input);
    const extracted = parsed.transactions;
    if (!extracted.length) throw new Error("No transactions found in this file.");
    const ledger = reconcileLedger(extracted, parsed.controls);
    if (parsed.controls && !ledger.reconciled) {
      throw new Error(`Statement ledger validation failed: ${ledger.errors.join("; ")}`);
    }

    await supabase
      .from("statement_uploads")
      .update({ status: "deduplicating", total_transactions: extracted.length })
      .eq("id", uploadId);

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle();
    const accountHolderTokens = String(profile?.display_name ?? "")
      .split(/\s+/)
      .filter((token) => token.length > 2);

    // Normalize + dedupe
    const transactions: PipelineTxn[] = await Promise.all(
      extracted.map(async (t) => {
        const pattern = normalizePattern(t.description);
        return {
          ...t,
          pattern,
          fingerprint: await parseNarrationFingerprint({
            raw: t.description,
            direction: t.type === "income" ? "credit" : "debit",
            bankFormat: input.bank,
            scopeSalt: householdId,
            normalizedPattern: pattern,
            accountHolderTokens,
          }),
        };
      }),
    );
    for (const transaction of transactions) {
      transaction.type = transactionTypeForFingerprint(transaction.fingerprint);
    }
    linkReversalGroups(transactions);

    const groups = new Map<string, PendingPattern>();
    for (const t of transactions) {
      const g = groups.get(t.pattern);
      if (g) {
        g.count += 1;
        if (g.samples.length < 3 && !g.samples.includes(t.description))
          g.samples.push(t.description);
      } else {
        groups.set(t.pattern, {
          pattern: t.pattern,
          samples: [t.description],
          type: t.type,
          count: 1,
          counterpartyKind: t.fingerprint.counterpartyKind,
        });
      }
    }
    const patterns = Array.from(groups.keys());

    // Fetch categories + payees BEFORE resolve (need CategoryIndex for enrichment)
    const [{ data: cats }, { data: payeeRows }] = await Promise.all([
      supabase
        .from("categories")
        .select("id, name, kind, parent_id")
        .eq("household_id", householdId),
      supabase
        .from("memorized_payees")
        .select("id, merchant, category_id, aliases")
        .eq("household_id", householdId),
    ]);
    const categories = (cats ?? []) as Array<{
      id: string;
      name: string;
      kind: string;
      parent_id: string | null;
    }>;
    const userCategoryNames = categories.map((c) => c.name);

    // Household rules run immediately after normalization and before every
    // learned lookup or AI classifier. A deterministic match always wins.
    const { applyStatementRules, loadLlmRuleContext } = await import('./rules-engine.server');
    const categoryNamesById = new Map(categories.map((c) => [c.id, c.name]));
    const deterministic = await applyStatementRules(supabase, householdId, transactions, categoryNamesById);
    const llmRuleContext = await loadLlmRuleContext(supabase, householdId);
    const lookupPatterns = patterns.filter((pattern) => !deterministic.matchedPatterns.has(pattern));

    // Resolve with pattern-level category lookups
    const lookupResult = await resolveFromLookups(
      supabase,
      userId,
      lookupPatterns,
      householdId,
      rollout.resolver.active,
    );
    const resolved = { ...deterministic.resolved, ...lookupResult.resolved };
    const unresolved = lookupResult.unresolved;
    for(const [pattern,category] of Object.entries(deterministic.categoryOverrides)){
      if(resolved[pattern])resolved[pattern].category=category;
    }
    let shadowCandidateResolved = Object.keys(resolved).length;
    if (rollout.resolver.shadow && !rollout.resolver.active) {
      const shadowResult = await resolveFromLookups(supabase, userId, patterns, householdId, true);
      shadowCandidateResolved = Object.keys(shadowResult.resolved).length;
    }

    // Also fetch pattern-level category UUIDs for clusters
    const patternCatMap = await lookupPatternCategories(supabase, householdId, patterns);
    // Enrich resolved entries with pattern-level category UUIDs
    const categoryIndex = buildCategoryIndex(categories);
    for (const [pattern, info] of patternCatMap) {
      if (resolved[pattern] && !resolved[pattern].category) {
        const catName = categoryIndex.nameById.get(info.categoryId);
        if (catName) resolved[pattern].category = catName;
      }
    }

    const pending = unresolved.map((p) => groups.get(p)!).filter(Boolean);
    const patternCategories = Object.fromEntries(
      Array.from(patternCatMap, ([pattern, info]) => [pattern, info.categoryId]),
    );

    const needsAi = pending.length > 0;
    await supabase
      .from("statement_uploads")
      .update({
        status: needsAi ? "classifying" : "complete",
        unique_patterns: patterns.length,
        processed_transactions: needsAi ? 0 : patterns.length,
        result: {
          job_token: jobToken,
          resolved,
          pending: pending.map((p) => p.pattern),
          ledger,
        },
      })
      .eq("id", uploadId);

    let classificationStatus: "queued" | "complete" | "partial" | "failed" = "complete";
    let classificationError: string | null = null;
    let remainingPending = pending;

    // An unawaited self-fetch is not durable in serverless runtimes. Complete
    // classification inside this request so every pattern has a final state.
    if (needsAi && process.env.STATEMENT_QUEUE_ENABLED === "true") {
      const { enqueueStatementClassification, STATEMENT_RESOLVER_VERSION } =
        await import("./statement-queue.server");
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(`${uploadId}\u0000${patterns.sort().join("\u0000")}`),
      );
      const fingerprint = Array.from(new Uint8Array(digest).slice(0, 16), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      const idempotencyKey = `${uploadId}:${STATEMENT_RESOLVER_VERSION}:${fingerprint}`;
      await (supabaseAdmin as any)
        .from("statement_uploads")
        .update({
          status: "queued",
          resolver_version: STATEMENT_RESOLVER_VERSION,
          provider: "ollama",
          model: process.env.OLLAMA_MODEL ?? null,
          idempotency_key: idempotencyKey,
          failed_patterns: 0,
          current_attempt: 0,
          heartbeat_at: new Date().toISOString(),
        })
        .eq("id", uploadId);
      await enqueueStatementClassification(supabaseAdmin, {
        uploadId,
        userId,
        householdId,
        pending,
        userCategoryNames,
        llmRuleContext,
        ruleCategoryOverrides: deterministic.categoryOverrides,
        idempotencyKey,
        resolverVersion: STATEMENT_RESOLVER_VERSION,
        rollout: {
          resolverActive: rollout.resolver.active,
          resolverShadow: rollout.resolver.shadow,
          webActive: rollout.web.active,
          webShadow: rollout.web.shadow,
          baselineResolved: Object.keys(resolved).length,
          shadowCandidateResolved,
        },
      });
      classificationStatus = "queued";
    } else if (needsAi) {
      try {
        const { createOllamaClient } = await import("./ollama.server");
        await createOllamaClient().preflight();
        const { classifyPendingPatterns } = await import("./statement-classify.server");
        const classified = await classifyPendingPatterns({
          // Local/synchronous imports already carry the authenticated user
          // session. Using it avoids requiring a service-role key for normal
          // household-scoped progress and learning writes.
          admin: supabase,
          uploadId,
          userId,
          pending,
          userCategoryNames,
          llmRuleContext,
          householdId,
          categoryIndex,
          webEnrichmentEnabled: rollout.web.active,
        });
        Object.assign(resolved, classified.resolved);
        for(const [pattern,category] of Object.entries(deterministic.categoryOverrides)){
          if(resolved[pattern])resolved[pattern].category=category;
        }
        const failedSet = new Set(classified.diagnostics.failedPatterns);
        remainingPending = pending.filter((item) => failedSet.has(item.pattern));
        if (remainingPending.length) classificationStatus = "partial";

        await supabase
          .from("statement_uploads")
          .update({
            status: remainingPending.length ? "partial" : "complete",
            processed_transactions: Object.keys(resolved).length,
            error: remainingPending.length
              ? `${remainingPending.length} patterns remain unresolved`
              : null,
            result: {
              job_token: jobToken,
              resolved,
              pending: classified.diagnostics.failedPatterns,
              classification: classified.diagnostics,
              rollout,
              ledger,
            },
          })
          .eq("id", uploadId);
      } catch (error: any) {
        classificationStatus = "failed";
        classificationError = String(error?.message ?? error).slice(0, 500);
        await supabase
          .from("statement_uploads")
          .update({
            status: "failed",
            error: classificationError,
            result: {
              job_token: jobToken,
              resolved,
              pending: pending.map((item) => item.pattern),
              ledger,
            },
          })
          .eq("id", uploadId);
      }
    }

    if (classificationStatus !== "queued") {
      const { recordStatementRolloutMetric } = await import("./statement-rollout.server");
      const baselineResolved = patterns.length - pending.length;
      const candidateResolved = Math.max(Object.keys(resolved).length, shadowCandidateResolved);
      const blockingCount = remainingPending.length;
      await Promise.all([
        recordStatementRolloutMetric(supabase, {
          householdId,
          uploadId,
          feature: "resolver_v2",
          active: rollout.resolver.active,
          shadow: rollout.resolver.shadow,
          baselineResolved,
          candidateResolved,
          blockingCount,
          failures: classificationStatus === "failed" ? blockingCount : 0,
        }),
        recordStatementRolloutMetric(supabase, {
          householdId,
          uploadId,
          feature: "web_enrichment",
          active: rollout.web.active,
          shadow: rollout.web.shadow,
          baselineResolved,
          candidateResolved,
          blockingCount,
          failures: 0,
        }),
      ]);
    }

    return {
      uploadId,
      importToken,
      archived,
      transactions,
      resolved,
      pending: remainingPending,
      categories: categories as any,
      existingPayees: (payeeRows ?? []) as any,
      patternCategories,
      classificationStatus,
      classificationError,
      ledger,
    };
  } catch (e: any) {
    await fail(e?.message ?? "Statement processing failed");
    throw e;
  }
}

/** Re-runs the whole pipeline against an archived original file. */
export async function reparseStatement(opts: {
  supabase: any;
  userId: string;
  uploadId: string;
  accountId: string;
  bank: string;
  origin: string;
}): Promise<UploadResult> {
  const { supabase, uploadId } = opts;
  const { data: row, error } = await supabase
    .from("statement_uploads")
    .select("filename, mime_type, storage_path")
    .eq("id", uploadId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row?.storage_path)
    throw new Error("The original file is no longer archived for this import.");

  const { downloadArchived } = await import("./statement-archive.server");
  const file = await downloadArchived(supabase, row.storage_path);
  if (!file) throw new Error("Could not read the archived file.");

  return runStatementUpload({
    supabase: opts.supabase,
    userId: opts.userId,
    origin: opts.origin,
    existingUploadId: uploadId,
    input: {
      accountId: opts.accountId,
      bank: opts.bank,
      fileName: row.filename as string,
      mimeType: (row.mime_type as string) || file.mimeType,
      base64: file.base64,
    },
  });
}

export async function saveCorrections(
  supabase: any,
  userId: string,
  corrections: Array<{ normalizedPattern: string; payeeName: string; category?: string | null }>,
) {
  const { cleanPayeeDisplayName } = await import("./statement-normalize");
  const overrides = corrections.map((c) => ({
    user_id: userId,
    normalized_pattern: c.normalizedPattern,
    payee_name: cleanPayeeDisplayName(c.payeeName),
    category: c.category ?? null,
  }));

  const { error } = await supabase
    .from("user_payee_overrides")
    .upsert(overrides, { onConflict: "user_id,normalized_pattern" });
  if (error) throw new Error(error.message);

  // Promote confirmed names into the shared dictionary (best effort).
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Also persist to payee_pattern_categories (household-scoped)
    // Requires householdId — derive from userId
    const householdId = await getHhId({ supabase, userId });
    if (householdId) {
      const { data: allCats } = await supabase
        .from("categories")
        .select("id, name, kind, parent_id")
        .eq("household_id", householdId);
      if (allCats?.length) {
        const catIndex = buildCategoryIndex(allCats);
        const { savePatternCategories: savePPC } = await import("./pattern-categories.functions");
        const entries = corrections
          .filter((c) => c.category)
          .map((c) => {
            return {
              pattern: c.normalizedPattern,
              categoryId: resolveCategoryId(c.category, catIndex),
              categoryName: c.category,
              source: "learned" as const,
              confidence: 0.95,
            };
          })
          .filter((e) => e.categoryId);
        if (entries.length) {
          await savePPC(supabaseAdmin, householdId, entries);
        }
      }
    }
  } catch {
    // dictionary + pattern promotion is non-critical
  }

  return { saved: corrections.length };
}
