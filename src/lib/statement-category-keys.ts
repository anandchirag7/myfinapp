import type { CategoryIndex } from "./category-resolver";

export const STATEMENT_CATEGORY_KEYS = [
  "food_dining",
  "groceries",
  "transport",
  "shopping",
  "utilities",
  "housing",
  "healthcare",
  "education",
  "entertainment",
  "travel",
  "insurance",
  "investments",
  "fees_charges",
  "cash_withdrawal",
  "salary_income",
  "refund_reversal",
  "payments_to_people",
  "transfer",
  "other",
] as const;

export type StatementCategoryKey = (typeof STATEMENT_CATEGORY_KEYS)[number];

const CATEGORY_HINTS: Record<StatementCategoryKey, readonly string[]> = {
  food_dining: ["food", "dining", "restaurant", "eating out"],
  groceries: ["grocer", "supermarket", "household supplies"],
  transport: ["transport", "taxi", "cab", "fuel", "petrol"],
  shopping: ["shopping", "clothing", "electronics"],
  utilities: ["utilit", "electric", "mobile", "internet", "water"],
  housing: ["rent", "housing", "home"],
  healthcare: ["health", "medical", "pharmacy"],
  education: ["education", "school", "course"],
  entertainment: ["entertainment", "movie", "streaming"],
  travel: ["travel", "hotel", "flight"],
  insurance: ["insurance", "premium"],
  investments: ["investment", "mutual fund", "stocks"],
  fees_charges: ["fee", "charge", "penalty"],
  cash_withdrawal: ["cash", "atm", "withdrawal"],
  salary_income: ["salary", "income", "paycheck"],
  refund_reversal: ["refund", "reversal", "cashback"],
  payments_to_people: ["payments to people", "person", "p2p"],
  transfer: ["transfer", "own account"],
  other: ["other", "miscellaneous", "uncategorized"],
};

export function resolveCategoryKey(
  key: StatementCategoryKey | null | undefined,
  index: CategoryIndex,
): { id: string; name: string } | null {
  if (!key) return null;
  const hints = CATEGORY_HINTS[key];
  let best: { id: string; name: string; score: number } | null = null;
  for (const [id, name] of index.nameById) {
    const normalized = name.toLowerCase();
    const score = Math.max(
      ...hints.map((hint) =>
        normalized === hint ? 3 : normalized.includes(hint) || hint.includes(normalized) ? 2 : 0,
      ),
    );
    if (score && (!best || score > best.score)) best = { id, name, score };
  }
  return best ? { id: best.id, name: best.name } : null;
}
