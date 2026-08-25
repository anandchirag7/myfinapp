import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getHouseholdId } from "@/lib/household.server";
import { normalizePattern, lookupKeys } from "@/lib/statement-normalize";

const payeeShape = {
  merchant: z.string().min(1).max(200),
  merchant_type: z.string().max(80).nullable().optional(),
  website: z.string().max(300).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  txn_type: z.enum(["expense", "income", "transfer", "deposit", "withdrawal", "investment"]).default("expense"),
  category_id: z.string().uuid().nullable().optional(),
  tags: z.array(z.string()).default([]),
  memo: z.string().max(500).nullable().optional(),
  default_amount: z.number().nullable().optional(),
  amount_tolerance_pct: z.number().min(0).max(100).nullable().optional(),
  currency: z.string().default("INR"),
  payment_method: z.string().max(80).nullable().optional(),
  account_id: z.string().uuid().nullable().optional(),
  transfer_account_id: z.string().uuid().nullable().optional(),
  splits: z.array(z.any()).default([]),
  auto_categorize: z.boolean().default(true),
  auto_memo: z.boolean().default(false),
  auto_tags: z.boolean().default(false),
  auto_amount: z.boolean().default(false),
  auto_clear: z.boolean().default(false),
  auto_attach_receipt: z.boolean().default(false),
  auto_budget: z.boolean().default(false),
  auto_reviewed: z.boolean().default(false),
  auto_tax: z.boolean().default(false),
  auto_business: z.boolean().default(false),
  priority: z.number().int().default(0),
  locked: z.boolean().default(false),
  never_auto: z.boolean().default(false),
  ai_suggestions: z.boolean().default(true),
  fuzzy_match: z.boolean().default(true),
  exact_match_only: z.boolean().default(false),
  min_amount: z.number().nullable().optional(),
  max_amount: z.number().nullable().optional(),
  restrict_account_ids: z.array(z.string().uuid()).default([]),
  date_range_start: z.string().nullable().optional(),
  date_range_end: z.string().nullable().optional(),
  apply_to_downloaded: z.boolean().default(true),
  apply_to_manual: z.boolean().default(true),
  apply_to_import: z.boolean().default(true),
  is_recurring: z.boolean().default(false),
  recurrence_freq: z.enum(["weekly", "monthly", "quarterly", "yearly", "custom"]).nullable().optional(),
  recurrence_day: z.number().int().nullable().optional(),
  next_expected_date: z.string().nullable().optional(),
  reminder_days: z.number().int().nullable().optional(),
  show_in_calendar: z.boolean().default(false),
  is_favorite: z.boolean().default(false),
  is_disabled: z.boolean().default(false),
};

export const listMemorizedPayees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const householdId = await getHouseholdId(context);
    const { data, error } = await context.supabase
      .from("memorized_payees")
      .select("*, category:categories(id, name, kind, color, icon)")
      .eq("household_id", householdId)
      .order("is_favorite", { ascending: false })
      .order("merchant", { ascending: true });
    if (error) throw error;
    const payees = data ?? [];

    // Compute live usage_count / last_used_at from transactions by merchant name
    const { data: txns, error: txnsError } = await context.supabase
      .from("transactions")
      .select("merchant, txn_date")
      .eq("household_id", householdId)
      .not("merchant", "is", null);
    if (txnsError) throw txnsError;
    const stats = new Map<string, { count: number; last: string | null }>();
    for (const t of txns ?? []) {
      const key = String((t as any).merchant ?? "").trim().toLowerCase();
      if (!key) continue;
      const cur = stats.get(key) ?? { count: 0, last: null };
      cur.count += 1;
      const d = (t as any).txn_date as string | null;
      if (d && (!cur.last || d > cur.last)) cur.last = d;
      stats.set(key, cur);
    }
    return payees.map((p: any) => {
      const s = stats.get(String(p.merchant ?? "").trim().toLowerCase());
      return { ...p, usage_count: s?.count ?? p.usage_count ?? 0, last_used_at: s?.last ?? p.last_used_at ?? null };
    });
  });


export const createMemorizedPayee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object(payeeShape).parse(d))
  .handler(async ({ context, data }) => {
    const householdId = await getHouseholdId(context);
    const { data: row, error } = await context.supabase
      .from("memorized_payees")
      .insert({ ...data, household_id: householdId, created_by: context.userId, modified_by: context.userId })
      .select("*, category:categories(id, name, kind, color, icon)")
      .single();
    if (error) throw error;
    return row;
  });

export const updateMemorizedPayee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), patch: z.object(payeeShape).partial() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("memorized_payees")
      .update({ ...data.patch, modified_by: context.userId })
      .eq("id", data.id)
      .select("*, category:categories(id, name, kind, color, icon)")
      .single();
    if (error) throw error;
    return row;
  });

export const deleteMemorizedPayees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("memorized_payees").delete().in("id", data.ids);
    if (error) throw error;
    return { ok: true };
  });

export const bulkUpdateMemorizedPayees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ ids: z.array(z.string().uuid()).min(1), patch: z.object(payeeShape).partial() })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("memorized_payees")
      .update({ ...data.patch, modified_by: context.userId })
      .in("id", data.ids);
    if (error) throw error;
    return { ok: true };
  });

export const listCategoriesForPayees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const householdId = await getHouseholdId(context);
    const PAGE = 1000;
    const cats: any[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await context.supabase
        .from("categories")
        .select("*")
        .eq("household_id", householdId)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      cats.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
    return cats;
  });

export const listAccountsForPayees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const householdId = await getHouseholdId(context);
    const { data, error } = await context.supabase
      .from("accounts")
      .select("id, name, currency, institution")
      .eq("household_id", householdId)
      .eq("is_active", true)
      .order("name");
    if (error) throw error;
    return data ?? [];
  });

export const quickSavePayee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      merchant: z.string().min(1).max(200),
      category_id: z.string().uuid().nullable().optional(),
      txn_type: z.enum(["expense", "income", "transfer"]).optional(),
      aliases: z.array(z.string()).optional(),
      patterns: z.array(z.string()).optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const householdId = await getHouseholdId(context);

    // Build comprehensive candidate patterns and aliases
    const rawAliases = data.aliases ?? [];
    const rawPatterns = data.patterns ?? [];
    const candidateSet = new Set<string>();

    for (const p of rawPatterns) {
      if (!p) continue;
      const trimmed = p.trim().toUpperCase();
      if (trimmed) candidateSet.add(trimmed);
      const norm = normalizePattern(p);
      if (norm) candidateSet.add(norm);
      for (const k of lookupKeys(norm || trimmed)) {
        if (k && k.length >= 2) candidateSet.add(k.toUpperCase());
      }
    }

    for (const a of rawAliases) {
      if (!a) continue;
      candidateSet.add(a.trim());
      const norm = normalizePattern(a);
      if (norm) candidateSet.add(norm);
      for (const k of lookupKeys(norm)) {
        if (k && k.length >= 2) candidateSet.add(k.toUpperCase());
      }
    }

    const { data: existing } = await context.supabase
      .from("memorized_payees")
      .select("id, aliases")
      .eq("household_id", householdId)
      .ilike("merchant", data.merchant.trim())
      .maybeSingle();

    let result;
    if (existing) {
      const curAliases = Array.isArray(existing.aliases) ? existing.aliases : [];
      const newAliases = Array.from(new Set([...curAliases, ...candidateSet]));
      const { data: updated, error } = await context.supabase
        .from("memorized_payees")
        .update({
          category_id: data.category_id ?? undefined,
          txn_type: data.txn_type ?? "expense",
          aliases: newAliases,
          modified_by: context.userId,
        })
        .eq("id", existing.id)
        .select("id, merchant, category_id, txn_type")
        .single();
      if (error) throw error;
      result = updated;
    } else {
      const { data: created, error } = await context.supabase
        .from("memorized_payees")
        .insert({
          household_id: householdId,
          merchant: data.merchant.trim(),
          category_id: data.category_id ?? null,
          txn_type: data.txn_type ?? "expense",
          aliases: Array.from(candidateSet),
          created_by: context.userId,
          modified_by: context.userId,
        })
        .select("id, merchant, category_id, txn_type")
        .single();

      if (error) throw error;
      result = created;
    }

    // Atomically persist to Layer 1 user_payee_overrides for instant deterministic matching
    const overridePatterns = Array.from(candidateSet)
      .map((p) => p.trim().toUpperCase())
      .filter((p) => p.length >= 2);

    if (overridePatterns.length > 0) {
      let categoryName: string | null = null;
      if (data.category_id) {
        const { data: cat } = await context.supabase
          .from("categories")
          .select("name")
          .eq("id", data.category_id)
          .maybeSingle();
        categoryName = cat?.name ?? null;
      }

      const overrides = overridePatterns.map((p) => ({
        user_id: context.userId,
        normalized_pattern: p,
        payee_name: data.merchant.trim(),
        category: categoryName,
      }));

      try {
        await context.supabase
          .from("user_payee_overrides")
          .upsert(overrides, { onConflict: "user_id,normalized_pattern" });
      } catch {
        // Non-fatal if override table has schema nuances
      }
    }

    return result;
  });

export const listPayeeTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        payeeId: z.string().uuid().optional(),
        merchant: z.string().min(1),
        aliases: z.array(z.string()).default([]),
        limit: z.number().int().min(1).max(500).default(200),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const householdId = await getHouseholdId(context);

    let aliases = [...(data.aliases ?? [])];
    if (data.payeeId && aliases.length === 0) {
      const { data: p } = await context.supabase
        .from("memorized_payees")
        .select("aliases")
        .eq("id", data.payeeId)
        .maybeSingle();
      if (p?.aliases && Array.isArray(p.aliases)) {
        aliases = p.aliases as string[];
      }
    }

    const searchNames = Array.from(
      new Set([data.merchant, ...aliases].map((s) => s.trim()).filter(Boolean)),
    );

    let q = context.supabase
      .from("transactions")
      .select(
        `id, account_id, transfer_account_id, category_id, type, amount, txn_date,
         note, memo, merchant, payment_method, check_number, tags, tax_code,
         cleared_status, is_flagged, is_favorite, is_reviewed, is_read,
         attachment_count, comment_count, created_at, split_parent_id,
         category:categories(id, name, kind, color, icon),
         account:accounts!transactions_account_id_fkey(id, name, currency, institution),
         transfer_account:accounts!transactions_transfer_account_id_fkey(id, name)`,
      )
      .eq("household_id", householdId)
      .order("txn_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (searchNames.length > 0) {
      const orFilters = searchNames
        .map((name) => {
          const clean = name.replace(/[%_,]/g, "");
          return `merchant.ilike.%${clean}%`;
        })
        .join(",");
      q = q.or(orFilters);
    }

    const { data: rows, error } = await q;
    if (error) throw error;

    const txns = rows ?? [];
    let totalExpense = 0;
    let totalIncome = 0;
    for (const t of txns) {
      const amt = Number(t.amount) || 0;
      const typeStr = String(t.type);
      if (typeStr === "expense" || typeStr === "withdrawal") {
        totalExpense += amt;
      } else if (typeStr === "income" || typeStr === "deposit") {
        totalIncome += amt;
      }
    }

    return {
      transactions: txns,
      stats: {
        totalCount: txns.length,
        totalExpense,
        totalIncome,
        netTotal: totalIncome - totalExpense,
        avgAmount: txns.length > 0 ? (totalExpense + totalIncome) / txns.length : 0,
        firstDate: txns.length > 0 ? txns[txns.length - 1].txn_date : null,
        lastDate: txns.length > 0 ? txns[0].txn_date : null,
      },
    };
  });
