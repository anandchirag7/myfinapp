import type { ExtractedTxn } from "./statement-parse.server";

function canonicalMoney(value: number | null | undefined): string {
  return value == null || !Number.isFinite(Number(value)) ? "" : Number(value).toFixed(2);
}

export function statementSourceDescriptor(transaction: ExtractedTxn): string {
  return [
    transaction.sourceRowNumber ?? "",
    transaction.date,
    transaction.valueDate ?? "",
    transaction.reference?.trim().toUpperCase() ?? "",
    transaction.direction ?? (transaction.type === "income" ? "credit" : "debit"),
    canonicalMoney(transaction.debit),
    canonicalMoney(transaction.credit),
    canonicalMoney(transaction.amount),
    canonicalMoney(transaction.closingBalance),
    transaction.description.replace(/\s+/g, " ").trim().toUpperCase(),
  ].join("\u0000");
}

export async function statementSourceFingerprint(transaction: ExtractedTxn): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(statementSourceDescriptor(transaction)),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
