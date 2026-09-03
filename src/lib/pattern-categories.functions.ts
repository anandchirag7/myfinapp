/**
 * Server functions for the pattern-level category system.
 *
 * Manages payee_pattern_categories — the hybrid global + household-scoped
 * table that maps normalized patterns to category UUIDs.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getHouseholdId } from "@/lib/household.server";
import { chunk } from "./statement-normalize";

// ---------------------------------------------------------------------------
// Batch lookup: given patterns, return Map<pattern, category_id>
// ---------------------------------------------------------------------------

/**
 * Look up pattern-level category mappings.
 * Resolution: household-specific row wins over global row.
 *
 * Returns a Map<normalizedPattern, { categoryId, source }>.
 */
export async function lookupPatternCategories(
  supabase: any,
  householdId: string,
  patterns: string[],
): Promise<Map<string, { categoryId: string; categoryName: string | null; source: string }>> {
  const result = new Map<
    string,
    { categoryId: string; categoryName: string | null; source: string }
  >();
  if (!patterns.length) return result;

  // Query in chunks to avoid Supabase URL length limits
  for (const part of chunk(patterns, 300)) {
    const { data, error } = await supabase
      .from("payee_pattern_categories")
      .select("normalized_pattern, category_id, category_name, source, household_id")
      .in("normalized_pattern", part)
      .eq("is_active", true)
      .or(`household_id.is.null,household_id.eq.${householdId}`);

    if (error) {
      console.error("lookupPatternCategories error:", error.message);
      continue;
    }

    // Group by pattern, prefer household-specific over global
    const byPattern = new Map<string, (typeof data)[0]>();
    for (const row of data ?? []) {
      const existing = byPattern.get(row.normalized_pattern);
      // Household row always wins over global
      if (!existing || (row.household_id && !existing.household_id)) {
        byPattern.set(row.normalized_pattern, row);
      }
    }

    for (const [pattern, row] of byPattern) {
      if (row.category_id) {
        result.set(pattern, {
          categoryId: row.category_id,
          categoryName: row.category_name,
          source: row.source,
        });
      }
    }
  }

  return result;
}

/**
 * Look up pattern-level category names for patterns that have global rows
 * but no category_id (global rows store category_name, not UUID).
 * Used to feed into the fuzzy resolver.
 */
export async function lookupPatternCategoryNames(
  supabase: any,
  householdId: string,
  patterns: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!patterns.length) return result;

  for (const part of chunk(patterns, 300)) {
    const { data } = await supabase
      .from("payee_pattern_categories")
      .select("normalized_pattern, category_name, household_id")
      .in("normalized_pattern", part)
      .eq("is_active", true)
      .not("category_name", "is", null)
      .or(`household_id.is.null,household_id.eq.${householdId}`);

    for (const row of data ?? []) {
      const existing = result.has(row.normalized_pattern);
      // Household row wins
      if (!existing || row.household_id) {
        if (row.category_name) result.set(row.normalized_pattern, row.category_name);
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Bulk upsert: persist pattern→category mappings (household-scoped)
// ---------------------------------------------------------------------------

export type PatternCategoryEntry = {
  pattern: string;
  categoryId: string | null;
  categoryName?: string | null;
  payeeId?: string | null;
  sampleDescription?: string | null;
  source: string;
  confidence?: number;
};

/**
 * Bulk upsert pattern→category mappings into the household-scoped layer.
 * Never touches global rows — user changes only affect their household.
 */
export async function savePatternCategories(
  supabase: any,
  householdId: string,
  entries: PatternCategoryEntry[],
): Promise<void> {
  if (!entries.length) return;

  const patterns = entries.map((entry) => entry.pattern);
  const existingRows: Array<{ id: string; normalized_pattern: string }> = [];
  for (const patternChunk of chunk(patterns, 300)) {
    const { data, error: lookupError } = await supabase
      .from("payee_pattern_categories")
      .select("id, normalized_pattern")
      .eq("household_id", householdId)
      .in("normalized_pattern", patternChunk);
    if (lookupError) {
      console.error("savePatternCategories lookup error:", lookupError.message);
      return;
    }
    existingRows.push(...(data ?? []));
  }
  const idByPattern = new Map(
    (existingRows ?? []).map((row: any) => [row.normalized_pattern, row.id]),
  );

  const rows = entries.map((e) => ({
    ...(idByPattern.has(e.pattern) ? { id: idByPattern.get(e.pattern) } : {}),
    household_id: householdId,
    normalized_pattern: e.pattern,
    category_id: e.categoryId,
    category_name: e.categoryName ?? null,
    payee_id: e.payeeId ?? null,
    sample_description: e.sampleDescription ?? null,
    source: e.source,
    confidence: e.confidence ?? 0.7,
    is_active: true,
  }));

  // Upsert in chunks
  for (const part of chunk(rows, 200)) {
    const { error } = await supabase.from("payee_pattern_categories").upsert(part, {
      onConflict: "id",
      ignoreDuplicates: false,
    });
    if (error) {
      console.error("savePatternCategories error:", error.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Auto-approve threshold (per-user setting)
// ---------------------------------------------------------------------------

/**
 * Get the user's auto-approve threshold (0.0 – 1.0).
 * Falls back to 0.80 if not set.
 */
export async function getAutoApproveThreshold(supabase: any, userId: string): Promise<number> {
  const { data } = await supabase
    .from("profiles")
    .select("auto_approve_threshold")
    .eq("id", userId)
    .maybeSingle();

  return Number(data?.auto_approve_threshold ?? 0.8);
}

// ---------------------------------------------------------------------------
// Server functions (for direct client calls)
// ---------------------------------------------------------------------------

export const listPatternsByPayee = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ payeeId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const householdId = await getHouseholdId(context);
    const { data: patterns, error } = await context.supabase
      .from("payee_pattern_categories")
      .select(
        "id, normalized_pattern, sample_description, category_id, category_name, source, confidence, is_active",
      )
      .eq("payee_id", data.payeeId)
      .or(`household_id.is.null,household_id.eq.${householdId}`)
      .order("normalized_pattern");
    if (error) throw error;
    return patterns ?? [];
  });

export const updatePatternCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        normalizedPattern: z.string().min(1),
        categoryId: z.string().uuid().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const householdId = await getHouseholdId(context);
    const { data: existing } = await context.supabase
      .from("payee_pattern_categories")
      .select("id")
      .eq("household_id", householdId)
      .eq("normalized_pattern", data.normalizedPattern)
      .maybeSingle();
    const payload = {
      ...(existing?.id ? { id: existing.id } : {}),
      household_id: householdId,
      normalized_pattern: data.normalizedPattern,
      category_id: data.categoryId,
      source: "manual",
      confidence: 1.0,
      is_active: true,
    };
    const { error } = await context.supabase
      .from("payee_pattern_categories")
      .upsert(payload, { onConflict: "id" });
    if (error) throw error;
    return { ok: true };
  });

export const getImportSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles")
      .select("auto_approve_threshold")
      .eq("id", context.userId)
      .maybeSingle();
    return {
      autoApproveThreshold: Number(data?.auto_approve_threshold ?? 0.8),
    };
  });

export const updateImportSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        autoApproveThreshold: z.number().min(0).max(1),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ auto_approve_threshold: data.autoApproveThreshold })
      .eq("id", context.userId);
    if (error) throw error;
    return { ok: true };
  });
