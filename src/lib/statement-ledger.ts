export type LedgerControlTotals = {
  openingBalance: number | null;
  closingBalance: number | null;
  debitTotal: number | null;
  creditTotal: number | null;
  debitCount: number | null;
  creditCount: number | null;
};

export type LedgerTransaction = {
  amount: number;
  type: "income" | "expense" | "transfer";
};

export type LedgerReconciliation = LedgerControlTotals & {
  parsedDebitTotal: number;
  parsedCreditTotal: number;
  parsedDebitCount: number;
  parsedCreditCount: number;
  balanceDelta: number | null;
  debitDelta: number | null;
  creditDelta: number | null;
  reconciled: boolean;
  errors: string[];
};

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replace(/[₹,$\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Extract bank-provided controls without assuming a fixed footer row number. */
export function extractLedgerControls(aoa: unknown[][]): LedgerControlTotals | null {
  for (let index = 0; index < aoa.length - 1; index += 1) {
    const labels = Array.from(aoa[index] ?? [], (cell) =>
      String(cell ?? "")
        .trim()
        .toLowerCase(),
    );
    if (
      !labels.includes("opening balance") ||
      !labels.some((label) => label.includes("closing bal"))
    )
      continue;
    const values = aoa[index + 1] ?? [];
    const openingIndex = labels.findIndex((label) => label === "opening balance");
    const debitIndex = labels.findIndex((label) => label === "debits");
    const creditIndex = labels.findIndex((label) => label === "credits");
    const closingIndex = labels.findIndex((label) => label.includes("closing bal"));
    let debitCount: number | null = null;
    let creditCount: number | null = null;
    const countLabels = Array.from(aoa[index + 2] ?? [], (cell) =>
      String(cell ?? "")
        .trim()
        .toLowerCase(),
    );
    const counts = aoa[index + 3] ?? [];
    const drCountIndex = countLabels.findIndex((label) => label.includes("dr count"));
    const crCountIndex = countLabels.findIndex((label) => label.includes("cr count"));
    if (drCountIndex >= 0) debitCount = numeric(counts[drCountIndex]);
    if (crCountIndex >= 0) creditCount = numeric(counts[crCountIndex]);
    return {
      openingBalance: numeric(values[openingIndex]),
      debitTotal: numeric(values[debitIndex]),
      creditTotal: numeric(values[creditIndex]),
      closingBalance: numeric(values[closingIndex]),
      debitCount,
      creditCount,
    };
  }
  return null;
}

export function reconcileLedger(
  transactions: LedgerTransaction[],
  controls: LedgerControlTotals | null,
): LedgerReconciliation {
  const debits = transactions.filter((transaction) => transaction.type === "expense");
  const credits = transactions.filter((transaction) => transaction.type === "income");
  const parsedDebitTotal = money(
    debits.reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0),
  );
  const parsedCreditTotal = money(
    credits.reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0),
  );
  const balanceDelta =
    controls?.openingBalance != null && controls.closingBalance != null
      ? money(
          controls.openingBalance - parsedDebitTotal + parsedCreditTotal - controls.closingBalance,
        )
      : null;
  const debitDelta =
    controls?.debitTotal == null ? null : money(parsedDebitTotal - controls.debitTotal);
  const creditDelta =
    controls?.creditTotal == null ? null : money(parsedCreditTotal - controls.creditTotal);
  const errors: string[] = [];
  if (!controls) errors.push("Statement does not expose ledger control totals");
  if (controls?.debitCount != null && controls.debitCount !== debits.length)
    errors.push(`Debit count mismatch: expected ${controls.debitCount}, parsed ${debits.length}`);
  if (controls?.creditCount != null && controls.creditCount !== credits.length)
    errors.push(
      `Credit count mismatch: expected ${controls.creditCount}, parsed ${credits.length}`,
    );
  if (debitDelta != null && Math.abs(debitDelta) > 0.005)
    errors.push(`Debit total mismatch: delta ${debitDelta.toFixed(2)}`);
  if (creditDelta != null && Math.abs(creditDelta) > 0.005)
    errors.push(`Credit total mismatch: delta ${creditDelta.toFixed(2)}`);
  if (balanceDelta != null && Math.abs(balanceDelta) > 0.005)
    errors.push(`Balance reconciliation failed: delta ${balanceDelta.toFixed(2)}`);
  return {
    openingBalance: controls?.openingBalance ?? null,
    closingBalance: controls?.closingBalance ?? null,
    debitTotal: controls?.debitTotal ?? null,
    creditTotal: controls?.creditTotal ?? null,
    debitCount: controls?.debitCount ?? null,
    creditCount: controls?.creditCount ?? null,
    parsedDebitTotal,
    parsedCreditTotal,
    parsedDebitCount: debits.length,
    parsedCreditCount: credits.length,
    balanceDelta,
    debitDelta,
    creditDelta,
    reconciled: errors.length === 0,
    errors,
  };
}
