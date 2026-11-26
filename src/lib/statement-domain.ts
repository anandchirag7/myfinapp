export const ECONOMIC_TYPES = [
  "EXPENSE",
  "INCOME",
  "INTERNAL_TRANSFER",
  "CREDIT_CARD_PAYMENT",
  "INVESTMENT",
  "INVESTMENT_REDEMPTION",
  "BROKERAGE_SETTLEMENT",
  "LOAN_PAYMENT",
  "INSURANCE_PAYMENT",
  "REFUND",
  "REVERSAL",
  "INVESTMENT_INCOME",
  "INTEREST_INCOME",
  "CASH_WITHDRAWAL",
  "CASH_DEPOSIT",
  "FEE_OR_CHARGE",
  "TAX",
  "VERIFICATION_TRANSACTION",
  "UNKNOWN",
] as const;

export type EconomicType = (typeof ECONOMIC_TYPES)[number];
export type StatementDirection = "debit" | "credit";
export type LegacyTransactionType = "income" | "expense" | "transfer";

export function isEconomicType(value: unknown): value is EconomicType {
  return typeof value === "string" && (ECONOMIC_TYPES as readonly string[]).includes(value);
}

export type EconomicImpact = {
  spending: number;
  income: number;
  cashFlow: number;
};

const SPENDING_TYPES = new Set<EconomicType>([
  "EXPENSE",
  "INSURANCE_PAYMENT",
  "FEE_OR_CHARGE",
  "TAX",
]);

const INCOME_TYPES = new Set<EconomicType>([
  "INCOME",
  "INVESTMENT_INCOME",
  "INTEREST_INCOME",
]);

/**
 * Report impact is deliberately separate from bank direction. Financial moves
 * such as investments and card payments affect cash but are not fresh spend.
 */
export function economicImpact(
  economicType: EconomicType,
  direction: StatementDirection,
  amount: number,
): EconomicImpact {
  const absolute = Math.abs(Number(amount) || 0);
  return {
    spending: SPENDING_TYPES.has(economicType)
      ? direction === "debit"
        ? absolute
        : -absolute
      : economicType === "REFUND"
        ? -absolute
        : 0,
    income: INCOME_TYPES.has(economicType) && direction === "credit" ? absolute : 0,
    cashFlow: direction === "credit" ? absolute : -absolute,
  };
}

/** Conservative bridge for historical rows. Domain resolvers may refine it. */
export function economicTypeFromLegacy(
  type: LegacyTransactionType,
  direction?: StatementDirection,
): EconomicType {
  if (type === "transfer") return "INTERNAL_TRANSFER";
  if (type === "income" || direction === "credit") return "INCOME";
  if (type === "expense" || direction === "debit") return "EXPENSE";
  return "UNKNOWN";
}

export function legacyTypeForEconomicType(
  economicType: EconomicType,
  direction: StatementDirection,
): LegacyTransactionType {
  if (economicType === "INTERNAL_TRANSFER") return "transfer";
  return direction === "credit" ? "income" : "expense";
}
