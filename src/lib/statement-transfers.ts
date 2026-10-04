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
  };
}
