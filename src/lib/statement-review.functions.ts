/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getHouseholdId } from "@/lib/household.server";
import { ECONOMIC_TYPES } from "./statement-domain";

export const listStatementReviewItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const householdId = await getHouseholdId(context);
    const { data, error } = await (context.supabase as any)
      .from("statement_review_items")
      .select(
        "id,review_type,group_key,priority,prompt,options,status,affected_raw_transaction_ids,created_at",
      )
      .eq("household_id", householdId)
      .eq("status", "open")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(100);
    if (error) throw error;
    return data ?? [];
  });

const answerInput = z.object({
  itemId: z.string().uuid(),
  answer: z.string().min(1).max(100),
});

export const answerStatementReviewItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value: unknown) => answerInput.parse(value))
  .handler(async ({ context, data }) => {
    const householdId = await getHouseholdId(context);
    const { data: item, error: itemError } = await (context.supabase as any)
      .from("statement_review_items")
      .select("id,review_type,affected_raw_transaction_ids,status")
      .eq("id", data.itemId)
      .eq("household_id", householdId)
      .maybeSingle();
    if (itemError) throw itemError;
    if (!item || item.status !== "open") throw new Error("This review item is no longer open.");

    const rawIds = Array.isArray(item.affected_raw_transaction_ids)
      ? item.affected_raw_transaction_ids.map(String)
      : [];
    const transactionIds = new Set<string>();
    if (rawIds.length) {
      const { data: direct, error: directError } = await context.supabase
        .from("transactions")
        .select("id,currency")
        .eq("household_id", householdId)
        .in("raw_transaction_id", rawIds);
      if (directError) throw directError;
      for (const row of direct ?? []) transactionIds.add(String(row.id));

      const { data: rawRows, error: rawError } = await (context.supabase as any)
        .from("statement_raw_transactions")
        .select("source_fingerprint")
        .eq("household_id", householdId)
        .in("id", rawIds);
      if (rawError) throw rawError;
      const fingerprints = (rawRows ?? []).map((row: any) => String(row.source_fingerprint));
      if (fingerprints.length) {
        const { data: evidence, error: evidenceError } = await (context.supabase as any)
          .from("transaction_statement_evidence")
          .select("transaction_id")
          .eq("household_id", householdId)
          .in("row_fingerprint", fingerprints);
        if (evidenceError) throw evidenceError;
        for (const row of evidence ?? []) transactionIds.add(String(row.transaction_id));
      }
    }
    const ids = [...transactionIds];

    if (item.review_type === "economic_type") {
      if (!ECONOMIC_TYPES.includes(data.answer as (typeof ECONOMIC_TYPES)[number])) {
        throw new Error("Unsupported economic type.");
      }
      if (ids.length) {
        const { error } = await context.supabase
          .from("transactions")
          .update({
            economic_type: data.answer,
            classification_confidence: 1,
            classification_source: "review_inbox",
            classification_reasons: ["The user answered a grouped statement-review item."],
            interpretation_version: "financial-events-v1",
          })
          .eq("household_id", householdId)
          .in("id", ids);
        if (error) throw error;
      }
    } else if (item.review_type === "destination_card") {
      const { data: card, error: cardError } = await context.supabase
        .from("accounts")
        .select("id")
        .eq("id", data.answer)
        .eq("household_id", householdId)
        .eq("category", "credit_card")
        .maybeSingle();
      if (cardError) throw cardError;
      if (!card) throw new Error("Select an owned credit-card account.");
      if (ids.length) {
        const { data: sources, error: sourceError } = await (context.supabase as any)
          .from("transactions")
          .select(
            "id,account_id,amount,txn_date,account:accounts!transactions_account_id_fkey(currency)",
          )
          .eq("household_id", householdId)
          .in("id", ids);
        if (sourceError) throw sourceError;
        if (
          (sources ?? []).some(
            (source: any) => (source.account?.currency ?? "INR") !== (card.currency ?? "INR"),
          )
        ) {
          throw new Error(
            "Cross-currency card payments need both currency amounts and cannot be linked automatically.",
          );
        }
        const targetCandidateBySource = new Map<string, string | null>();
        for (const source of sources ?? []) {
          const center = new Date(`${source.txn_date}T00:00:00Z`);
          const from = new Date(center.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
          const to = new Date(center.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
          const { data: targetCandidates, error: targetError } = await (context.supabase as any)
            .from("credit_card_payment_allocations")
            .select("id")
            .eq("household_id", householdId)
            .eq("destination_card_account_id", data.answer)
            .eq("currency", card.currency ?? "INR")
            .eq("status", "unresolved")
            .not("target_transaction_id", "is", null)
            .eq("amount", source.amount)
            .gte("payment_date", from)
            .lte("payment_date", to);
          if (targetError) throw targetError;
          if ((targetCandidates?.length ?? 0) > 1) {
            throw new Error(
              "More than one card-statement credit matches this payment. Review the individual rows before linking them.",
            );
          }
          targetCandidateBySource.set(source.id, targetCandidates?.[0]?.id ?? null);
        }

        for (const source of sources ?? []) {
          const targetAllocationId = targetCandidateBySource.get(source.id) ?? null;

          if (targetAllocationId) {
            // Both physical statement legs exist, so keep them as separate
            // postings and link them. Converting the debit to a transfer here
            // would credit the card twice.
            const { error: sourceUpdateError } = await context.supabase
              .from("transactions")
              .update({
                economic_type: "CREDIT_CARD_PAYMENT",
                classification_confidence: 1,
                classification_source: "review_inbox_matched",
                classification_reasons: [
                  "The user selected the card and a unique statement credit matched.",
                ],
                interpretation_version: "financial-events-v1",
              })
              .eq("id", source.id)
              .eq("household_id", householdId);
            if (sourceUpdateError) throw sourceUpdateError;
            const { error: targetAllocationError } = await (context.supabase as any)
              .from("credit_card_payment_allocations")
              .update({
                source_account_id: source.account_id,
                source_transaction_id: source.id,
                status: "matched",
                match_method: "account_amount_date",
                confidence: 0.97,
                updated_at: new Date().toISOString(),
              })
              .eq("id", targetAllocationId)
              .eq("household_id", householdId);
            if (targetAllocationError) throw targetAllocationError;
            const { error: redundantError } = await (context.supabase as any)
              .from("credit_card_payment_allocations")
              .delete()
              .eq("household_id", householdId)
              .eq("source_transaction_id", source.id)
              .is("target_transaction_id", null);
            if (redundantError) throw redundantError;
          } else {
            const { error: updateError } = await context.supabase
              .from("transactions")
              .update({
                type: "transfer",
                transfer_account_id: data.answer,
                economic_type: "CREDIT_CARD_PAYMENT",
                classification_confidence: 1,
                classification_source: "review_inbox",
                classification_reasons: ["The user selected the owned destination card."],
                interpretation_version: "financial-events-v1",
              })
              .eq("id", source.id)
              .eq("household_id", householdId);
            if (updateError) throw updateError;
            const { error: allocationError } = await (context.supabase as any)
              .from("credit_card_payment_allocations")
              .update({
                destination_card_account_id: data.answer,
                canonical_transaction_id: source.id,
                source_transaction_id: null,
                status: "provisional",
                match_method: "user_selected",
                confidence: 1,
                updated_at: new Date().toISOString(),
              })
              .eq("household_id", householdId)
              .eq("source_transaction_id", source.id);
            if (allocationError) throw allocationError;
          }
        }
        const accountIds = new Set<string>([data.answer]);
        for (const source of sources ?? []) accountIds.add(String(source.account_id));
        for (const accountId of accountIds) {
          const { error } = await context.supabase.rpc("recompute_account_balance", {
            p_household_id: householdId,
            p_account_id: accountId,
          });
          if (error) throw error;
        }
      }
    } else {
      throw new Error("This review type is not answerable here yet.");
    }

    const { error: closeError } = await (context.supabase as any)
      .from("statement_review_items")
      .update({
        status: "answered",
        answer: { value: data.answer },
        answered_by: context.userId,
        answered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.itemId)
      .eq("household_id", householdId)
      .eq("status", "open");
    if (closeError) throw closeError;
    return { ok: true, affectedTransactions: ids.length };
  });

export const dismissStatementReviewItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value: unknown) => z.object({ itemId: z.string().uuid() }).parse(value))
  .handler(async ({ context, data }) => {
    const householdId = await getHouseholdId(context);
    const { error } = await (context.supabase as any)
      .from("statement_review_items")
      .update({
        status: "dismissed",
        answered_by: context.userId,
        answered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.itemId)
      .eq("household_id", householdId)
      .eq("status", "open");
    if (error) throw error;
    return { ok: true };
  });
