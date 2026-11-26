/**
 * Server-only orchestration for the statement upload pipeline.
 *
 * Synchronous phase (fast, always < a few seconds):
 *   parse -> normalize -> dedupe -> user override lookup -> dictionary lookup
 * Background phase (detached invocation):
 *   batched AI classification of unknown patterns, streamed to the client via
 *   realtime updates on `statement_uploads`.
 */

import { normalizePattern, withConcurrency } from "./statement-normalize";
import { extractRowsFromAOA, parsePdfWithAI, type ExtractedTxn } from "./statement-parse.server";
import { resolveFromLookups, type ResolvedMap } from "./statement-classify.server";
import { lookupPatternCategories } from "./pattern-categories.functions";
import { buildCategoryIndex, resolveCategoryId } from "./category-resolver";
import {
  auditBalanceContinuity,
  extractLedgerControls,
  reconcileLedger,
  type LedgerControlTotals,
  type LedgerReconciliation,
} from "./statement-ledger";
import { resolveEconomicType, type EconomicResolution } from "./statement-economic-resolver";
import type { HdfcNarration } from "./hdfc-narration";
import type { EconomicType } from "./statement-domain";
import { statementSourceFingerprint } from "./statement-source-fingerprint";
import { detectRecurringCandidates } from "./statement-recurring";
import type { RecurringCandidate } from "./statement-recurring";
import { resolveFinancialIdentity, type FinancialIdentity } from "./financial-entities";
import {
  applyEconomicCorrection,
  economicCorrectionKey,
  type EconomicCorrectionRule,
} from "./statement-corrections";
import {
  linkReversalGroups,
  linkExactReferenceOpposites,
  parseNarrationFingerprint,
  transactionTypeForFingerprint,
  type NarrationFingerprint,
} from "./statement-fingerprint";

import { getHouseholdId as getHhId } from "@/lib/household.server";
import {
  applyAiSpendingProfileMappings,
  buildAiSpendingProfileContext,
  collectAiSpendingIdentityTokens,
  normalizeAiSpendingProfile,
} from "./ai-spending-profile";

export type PipelineTxn = ExtractedTxn & {
  pattern: string;
  fingerprint: NarrationFingerprint;
  structuredNarration: HdfcNarration;
  economicType: EconomicType;
  economicResolution: EconomicResolution;
  sourceFingerprint: string;
  originalReference?: string | null;
  recurringCandidateKey?: string;
  recurringCandidate?: RecurringCandidate;
  financialIdentity: FinancialIdentity;
  canonicalEntityId?: string | null;
  processorEntityId?: string | null;
  reversal_group_id?: string;
  transfer_account_id?: string | null;
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
  input: { bank: string; fileName: string; mimeType: string; base64: string; pdfPassword?: string },
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
        // Preserve physical worksheet row numbers for immutable audit lineage.
        blankrows: true,
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
      blankrows: true,
    }) as any[][];
    return { transactions: extractRowsFromAOA(aoa), controls: extractLedgerControls(aoa) };
  }

  if (isPdf) {
    const { createEuriClient } = await import("./euri.server");
    await createEuriClient().checkAvailability();
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
      undefined,
      input.pdfPassword,
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
  balanceContinuity: ReturnType<typeof auditBalanceContinuity>;
  recurringCandidates: RecurringCandidate[];
  archived: boolean;
};

export async function runStatementUpload(opts: {
  supabase: any;
  userId: string;
  input: { accountId: string; bank: string; fileName: string; mimeType: string; base64: string; pdfPassword?: string };
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
    const balanceContinuity = auditBalanceContinuity(extracted);
    if (balanceContinuity.issues.length) {
      const sample = balanceContinuity.issues
        .slice(0, 8)
        .map((issue) => `row ${issue.sourceRowNumber} (delta ${issue.delta.toFixed(2)})`)
        .join(", ");
      throw new Error(
        `Statement running-balance validation failed at ${sample}${balanceContinuity.issues.length > 8 ? ` and ${balanceContinuity.issues.length - 8} more rows` : ""}. Nothing was imported.`,
      );
    }
    if (parsed.controls && !ledger.reconciled) {
      throw new Error(`Statement ledger validation failed: ${ledger.errors.join("; ")}`);
    }

    await supabase
      .from("statement_uploads")
      .update({ status: "deduplicating", total_transactions: extracted.length })
      .eq("id", uploadId);

    const [{ data: profile }, { data: spendingProfileRow }, { data: statementAccount }] = await Promise.all([
      supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
      supabase
        .from("household_ai_spending_profiles")
        .select("profile")
        .eq("household_id", householdId)
        .maybeSingle(),
      supabase
        .from("accounts")
        .select("category")
        .eq("household_id", householdId)
        .eq("id", input.accountId)
        .maybeSingle(),
    ]);
    const spendingProfile = normalizeAiSpendingProfile(spendingProfileRow?.profile);
    const accountHolderTokens = Array.from(
      new Set([
        ...String(profile?.display_name ?? "")
          .split(/\s+/)
          .filter((token) => token.length > 2),
        ...collectAiSpendingIdentityTokens(spendingProfile),
      ]),
    );

    // Normalize + dedupe
    const transactions: PipelineTxn[] = await withConcurrency(
      extracted,
      32,
      async (t) => {
        const pattern = normalizePattern(t.description);
        const direction = t.direction ?? (t.type === "income" ? "credit" : "debit");
        const economicResolution = resolveEconomicType({
          description: t.description,
          direction,
          amount: t.amount,
          accountCategory: statementAccount?.category ?? null,
        });
        return {
          ...t,
          pattern,
          structuredNarration: economicResolution.narration,
          economicType: economicResolution.economicType,
          economicResolution,
          financialIdentity: resolveFinancialIdentity(t.description, economicResolution.narration),
          sourceFingerprint: await statementSourceFingerprint(t),
          originalReference: economicResolution.narration.originalReference,
          fingerprint: await parseNarrationFingerprint({
            raw: t.description,
            direction,
            bankFormat: input.bank,
            scopeSalt: householdId,
            normalizedPattern: pattern,
            accountHolderTokens,
          }),
        };
      },
    );
    for (const transaction of transactions) {
      transaction.type = transactionTypeForFingerprint(transaction.fingerprint);
    }
    linkExactReferenceOpposites(transactions);
    linkReversalGroups(transactions);
    const reversalGroups = new Map<string, PipelineTxn[]>();
    for (const transaction of transactions) {
      if (!transaction.reversal_group_id) continue;
      const members = reversalGroups.get(transaction.reversal_group_id) ?? [];
      members.push(transaction);
      reversalGroups.set(transaction.reversal_group_id, members);
    }
    for (const members of reversalGroups.values()) {
      if (!members.some((transaction) => transaction.economicType === "REVERSAL" || transaction.reversal_group_id?.startsWith("reversal:reference:"))) continue;
      for (const transaction of members) {
        transaction.economicType = "REVERSAL";
        transaction.economicResolution = {
          ...transaction.economicResolution,
          economicType: "REVERSAL",
          confidence: 1,
          source: "deterministic",
          ruleId: "exact-reference-reversal-pair",
          reasons: ["An equal debit and credit share the same exact bank reference."],
          requiresReview: false,
        };
      }
    }
    const recurringCandidates = detectRecurringCandidates(
      transactions.map((transaction, index) => ({
        key: String(index),
        date: transaction.date,
        amount: transaction.amount,
        direction: transaction.direction ?? transaction.fingerprint.direction,
        providerKey:
          transaction.structuredNarration.counterparty ??
          transaction.fingerprint.counterpartyKey ??
          transaction.pattern,
        mandateReference: transaction.structuredNarration.mandateReference,
      })),
    );
    for (const candidate of recurringCandidates) {
      for (const key of candidate.observationKeys) {
        const transaction = transactions[Number(key)];
        if (transaction) {
          transaction.recurringCandidateKey = candidate.key;
          transaction.recurringCandidate = candidate;
        }
      }
    }

    const entityNames = Array.from(
      new Set(
        transactions.flatMap((transaction) =>
          [transaction.financialIdentity.canonicalName, transaction.financialIdentity.processorName].filter(
            (name): name is string => !!name,
          ),
        ),
      ),
    );
    if (entityNames.length) {
      const { data: entityRows } = await supabase
        .from("merchant_entities")
        .select("id,canonical_name")
        .in("canonical_name", entityNames);
      const entityIdByName = new Map<string, string>(
        (entityRows ?? []).map(
          (entity: any): [string, string] => [String(entity.canonical_name), String(entity.id)],
        ),
      );
      for (const transaction of transactions) {
        transaction.canonicalEntityId = transaction.financialIdentity.canonicalName
          ? (entityIdByName.get(transaction.financialIdentity.canonicalName) ?? null)
          : null;
        transaction.processorEntityId = transaction.financialIdentity.processorName
          ? (entityIdByName.get(transaction.financialIdentity.processorName) ?? null)
          : null;
      }
    }

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
    const [
      { data: cats },
      { data: payeeRows },
      { data: transferMemory },
      { data: accountAliasRows },
      { data: economicRuleRows },
    ] = await Promise.all([
      supabase
        .from("categories")
        .select("id, name, kind, parent_id")
        .eq("household_id", householdId),
      supabase
        .from("memorized_payees")
        .select("id, merchant, category_id, aliases")
        .eq("household_id", householdId),
      supabase
        .from("household_transfer_memory")
        .select("normalized_pattern,direction,counterparty_account_id")
        .eq("household_id", householdId)
        .eq("statement_account_id", input.accountId)
        .in("normalized_pattern", patterns),
      (supabase as any)
        .from("account_aliases")
        .select("normalized_alias,account_id")
        .eq("household_id", householdId)
        .eq("alias_type", "narration")
        .eq("verified", true)
        .in("normalized_alias", patterns),
      (supabase as any)
        .from("statement_economic_rules")
        .select("normalized_pattern,direction,economic_type")
        .eq("household_id", householdId)
        .in("normalized_pattern", patterns),
    ]);
    const categories = (cats ?? []) as Array<{
      id: string;
      name: string;
      kind: string;
      parent_id: string | null;
    }>;
    const userCategoryNames = categories.map((c) => c.name);
    const categoryIndex = buildCategoryIndex(categories);
    const rememberedTransferAccount = new Map<string, string>(
      (transferMemory ?? []).map((row: any) => [
        `${row.normalized_pattern}\u0000${row.direction}`,
        String(row.counterparty_account_id),
      ]),
    );
    const accountAliasMap = new Map<string, string>(
      (accountAliasRows ?? []).map((row: any) => [
        String(row.normalized_alias),
        String(row.account_id),
      ]),
    );
    const economicRuleMap = new Map<string, EconomicCorrectionRule>(
      (economicRuleRows ?? []).map(
        (row: any): [string, EconomicCorrectionRule] => [
          economicCorrectionKey(String(row.normalized_pattern), row.direction),
          {
            normalizedPattern: String(row.normalized_pattern),
            direction: row.direction as "debit" | "credit",
            economicType: row.economic_type as EconomicType,
          },
        ],
      ),
    );
    for (const transaction of transactions) {
      const direction = transaction.direction ?? transaction.fingerprint.direction;
      const correction = economicRuleMap.get(economicCorrectionKey(transaction.pattern, direction));
      if (
        correction &&
        (transaction.economicResolution.requiresReview ||
          transaction.economicResolution.source === "direction_fallback" ||
          transaction.economicResolution.source === "unresolved")
      ) {
        transaction.economicResolution = applyEconomicCorrection(
          transaction.economicResolution,
          correction,
        );
        transaction.economicType = transaction.economicResolution.economicType;
      }
      const remembered =
        rememberedTransferAccount.get(
          `${transaction.pattern}\u0000${transaction.fingerprint.direction}`,
        ) ??
        (transaction.fingerprint.counterpartyKind === "self" &&
        transaction.fingerprint.eventType === "transfer"
          ? accountAliasMap.get(transaction.pattern)
          : undefined);
      if (remembered) {
        transaction.type = "transfer";
        transaction.transfer_account_id = remembered;
        transaction.economicResolution = resolveEconomicType({
          description: transaction.description,
          direction: transaction.direction ?? transaction.fingerprint.direction,
          amount: transaction.amount,
          isKnownInternalTransfer: true,
        });
        transaction.economicType = "INTERNAL_TRANSFER";
      }
    }
    const profileResolved = applyAiSpendingProfileMappings(
      transactions,
      spendingProfile,
      categoryIndex,
    );
    const profileMatchedPatterns = new Set(Object.keys(profileResolved));

    // Household rules run immediately after normalization and before every
    // learned lookup or AI classifier. A deterministic match always wins.
    const { applyStatementRules, loadLlmRuleContext } = await import("./rules-engine.server");
    const categoryNamesById = new Map(categories.map((c) => [c.id, c.name]));
    const deterministic = await applyStatementRules(
      supabase,
      householdId,
      transactions,
      categoryNamesById,
    );
    const profileContext = buildAiSpendingProfileContext(spendingProfile, categoryNamesById, 2_000);
    const llmRuleContext = [
      ...profileContext,
      ...(await loadLlmRuleContext(supabase, householdId)),
    ];
    const lookupPatterns = patterns.filter(
      (pattern) =>
        !profileMatchedPatterns.has(pattern) && !deterministic.matchedPatterns.has(pattern),
    );

    // Resolve with pattern-level category lookups
    const lookupResult = await resolveFromLookups(
      supabase,
      userId,
      lookupPatterns,
      householdId,
      rollout.resolver.active,
      categoryIndex,
    );
    const resolved = { ...profileResolved, ...deterministic.resolved, ...lookupResult.resolved };
    const unresolved = lookupResult.unresolved;
    for (const [pattern, category] of Object.entries(deterministic.categoryOverrides)) {
      if (resolved[pattern]) resolved[pattern].category = category;
    }
    let shadowCandidateResolved = Object.keys(resolved).length;
    if (rollout.resolver.shadow && !rollout.resolver.active) {
      const shadowResult = await resolveFromLookups(
        supabase,
        userId,
        patterns,
        householdId,
        true,
        categoryIndex,
      );
      shadowCandidateResolved = Object.keys(shadowResult.resolved).length;
    }

    // Also fetch pattern-level category UUIDs for clusters
    const patternCatMap = await lookupPatternCategories(supabase, householdId, patterns);
    // Enrich resolved entries with pattern-level category UUIDs
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
          balanceContinuity,
          recurringCandidates,
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
          provider: "euri",
          model: process.env.EURI_MODEL ?? "euri-chat-fast",
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
        guardedCategoryIds: spendingProfile.neverAutoAssignCategoryIds,
        requireP2PReview: spendingProfile.requireP2PReview,
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
        const { createEuriClient } = await import("./euri.server");
        // Check connectivity/credentials without a one-shot JSON canary.
        // The classifier itself has retry, batch bisection, and deterministic
        // fallback, so malformed model JSON must reach that recovery path.
        await createEuriClient().checkAvailability();
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
          guardedCategoryIds: spendingProfile.neverAutoAssignCategoryIds,
          requireP2PReview: spendingProfile.requireP2PReview,
          householdId,
          categoryIndex,
          webEnrichmentEnabled: rollout.web.active,
        });
        Object.assign(resolved, classified.resolved);
        for (const [pattern, category] of Object.entries(deterministic.categoryOverrides)) {
          if (resolved[pattern]) resolved[pattern].category = category;
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
              balanceContinuity,
              recurringCandidates,
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
              balanceContinuity,
              recurringCandidates,
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
      balanceContinuity,
      recurringCandidates,
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
