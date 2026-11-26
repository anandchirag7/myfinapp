import { parseHdfcNarration, type HdfcNarration } from "./hdfc-narration";
import type { EconomicType, StatementDirection } from "./statement-domain";

export type EconomicResolutionSource =
  | "deterministic"
  | "direction_fallback"
  | "unresolved"
  | "user_confirmed_rule";

export type EconomicResolution = {
  economicType: EconomicType;
  confidence: number;
  source: EconomicResolutionSource;
  ruleId: string;
  reasons: string[];
  requiresReview: boolean;
  narration: HdfcNarration;
};

export type EconomicResolutionInput = {
  description: string;
  direction: StatementDirection;
  amount: number;
  isKnownInternalTransfer?: boolean;
  accountCategory?: string | null;
};

function result(
  narration: HdfcNarration,
  economicType: EconomicType,
  ruleId: string,
  reason: string,
  confidence = 0.98,
  requiresReview = false,
): EconomicResolution {
  return {
    economicType,
    confidence,
    source: "deterministic",
    ruleId,
    reasons: [reason],
    requiresReview,
    narration,
  };
}

/**
 * High-precision accounting classification. Merchant category resolution runs
 * separately and cannot override these protected financial movement types.
 */
export function resolveEconomicType(input: EconomicResolutionInput): EconomicResolution {
  const narration = parseHdfcNarration(input.description);
  const text = input.description.toUpperCase().replace(/\s+/g, " ").trim();

  if (input.isKnownInternalTransfer) {
    return result(
      narration,
      "INTERNAL_TRANSFER",
      "owned-account-transfer",
      "A verified account alias or transfer confirmation identifies both owned accounts.",
      1,
    );
  }

  // A returned-debit charge is a fee, not the returned payment itself.
  if (input.direction === "debit" && /\b(?:RETURN|BOUNCE).*\b(?:CHARGE|FEE)S?\b|\b(?:CHARGE|FEE)S?.*\b(?:RETURN|BOUNCE)\b/.test(text)) {
    return result(narration, "FEE_OR_CHARGE", "return-charge", "The bank explicitly labels a return or bounce charge.");
  }

  if (narration.subtype === "return" || /\b(?:UPIRET|REVERSAL|REVERSED|CHARGEBACK)\b/.test(text)) {
    return result(narration, "REVERSAL", "bank-return", "The narration explicitly identifies a returned or reversed posting.");
  }

  if (input.direction === "credit" && /\b(?:REFUND|REFUNDED)\b/.test(text)) {
    return result(narration, "REFUND", "explicit-refund", "The narration explicitly identifies a refund.");
  }

  if (
    input.accountCategory === "credit_card" &&
    input.direction === "credit" &&
    /\b(?:PAYMENT RECEIVED|PAYMENT THANK YOU|PAYMENT - THANK YOU|AUTOPAY PAYMENT)\b/.test(text)
  ) {
    return result(
      narration,
      "CREDIT_CARD_PAYMENT",
      "card-statement-payment-credit",
      "A credit-card statement explicitly identifies a bill payment received.",
    );
  }

  if (/\bCRED CLUB\b|\bPAYMENT ON CRED\b|\bPAID VIA CRED\b|\bCREDIT CARD (?:PAYMENT|BILL)\b|\bCC PAYMENT\b/.test(text)) {
    return result(narration, "CREDIT_CARD_PAYMENT", "credit-card-payment", "The payee or purpose explicitly identifies a credit-card payment.");
  }

  if (/\b(?:NPS|NATIONAL PENSION SYSTEM|PRAN)\b/.test(text) && input.direction === "debit") {
    return result(narration, "INVESTMENT", "nps-contribution", "The narration identifies an NPS/PRAN contribution.");
  }

  if (/\b(?:ZERODHA|INDIAN CLEARING CORP|ICCL)\b/.test(text)) {
    if (input.direction === "debit") {
      return result(narration, "INVESTMENT", "broker-funding", "A debit to Zerodha/ICCL is broker funding or investment.");
    }
    return result(narration, "BROKERAGE_SETTLEMENT", "broker-settlement", "A credit from Zerodha/ICCL is a brokerage settlement, not earned income.");
  }

  if (input.direction === "debit" && /\b(?:RACPC|LOAN (?:EMI|PAYMENT)|EMI PAYMENT|INSTALMENT|INSTALLMENT)\b/.test(text)) {
    return result(narration, "LOAN_PAYMENT", "loan-payment", "The narration identifies a loan service centre or instalment.");
  }

  if (input.direction === "debit" && /\b(?:INSURANCE|POLICY|TATA AIA|LIC OF INDIA|HDFC LIFE|ICICI PRU)\b/.test(text)) {
    return result(narration, "INSURANCE_PAYMENT", "insurance-payment", "The narration identifies an insurer or insurance policy.");
  }

  if (input.direction === "credit" && /\b(?:DIVIDEND|CORPORATE ACTION|ISIN)\b/.test(text)) {
    return result(narration, "INVESTMENT_INCOME", "investment-income", "The narration identifies dividend or corporate-action income.");
  }

  if (input.direction === "credit" && /\bINTEREST\b/.test(text)) {
    return result(narration, "INTEREST_INCOME", "interest-income", "The bank labels the credit as interest.");
  }

  if (input.direction === "credit" && /\bSALARY\b/.test(text)) {
    return result(narration, "INCOME", "salary", "The narration explicitly labels the credit as salary.");
  }

  if (Math.abs(input.amount - 1) < 0.005 && /\b(?:ACCOUNT ?VALIDATION|VERIFY|VERIFICATION|PENNY DROP|MICRO DEPOSIT)\b/.test(text)) {
    return result(narration, "VERIFICATION_TRANSACTION", "micro-verification", "The ₹1 amount is corroborated by account-validation language.");
  }

  if (/\b(?:ATM|ATW|CASH WITHDRAWAL)\b/.test(text) && input.direction === "debit") {
    return result(narration, "CASH_WITHDRAWAL", "cash-withdrawal", "The narration identifies an ATM or cash withdrawal.");
  }

  if (/\bCASH DEPOSIT\b/.test(text) && input.direction === "credit") {
    return result(narration, "CASH_DEPOSIT", "cash-deposit", "The narration identifies a cash deposit.");
  }

  if (input.direction === "debit" && /\b(?:GST|TAX|TDS)\b/.test(text)) {
    return result(narration, "TAX", "tax", "The narration explicitly identifies tax.");
  }

  if (input.direction === "debit" && /\b(?:CHARGE|FEE|PENALTY)\b/.test(text)) {
    return result(narration, "FEE_OR_CHARGE", "bank-fee", "The narration explicitly identifies a fee or charge.");
  }

  if (input.direction === "debit") {
    return {
      economicType: "EXPENSE",
      confidence: 0.72,
      source: "direction_fallback",
      ruleId: "unclassified-debit",
      reasons: ["The row is a debit with no evidence of a protected financial movement."],
      requiresReview: false,
      narration,
    };
  }

  return {
    economicType: "UNKNOWN",
    confidence: 0,
    source: "unresolved",
    ruleId: "unclassified-credit",
    reasons: ["A credit is not assumed to be income without income, refund, settlement, or transfer evidence."],
    requiresReview: true,
    narration,
  };
}
