import { buildCategoryIndex } from "./category-resolver";
import { classifyPendingPatterns } from "./statement-classify.server";
import type { PendingPattern } from "./statement-pipeline.server";

export const STATEMENT_RESOLVER_VERSION = "3.0.0";

export type StatementQueueMessage = {
  uploadId: string;
  userId: string;
  householdId: string;
  pending: PendingPattern[];
  userCategoryNames: string[];
  llmRuleContext: string[];
  ruleCategoryOverrides: Record<string,string>;
  idempotencyKey: string;
  resolverVersion: string;
  rollout: {
    resolverActive: boolean;
    resolverShadow: boolean;
    webActive: boolean;
    webShadow: boolean;
    baselineResolved: number;
    shadowCandidateResolved: number;
  };
};

export async function enqueueStatementClassification(admin: any, message: StatementQueueMessage) {
  const { data, error } = await admin.rpc("enqueue_statement_classification", {
    payload: message,
  });
  if (error) throw new Error(`Unable to enqueue statement classification: ${error.message}`);
  return Number(data);
}

export async function processOneStatementClassification(admin: any) {
  const { data, error } = await admin.rpc("claim_statement_classification", {
    visibility_seconds: 300,
  });
  if (error) throw new Error(`Unable to claim statement classification: ${error.message}`);
  const claimed = Array.isArray(data) ? data[0] : null;
  if (!claimed) return { processed: false as const };

  const message = claimed.message as StatementQueueMessage;
  const { data: upload } = await admin
    .from("statement_uploads")
    .select("id, status, result, idempotency_key")
    .eq("id", message.uploadId)
    .maybeSingle();
  if (!upload || upload.status === "complete" || upload.status === "cancelled") {
    await admin.rpc("complete_statement_classification", { message_id: claimed.msg_id });
    return { processed: true as const, skipped: true as const };
  }

  const attempt = Number(claimed.read_ct ?? 1);
  await admin
    .from("statement_uploads")
    .update({
      status: attempt > 1 ? "retrying" : "running",
      current_attempt: attempt,
      heartbeat_at: new Date().toISOString(),
      resolver_version: message.resolverVersion,
      provider: "ollama",
      model: process.env.OLLAMA_MODEL ?? null,
    })
    .eq("id", message.uploadId);

  try {
    const { data: categories, error: categoryError } = await admin
      .from("categories")
      .select("id, name, kind, parent_id")
      .eq("household_id", message.householdId);
    if (categoryError) throw new Error(categoryError.message);
    const categoryIndex = buildCategoryIndex(categories ?? []);
    const classified = await classifyPendingPatterns({
      admin,
      uploadId: message.uploadId,
      userId: message.userId,
      pending: message.pending,
      userCategoryNames: message.userCategoryNames,
      llmRuleContext: message.llmRuleContext,
      householdId: message.householdId,
      categoryIndex,
      webEnrichmentEnabled: message.rollout.webActive,
    });
    for(const [pattern,category] of Object.entries(message.ruleCategoryOverrides??{})){
      if(classified.resolved[pattern])classified.resolved[pattern].category=category;
    }
    const previous = (upload.result ?? {}) as Record<string, any>;
    const resolved = { ...(previous.resolved ?? {}), ...classified.resolved };
    const remaining = classified.diagnostics.failedPatterns;
    const { recordStatementRolloutMetric } = await import("./statement-rollout.server");
    await Promise.all([
      recordStatementRolloutMetric(admin, {
        householdId: message.householdId,
        uploadId: message.uploadId,
        feature: "resolver_v2",
        active: message.rollout.resolverActive,
        shadow: message.rollout.resolverShadow,
        baselineResolved: message.rollout.baselineResolved,
        candidateResolved: Math.max(
          Object.keys(resolved).length,
          message.rollout.shadowCandidateResolved,
        ),
        blockingCount: remaining.length,
        failures: remaining.length,
      }),
      recordStatementRolloutMetric(admin, {
        householdId: message.householdId,
        uploadId: message.uploadId,
        feature: "web_enrichment",
        active: message.rollout.webActive,
        shadow: message.rollout.webShadow,
        baselineResolved: message.rollout.baselineResolved,
        candidateResolved: Object.keys(resolved).length,
        blockingCount: remaining.length,
        failures: 0,
      }),
    ]);
    await admin
      .from("statement_uploads")
      .update({
        status: remaining.length ? "partial" : "complete",
        processed_transactions: message.pending.length - remaining.length,
        failed_patterns: remaining.length,
        heartbeat_at: new Date().toISOString(),
        last_progress_at: new Date().toISOString(),
        error: remaining.length ? `${remaining.length} patterns remain unresolved` : null,
        result: {
          ...previous,
          resolved,
          pending: remaining,
          classification: classified.diagnostics,
          rollout: message.rollout,
        },
      })
      .eq("id", message.uploadId);
    await admin.rpc("complete_statement_classification", { message_id: claimed.msg_id });
    return { processed: true as const, uploadId: message.uploadId, remaining: remaining.length };
  } catch (cause) {
    const retryable = attempt < 4;
    await admin
      .from("statement_uploads")
      .update({
        status: retryable ? "retrying" : "failed",
        current_attempt: attempt,
        heartbeat_at: new Date().toISOString(),
        next_retry_at: retryable
          ? new Date(Date.now() + Math.min(15 * 60_000, 30_000 * 2 ** (attempt - 1))).toISOString()
          : null,
        error: String((cause as Error)?.message ?? cause).slice(0, 500),
      })
      .eq("id", message.uploadId);
    if (!retryable) {
      await admin.rpc("complete_statement_classification", { message_id: claimed.msg_id });
    }
    throw cause;
  }
}
