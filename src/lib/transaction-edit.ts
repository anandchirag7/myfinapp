export type TransactionType = "income" | "expense" | "transfer";
export type ClearedStatus = "pending" | "cleared" | "reconciled";
export type MerchantMemoryAction = "transaction_only" | "update_payee" | "create_payee" | "use_existing_payee";

export type TransactionEditValues = {
  type: TransactionType;
  amount: string;
  txn_date: string;
  account_id: string;
  transfer_account_id: string | null;
  category_id: string | null;
  merchant: string;
  memo: string;
  note: string;
  payment_method: string;
  check_number: string;
  tags: string[];
  tax_code: string;
  cleared_status: ClearedStatus;
  is_reviewed: boolean;
  is_flagged: boolean;
  is_favorite: boolean;
};

export type EditableTransaction = Partial<TransactionEditValues> & {
  amount?: string | number | null;
};

export type TransactionEditPatch = Partial<Omit<TransactionEditValues, "amount"> & { amount: number }>;

const TEXT_FIELDS = ["merchant", "memo", "note", "payment_method", "check_number", "tax_code"] as const;
const BALANCE_FIELDS = new Set(["amount", "type", "account_id", "transfer_account_id"]);

export function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const byLower = new Map<string, string>();
  for (const raw of tags) {
    const tag = String(raw).trim().slice(0, 50);
    if (tag && !byLower.has(tag.toLocaleLowerCase())) byLower.set(tag.toLocaleLowerCase(), tag);
    if (byLower.size >= 30) break;
  }
  return [...byLower.values()];
}

export function transactionToEditValues(transaction: EditableTransaction): TransactionEditValues {
  return {
    type: transaction.type ?? "expense",
    amount: transaction.amount == null ? "" : String(transaction.amount),
    txn_date: transaction.txn_date ?? "",
    account_id: transaction.account_id ?? "",
    transfer_account_id: transaction.transfer_account_id || null,
    category_id: transaction.category_id || null,
    merchant: transaction.merchant ?? "",
    memo: transaction.memo ?? "",
    note: transaction.note ?? "",
    payment_method: transaction.payment_method ?? "",
    check_number: transaction.check_number ?? "",
    tags: normalizeTags(transaction.tags),
    tax_code: transaction.tax_code ?? "",
    cleared_status: transaction.cleared_status ?? "pending",
    is_reviewed: transaction.is_reviewed ?? false,
    is_flagged: transaction.is_flagged ?? false,
    is_favorite: transaction.is_favorite ?? false,
  };
}

function comparableValue(key: keyof TransactionEditValues, value: TransactionEditValues[keyof TransactionEditValues]) {
  if (TEXT_FIELDS.includes(key as (typeof TEXT_FIELDS)[number])) return String(value ?? "").trim();
  if (key === "tags") return normalizeTags(value).join("\u0000");
  if (key === "amount") return Number(value);
  return value ?? null;
}

export function buildTransactionEditPatch(
  original: TransactionEditValues,
  next: TransactionEditValues,
): TransactionEditPatch {
  const normalizedNext: TransactionEditValues = {
    ...next,
    amount: String(Number(next.amount)),
    transfer_account_id: next.type === "transfer" ? next.transfer_account_id || null : null,
    category_id: next.type === "transfer" ? null : next.category_id || null,
    tags: normalizeTags(next.tags),
  };
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(normalizedNext) as (keyof TransactionEditValues)[]) {
    if (comparableValue(key, original[key]) === comparableValue(key, normalizedNext[key])) continue;
    if (key === "amount") patch.amount = Number(normalizedNext.amount);
    else if (TEXT_FIELDS.includes(key as (typeof TEXT_FIELDS)[number])) patch[key] = String(normalizedNext[key] ?? "").trim() || null;
    else patch[key] = normalizedNext[key];
  }
  return patch as TransactionEditPatch;
}

export function isMeaningfulMerchantChange(original: string | null | undefined, next: string | null | undefined): boolean {
  return (original ?? "").trim().toLocaleLowerCase() !== (next ?? "").trim().toLocaleLowerCase();
}

export function validateTransactionEdit(
  values: TransactionEditValues,
  categoryKind?: string | null,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const amount = Number(values.amount);
  if (!Number.isFinite(amount) || amount <= 0) errors.amount = "Enter an amount greater than zero.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.txn_date) || Number.isNaN(Date.parse(`${values.txn_date}T00:00:00Z`))) {
    errors.txn_date = "Enter a valid transaction date.";
  }
  if (!values.account_id) errors.account_id = "Select an account.";
  if (values.merchant.trim().length > 200) errors.merchant = "Merchant must be 200 characters or fewer.";
  if (values.type === "transfer") {
    if (!values.transfer_account_id) errors.transfer_account_id = "Select a destination account.";
    else if (values.transfer_account_id === values.account_id) errors.transfer_account_id = "Source and destination accounts must differ.";
  }
  if (values.type !== "transfer" && categoryKind) {
    const compatible = values.type === "income" ? categoryKind === "income" : categoryKind === "expense" || categoryKind === "investment";
    if (!compatible) errors.category_id = `This category is not compatible with an ${values.type} transaction.`;
  }
  return errors;
}

export function patchRequiresBalanceRecompute(patch: TransactionEditPatch): boolean {
  return Object.keys(patch).some((key) => BALANCE_FIELDS.has(key));
}
