import {
  applyRuleActions,
  evaluateRuleMatch,
  type RuleDefinition,
  type RuleTransaction,
} from "./rules-engine";
import { cleanPayeeDisplayName, titleCase } from "./statement-normalize";
import { sanitizeClassificationText } from "./statement-classification-policy";

export type LoadedRule = RuleDefinition & {
  title: string;
  kind: "deterministic" | "llm_context";
  natural_language_instruction?: string | null;
  trigger_moment: string;
  is_active: boolean;
  sort_order: number;
};
export type LoadedGroup = { id: string; stop_processing: boolean; rules: LoadedRule[] };

export async function loadActiveRuleGroups(
  supabase: any,
  householdId: string,
): Promise<LoadedGroup[]> {
  const [{ data, error }, { data: categories, error: categoryError }] = await Promise.all([
    supabase
      .from("rule_groups")
      .select(
        "id, stop_processing, rules(id,title,kind,natural_language_instruction,trigger_moment,strict_mode,stop_processing,sort_order,is_active,rule_triggers(*),rule_actions(*))",
      )
      .eq("household_id", householdId)
      .eq("is_active", true)
      .order("sort_order"),
    supabase.from("categories").select("id,name").eq("household_id", householdId),
  ]);
  if (error) throw new Error(error.message);
  if (categoryError) throw new Error(categoryError.message);
  const categoryIdByName = new Map(
    (categories ?? []).map((c: any) => [String(c.name).trim().toLocaleLowerCase(), c.id]),
  );
  return (data ?? []).map((g: any) => ({
    ...g,
    rules: (g.rules ?? [])
      .map((r: any) => ({
        ...r,
        rule_actions: (r.rule_actions ?? []).map((a: any) =>
          a.action_type === "set_category" && !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(a.action_value)
            ? {
                ...a,
                action_value:
                  categoryIdByName.get(String(a.action_value).trim().toLocaleLowerCase()) ??
                  a.action_value,
              }
            : a,
        ),
      }))
      .sort((a: any, b: any) => a.sort_order - b.sort_order),
  }));
}

function appliesAt(rule: LoadedRule, moment: string) {
  return (
    rule.trigger_moment === moment ||
    (rule.trigger_moment === "create_and_update" && (moment === "create" || moment === "update"))
  );
}

export async function executeRulesPipeline(
  supabase: any,
  householdId: string,
  transaction: RuleTransaction,
  moment: "create" | "update" | "manual_only" | "scheduled",
  selectedRuleId?: string,
) {
  const groups = await loadActiveRuleGroups(supabase, householdId);
  return executeLoadedRules(groups, transaction, moment, selectedRuleId);
}

/** Execute an already-loaded ruleset. Batch jobs must use this to avoid one
 * rules/categories round-trip for every transaction. */
export function executeLoadedRules(
  groups: LoadedGroup[],
  transaction: RuleTransaction,
  moment: "create" | "update" | "manual_only" | "scheduled",
  selectedRuleId?: string,
) {
  let value = { ...transaction };
  const matchedRuleIds: string[] = [];
  const actions: string[] = [];
  for (const group of groups) {
    let groupMatched = false;
    for (const rule of group.rules) {
      if (
        !rule.is_active ||
        rule.kind !== "deterministic" ||
        (selectedRuleId ? rule.id !== selectedRuleId : !appliesAt(rule, moment))
      )
        continue;
      if (!evaluateRuleMatch(rule, value)) continue;
      groupMatched = true;
      matchedRuleIds.push(rule.id);
      const result = applyRuleActions(rule, value);
      value = { ...value, ...result.patch };
      actions.push(...result.actionsApplied);
      if (rule.stop_processing) break;
    }
    if (groupMatched && group.stop_processing) break;
  }
  const patch = Object.fromEntries(
    Object.entries(value).filter(([key, val]) => transaction[key] !== val),
  );
  return { transaction: value, patch, matchedRuleIds, actionsApplied: actions };
}

export async function loadLlmRuleContext(supabase: any, householdId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("rules")
    .select("natural_language_instruction, rule_groups!inner(is_active)")
    .eq("household_id", householdId)
    .eq("kind", "llm_context")
    .eq("is_active", true)
    .eq("rule_groups.is_active", true)
    .order("sort_order")
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((r: any) =>
      sanitizeClassificationText(String(r.natural_language_instruction ?? ""))
        .trim()
        .slice(0, 1000),
    )
    .filter(Boolean);
}

/** Runs deterministic rules on normalized statement rows before any lookup/AI classification. */
export async function applyStatementRules(
  supabase: any,
  householdId: string,
  transactions: Array<Record<string, any>>,
  categoryNamesById: Map<string, string>,
) {
  const groups = await loadActiveRuleGroups(supabase, householdId);
  return applyLoadedStatementRules(groups, transactions, categoryNamesById);
}

/** Apply one preloaded ruleset to a statement without per-row database reads. */
export function applyLoadedStatementRules(
  groups: LoadedGroup[],
  transactions: Array<Record<string, any>>,
  categoryNamesById: Map<string, string>,
) {
  const resolved: Record<string, any> = {};
  const matched = new Set<string>();
  const categoryOverrides: Record<string, string> = {};
  const conflictedPatterns = new Set<string>();
  for (const txn of transactions) {
    const input = {
      ...txn,
      merchant: txn.description,
      description: txn.description,
      amount: Math.abs(Number(txn.amount ?? 0)),
    };
    const result = executeLoadedRules(groups, input, "create");
    if (!result.matchedRuleIds.length) continue;
    Object.assign(txn, result.patch);
    const category = result.transaction.category_id
      ? (categoryNamesById.get(String(result.transaction.category_id)) ?? null)
      : null;
    if (category) {
      const previousCategory = categoryOverrides[txn.pattern];
      if (previousCategory && previousCategory !== category) {
        conflictedPatterns.add(txn.pattern);
        delete categoryOverrides[txn.pattern];
      } else if (!conflictedPatterns.has(txn.pattern)) {
        categoryOverrides[txn.pattern] = category;
      }
    }
    const identityChanged = result.actionsApplied.some(
      (action) =>
        action === "set_merchant" ||
        action === "set_description" ||
        action === "append_description" ||
        action === "prepend_description" ||
        action === "note_to_description" ||
        action === "append_note_to_description",
    );
    if (identityChanged || category) {
      matched.add(txn.pattern);
      const categoryConflict = conflictedPatterns.has(txn.pattern);
      const effectiveCategory = categoryConflict
        ? null
        : (categoryOverrides[txn.pattern] ?? category);
      const payee = identityChanged
        ? cleanPayeeDisplayName(String(result.transaction.merchant ?? txn.pattern))
        : cleanPayeeDisplayName(String(txn.description ?? "")) || titleCase(String(txn.pattern));
      resolved[txn.pattern] = {
        payee,
        category: effectiveCategory,
        categoryId:
          effectiveCategory && result.transaction.category_id
            ? String(result.transaction.category_id)
            : null,
        source: "user_rule",
        confidence: 1,
        identityConfidence: identityChanged ? 1 : 0.8,
        categoryConfidence: effectiveCategory ? 1 : null,
        requiresReview: categoryConflict,
        blockingReason: categoryConflict ? "category_unknown" : null,
        evidence: categoryConflict ? ["user_rule", "rule_category_conflict"] : ["user_rule"],
      };
    }
  }
  return { resolved, matchedPatterns: matched, categoryOverrides, conflictedPatterns };
}
