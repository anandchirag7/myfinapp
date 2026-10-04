import type { CategoryIndex } from "./category-resolver";
import { sanitizeClassificationText } from "./statement-classification-policy";
import { normalizePattern } from "./statement-normalize";

export const AI_SPENDING_PROFILE_VERSION = 1;

export type SpendingUsageContext = "personal" | "household" | "business" | "mixed";

export type AiSpendingCategoryMapping = {
  merchant: string;
  categoryId: string;
};

export type AiSpendingIncomeSource = {
  name: string;
  categoryId: string;
};

export type AiSpendingProfile = {
  version: number;
  usageContext: SpendingUsageContext;
  householdMembers: string[];
  ownAccountLabels: string[];
  incomeSources: AiSpendingIncomeSource[];
  merchantMappings: AiSpendingCategoryMapping[];
  recurringPayments: AiSpendingCategoryMapping[];
  requireP2PReview: boolean;
  neverAutoAssignCategoryIds: string[];
};

export const EMPTY_AI_SPENDING_PROFILE: AiSpendingProfile = {
  version: AI_SPENDING_PROFILE_VERSION,
  usageContext: "household",
  householdMembers: [],
  ownAccountLabels: [],
  incomeSources: [],
  merchantMappings: [],
  recurringPayments: [],
  requireP2PReview: true,
  neverAutoAssignCategoryIds: [],
};

const cleanText = (value: unknown, maxLength = 120) =>
  sanitizeClassificationText(typeof value === "string" ? value : "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

function uniqueStrings(values: unknown, limit: number, maxLength = 120): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = cleanText(raw, maxLength);
    const key = value.toLocaleLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= limit) break;
  }
  return out;
}

function normalizeMappings(
  values: unknown,
  merchantField: "merchant" | "name",
  limit: number,
): Array<{ merchant: string; categoryId: string }> {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: Array<{ merchant: string; categoryId: string }> = [];
  for (const raw of values) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const merchant = cleanText(row[merchantField]);
    const categoryId = cleanText(row.categoryId, 80);
    const key = normalizePattern(merchant);
    if (!merchant || !categoryId || !key || seen.has(key)) continue;
    seen.add(key);
    out.push({ merchant, categoryId });
    if (out.length >= limit) break;
  }
  return out;
}

export function normalizeAiSpendingProfile(value: unknown): AiSpendingProfile {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const usageContext = ["personal", "household", "business", "mixed"].includes(
    String(input.usageContext),
  )
    ? (input.usageContext as SpendingUsageContext)
    : EMPTY_AI_SPENDING_PROFILE.usageContext;
  return {
    version: AI_SPENDING_PROFILE_VERSION,
    usageContext,
    householdMembers: uniqueStrings(input.householdMembers, 20),
    ownAccountLabels: uniqueStrings(input.ownAccountLabels, 20),
    incomeSources: normalizeMappings(input.incomeSources, "name", 30).map((entry) => ({
      name: entry.merchant,
      categoryId: entry.categoryId,
    })),
    merchantMappings: normalizeMappings(input.merchantMappings, "merchant", 100),
    recurringPayments: normalizeMappings(input.recurringPayments, "merchant", 50),
    requireP2PReview: typeof input.requireP2PReview === "boolean" ? input.requireP2PReview : true,
    neverAutoAssignCategoryIds: uniqueStrings(input.neverAutoAssignCategoryIds, 50, 80),
  };
}

export function collectAiSpendingIdentityTokens(profile: AiSpendingProfile): string[] {
  const ignored = new Set(["account", "bank", "my", "own"]);
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const value of [...profile.householdMembers, ...profile.ownAccountLabels]) {
    for (const token of value.split(/[^\p{L}\p{N}]+/u)) {
      const key = token.toLocaleLowerCase();
      if (token.length <= 2 || ignored.has(key) || seen.has(key)) continue;
      seen.add(key);
      tokens.push(token);
    }
  }
  return tokens.slice(0, 50);
}

type ProfileTransaction = {
  pattern: string;
  description?: string;
  type?: string;
};

export type AiSpendingProfileResolution = {
  payee: string;
  category: string;
  categoryId: string;
  source: "user_profile";
  confidence: 1;
  identityConfidence: 1;
  categoryConfidence: 1;
  requiresReview: false;
  blockingReason: null;
  evidence: string[];
};

type ReviewableClassification = {
  source: string;
  category?: string | null;
  categoryId?: string | null;
  categoryKey?: string | null;
  categoryConfidence?: number | null;
  requiresReview?: boolean;
  blockingReason?: "identity_unknown" | "category_unknown" | "low_confidence" | null;
  evidence?: string[];
};

export function applyAiSpendingReviewPolicy<T extends ReviewableClassification>(
  value: T,
  policy: Pick<AiSpendingProfile, "requireP2PReview" | "neverAutoAssignCategoryIds">,
): T {
  if (value.categoryId && policy.neverAutoAssignCategoryIds.includes(value.categoryId)) {
    return {
      ...value,
      requiresReview: true,
      blockingReason: "low_confidence",
      evidence: Array.from(new Set([...(value.evidence ?? []), "profile_requires_review"])),
    };
  }
  if (
    value.source === "ai" &&
    value.category &&
    value.categoryKey === "payments_to_people" &&
    !policy.requireP2PReview &&
    Number(value.categoryConfidence ?? 0) >= 0.9
  ) {
    return { ...value, requiresReview: false, blockingReason: null };
  }
  return value;
}

export function applyAiSpendingProfileMappings(
  transactions: ProfileTransaction[],
  profile: AiSpendingProfile,
  categoryIndex: CategoryIndex,
): Record<string, AiSpendingProfileResolution> {
  const categoryName = (id: string) => categoryIndex.nameById.get(id) ?? null;
  const merchantMap = new Map(
    [...profile.recurringPayments, ...profile.merchantMappings].map((entry) => [
      normalizePattern(entry.merchant),
      entry,
    ]),
  );
  const incomeMap = new Map(
    profile.incomeSources.map((entry) => [normalizePattern(entry.name), entry]),
  );
  const resolved: Record<string, AiSpendingProfileResolution> = {};

  for (const transaction of transactions) {
    const normalized = normalizePattern(transaction.pattern || transaction.description || "");
    const mapping =
      transaction.type === "income" ? incomeMap.get(normalized) : merchantMap.get(normalized);
    if (!mapping) continue;
    const name = categoryName(mapping.categoryId);
    if (!name) continue;
    const categoryKind = categoryIndex.kindByName.get(name.toLocaleLowerCase());
    if (transaction.type === "income" && categoryKind !== "income") continue;
    if (transaction.type === "expense" && categoryKind === "income") continue;
    const payee = "merchant" in mapping ? mapping.merchant : mapping.name;
    resolved[transaction.pattern] = {
      payee,
      category: name,
      categoryId: mapping.categoryId,
      source: "user_profile",
      confidence: 1,
      identityConfidence: 1,
      categoryConfidence: 1,
      requiresReview: false,
      blockingReason: null,
      evidence: ["ai_spending_profile", "exact_pattern"],
    };
  }
  return resolved;
}

export function buildAiSpendingProfileContext(
  profile: AiSpendingProfile,
  categoryNamesById: Map<string, string>,
  maxChars = 2_000,
): string[] {
  const candidates: string[] = [
    `Spending context: ${profile.usageContext}.`,
    profile.requireP2PReview
      ? "Keep ambiguous person-to-person payments for manual review."
      : "Person-to-person payments may use a supported household category when evidence is clear.",
  ];
  const guarded = profile.neverAutoAssignCategoryIds
    .map((id) => categoryNamesById.get(id))
    .filter((name): name is string => Boolean(name));
  if (guarded.length) candidates.push(`Never auto-assign these categories: ${guarded.join(", ")}.`);
  for (const mapping of profile.merchantMappings.slice(0, 30)) {
    const category = categoryNamesById.get(mapping.categoryId);
    if (category) candidates.push(`Merchant ${mapping.merchant} belongs to ${category}.`);
  }
  for (const source of profile.incomeSources.slice(0, 20)) {
    const category = categoryNamesById.get(source.categoryId);
    if (category) candidates.push(`Income source ${source.name} belongs to ${category}.`);
  }
  for (const payment of profile.recurringPayments.slice(0, 20)) {
    const category = categoryNamesById.get(payment.categoryId);
    if (category) candidates.push(`Recurring merchant ${payment.merchant} belongs to ${category}.`);
  }
  const result: string[] = [];
  let length = 0;
  for (const candidate of candidates.map((line) => cleanText(line, 500))) {
    const added = candidate.length + (result.length ? 1 : 0);
    if (!candidate || length + added > Math.max(200, maxChars)) break;
    result.push(candidate);
    length += added;
  }
  return result;
}
