import type { StatementCategoryKey } from "./statement-category-keys";

export const AI_SUGGESTION_THRESHOLD = 0.75;
export const AI_AUTO_APPLY_THRESHOLD = 0.9;

const GUARDED_AI_KEYS = new Set<StatementCategoryKey>(["other", "payments_to_people", "transfer"]);

export type ClassificationPolicyValue = {
  source: string;
  payee?: string | null;
  category?: string | null;
  categoryId?: string | null;
  categoryKey?: StatementCategoryKey | null;
  confidence?: number | null;
  identityConfidence?: number | null;
  categoryConfidence?: number | null;
  requiresReview?: boolean;
  blockingReason?: "identity_unknown" | "category_unknown" | "low_confidence" | null;
};

const clampConfidence = (value: number | null | undefined) =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, Number(value))) : 0;

export const sanitizeClassificationText = (value: string) =>
  Array.from(value, (character) => (character.charCodeAt(0) < 32 ? " " : character)).join("");

export function applyAiConfidencePolicy<T extends ClassificationPolicyValue>(
  value: T,
): T & ClassificationPolicyValue {
  if (value.source !== "ai") return value;
  const categoryConfidence = clampConfidence(value.categoryConfidence ?? value.confidence);
  const guarded = value.categoryKey ? GUARDED_AI_KEYS.has(value.categoryKey) : false;

  if (!value.category || categoryConfidence < AI_SUGGESTION_THRESHOLD) {
    return {
      ...value,
      category: null,
      categoryId: null,
      categoryConfidence,
      confidence: categoryConfidence,
      requiresReview: true,
      blockingReason: value.category ? "low_confidence" : "category_unknown",
    };
  }

  return {
    ...value,
    categoryConfidence,
    confidence: categoryConfidence,
    requiresReview: guarded || categoryConfidence < AI_AUTO_APPLY_THRESHOLD,
    blockingReason:
      guarded || categoryConfidence < AI_AUTO_APPLY_THRESHOLD ? "low_confidence" : null,
  };
}

export function shouldLearnPatternCategory(value: ClassificationPolicyValue): boolean {
  if (!value.category && !value.categoryId) return false;
  if (value.source === "user_confirmed" || value.source === "user_rule") return true;
  if (value.source !== "ai") return false;
  if (value.categoryKey && GUARDED_AI_KEYS.has(value.categoryKey)) return false;
  return clampConfidence(value.categoryConfidence ?? value.confidence) >= AI_AUTO_APPLY_THRESHOLD;
}

export function buildClassificationContext(opts: {
  categoryNames: string[];
  ruleInstructions: string[];
  maxChars: number;
}) {
  const maxChars = Math.max(200, Math.floor(opts.maxChars));
  const categoryNames: string[] = [];
  const ruleInstructions: string[] = [];
  let truncated = false;
  const fits = (categories: string[], rules: string[], flag: boolean) =>
    JSON.stringify({ categoryNames: categories, ruleInstructions: rules, truncated: flag })
      .length <= maxChars;

  for (const raw of opts.categoryNames) {
    const value = raw.trim();
    if (!value || categoryNames.includes(value)) continue;
    if (!fits([...categoryNames, value], ruleInstructions, true)) {
      truncated = true;
      break;
    }
    categoryNames.push(value);
  }
  if (
    categoryNames.length <
    new Set(opts.categoryNames.map((value) => value.trim()).filter(Boolean)).size
  )
    truncated = true;

  for (const raw of opts.ruleInstructions) {
    const value = sanitizeClassificationText(raw).trim();
    if (!value) continue;
    if (!fits(categoryNames, [...ruleInstructions, value], true)) {
      truncated = true;
      break;
    }
    ruleInstructions.push(value);
  }
  if (ruleInstructions.length < opts.ruleInstructions.filter((value) => value.trim()).length)
    truncated = true;

  return { categoryNames, ruleInstructions, truncated };
}

export function parseManualCategoryAssignments(
  payload: unknown,
  allowedCategoryNames: string[],
  itemCount: number,
): Record<number, { category: string; confidence: number }> {
  const allowed = new Map(allowedCategoryNames.map((name) => [name.trim().toLowerCase(), name]));
  const candidate =
    typeof payload === "object" && payload !== null
      ? (payload as { results?: unknown }).results
      : undefined;
  const results = Array.isArray(candidate) ? candidate : [];
  const assignments: Record<number, { category: string; confidence: number }> = {};
  for (const rawResult of results) {
    if (typeof rawResult !== "object" || rawResult === null) continue;
    const result = rawResult as Record<string, unknown>;
    const index = Number(result.index);
    const category = allowed.get(
      String(result.category_name ?? "")
        .trim()
        .toLowerCase(),
    );
    const confidence = clampConfidence(Number(result.confidence));
    if (
      Number.isInteger(index) &&
      index >= 0 &&
      index < itemCount &&
      category &&
      confidence >= AI_SUGGESTION_THRESHOLD
    ) {
      assignments[index] = { category, confidence };
    }
  }
  return assignments;
}
