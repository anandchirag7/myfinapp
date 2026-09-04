export type CategoryKind = "income" | "expense" | "transfer" | "investment";
export type DisplayCategoryKind = CategoryKind | "mixed";

export type CategoryTypeTransaction = {
  amount?: number | string | null;
  type?: string | null;
  category?: { kind?: string | null } | null;
};

export type ResolvedCategoryType = {
  kind: DisplayCategoryKind | null;
  inferred: boolean;
};

const CATEGORY_KINDS = new Set<CategoryKind>(["income", "expense", "transfer", "investment"]);

export const CATEGORY_TYPE_LABELS: Record<DisplayCategoryKind, string> = {
  income: "Income",
  expense: "Expense",
  transfer: "Transfer",
  investment: "Investment",
  mixed: "Mixed",
};

export function isCategoryKind(value: unknown): value is CategoryKind {
  return typeof value === "string" && CATEGORY_KINDS.has(value as CategoryKind);
}

export function resolveCategoryType(transaction: CategoryTypeTransaction): ResolvedCategoryType {
  const explicitKind = transaction.category?.kind;
  if (isCategoryKind(explicitKind)) return { kind: explicitKind, inferred: false };

  if (transaction.type === "expense") return { kind: "expense", inferred: true };
  if (transaction.type === "income") return { kind: "income", inferred: true };
  if (transaction.type === "transfer") return { kind: "transfer", inferred: true };

  const amount = Number(transaction.amount);
  if (Number.isFinite(amount) && amount < 0) return { kind: "expense", inferred: true };
  if (Number.isFinite(amount) && amount > 0) return { kind: "income", inferred: true };
  return { kind: null, inferred: true };
}

export function resolveSplitCategoryType(
  parent: CategoryTypeTransaction,
  children?: CategoryTypeTransaction[] | null,
): ResolvedCategoryType {
  if (!children?.length) return resolveCategoryType(parent);

  const kinds = new Set(
    children
      .map((child) => resolveCategoryType(child).kind)
      .filter((kind): kind is DisplayCategoryKind => kind !== null),
  );

  if (kinds.size === 0) return resolveCategoryType(parent);
  if (kinds.size > 1) return { kind: "mixed", inferred: true };

  const kind = [...kinds][0];
  const allExplicit = children.every((child) => resolveCategoryType(child).inferred === false);
  return { kind, inferred: !allExplicit };
}

export function getCategoryTypeLabel(resolved: ResolvedCategoryType): string {
  return resolved.kind ? CATEGORY_TYPE_LABELS[resolved.kind] : "—";
}
