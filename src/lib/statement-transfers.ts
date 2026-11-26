import type { EconomicType } from "./statement-domain";

export type StatementDirection = "debit" | "credit";
export type TransferIntent = "external" | "possible_internal" | "confirmed_internal";

export function classifyTransferIntent(input: {
  direction: StatementDirection;
  eventType: string;
  counterpartyKind: string;
  rememberedAccountId?: string | null;
}): TransferIntent {
  const selfTransfer = input.eventType === "transfer" && input.counterpartyKind === "self";
  if (!selfTransfer) return "external";
  return input.rememberedAccountId ? "confirmed_internal" : "possible_internal";
}

export function transactionTypeForExternalDecision(
  direction: StatementDirection,
): "expense" | "income" {
  return direction === "debit" ? "expense" : "income";
}

export function canonicalTransferAccounts(
  statementAccountId: string,
  counterpartyAccountId: string,
  direction: StatementDirection,
) {
  return direction === "debit"
    ? { sourceAccountId: statementAccountId, targetAccountId: counterpartyAccountId }
    : { sourceAccountId: counterpartyAccountId, targetAccountId: statementAccountId };
}

export function validateInternalTransfer(
  statementAccountId: string,
  counterpartyAccountId: string | null | undefined,
): string | null {
  if (!counterpartyAccountId) return "Select the other account.";
  if (statementAccountId === counterpartyAccountId)
    return "Source and target accounts must differ.";
  return null;
}

export type CanonicalTransferCandidate = {
  id: string;
  sourceAccountId: string;
  targetAccountId: string;
  amount: number;
  date: string;
};

const dayNumber = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);

export function matchCanonicalTransfer(
  candidates: CanonicalTransferCandidate[],
  input: Omit<CanonicalTransferCandidate, "id">,
  toleranceDays = 3,
):
  | { status: "none" }
  | { status: "matched"; transactionId: string }
  | { status: "ambiguous"; transactionIds: string[] } {
  const inputDay = dayNumber(input.date);
  const matches = candidates.filter(
    (candidate) =>
      candidate.sourceAccountId === input.sourceAccountId &&
      candidate.targetAccountId === input.targetAccountId &&
      Math.abs(candidate.amount - input.amount) < 0.005 &&
      Math.abs(dayNumber(candidate.date) - inputDay) <= toleranceDays,
  );
  if (!matches.length) return { status: "none" };
  if (matches.length === 1) return { status: "matched", transactionId: matches[0]!.id };
  return { status: "ambiguous", transactionIds: matches.map((candidate) => candidate.id) };
}

export function transferPerspective(
  viewedAccountId: string,
  sourceAccountId: string,
  targetAccountId: string,
  amount: number,
) {
  if (viewedAccountId === sourceAccountId) {
    return {
      direction: "debit" as const,
      signedAmount: -Math.abs(amount),
      counterpartyAccountId: targetAccountId,
    };
  }
  if (viewedAccountId === targetAccountId) {
    return {
      direction: "credit" as const,
      signedAmount: Math.abs(amount),
      counterpartyAccountId: sourceAccountId,
    };
  }
  return null;
}

export function buildTransferEvidenceDescriptor(input: {
  accountId: string;
  date: string;
  amount: number;
  direction: StatementDirection;
  description: string;
  rowKey?: string;
}) {
  const description = input.description.replace(/\s+/g, " ").trim().toLocaleUpperCase();
  return [
    input.accountId,
    input.date,
    Math.abs(input.amount).toFixed(2),
    input.direction,
    description,
    input.rowKey ?? "",
  ].join("\u0000");
}

/** Keep statement-only metadata out of the transactions table insert payload. */
export function transactionInsertFields(input: {
  txn_date: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  category_id?: string | null;
  merchant?: string | null;
  note?: string | null;
  split_parent_id?: string | null;
  transfer_account_id?: string | null;
  normalized_pattern?: string;
  statement_direction?: StatementDirection;
  statement_row_key?: string;
  raw_transaction_id?: string | null;
  economic_type?: EconomicType;
  value_date?: string | null;
  original_reference?: string | null;
  payment_rail?: string;
  classification_confidence?: number;
  classification_source?: string;
  classification_reasons?: string[];
  source_fingerprint?: string;
  canonical_entity_id?: string | null;
  processor_entity_id?: string | null;
  recurring_mandate_id?: string | null;
}) {
  return {
    txn_date: input.txn_date,
    amount: input.amount,
    type: input.type,
    category_id: input.category_id ?? null,
    merchant: input.merchant ?? null,
    note: input.note ?? null,
    split_parent_id: input.split_parent_id ?? null,
    transfer_account_id: input.transfer_account_id ?? null,
    normalized_pattern: input.normalized_pattern ?? null,
    raw_transaction_id: input.raw_transaction_id ?? null,
    economic_type: input.economic_type ?? (input.type === "transfer" ? "INTERNAL_TRANSFER" : "UNKNOWN"),
    statement_direction: input.statement_direction ?? null,
    value_date: input.value_date ?? null,
    original_reference: input.original_reference ?? null,
    payment_rail: input.payment_rail ?? null,
    classification_confidence: input.classification_confidence ?? null,
    classification_source: input.classification_source ?? null,
    classification_reasons: input.classification_reasons ?? [],
    source_fingerprint: input.source_fingerprint ?? null,
    interpretation_version: "financial-events-v1",
    canonical_entity_id: input.canonical_entity_id ?? null,
    processor_entity_id: input.processor_entity_id ?? null,
    recurring_mandate_id: input.recurring_mandate_id ?? null,
  };
}
