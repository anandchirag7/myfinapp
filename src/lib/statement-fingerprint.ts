export type PaymentRail =
  | "upi"
  | "imps"
  | "neft"
  | "rtgs"
  | "ach"
  | "nach"
  | "ecs"
  | "card"
  | "pos"
  | "atm"
  | "cheque"
  | "bank"
  | "unknown";
export type StatementEventType =
  | "purchase"
  | "refund"
  | "reversal"
  | "salary"
  | "dividend"
  | "interest"
  | "fee"
  | "mandate"
  | "cash"
  | "transfer"
  | "unknown";
export type CounterpartyKind = "business" | "person" | "employer" | "self" | "bank" | "unknown";

export type NarrationFingerprint = {
  parserVersion: string;
  bankFormat: string;
  rail: PaymentRail;
  direction: "debit" | "credit";
  eventType: StatementEventType;
  counterpartyDisplay: string | null;
  counterpartyKey: string | null;
  counterpartyKind: CounterpartyKind;
  vpaFingerprint: string | null;
  accountFingerprint: string | null;
  merchantIdFingerprint: string | null;
  mcc: string | null;
  city: string | null;
  purposeTokens: string[];
  providerTokens: string[];
};

export const NARRATION_PARSER_VERSION = "2.0.0";

export type BankNarrationParser = {
  id: string;
  matches: (bankFormat: string) => boolean;
  normalize: (raw: string) => string;
};

/** Known-bank parsers run first; the generic parser must remain conservative. */
export const BANK_NARRATION_PARSERS: readonly BankNarrationParser[] = [
  {
    id: "hdfc-v1",
    matches: (bank) => /\bHDFC\b/i.test(bank),
    normalize: (raw) => raw.replace(/\s+-\s+/g, "-").trim(),
  },
  {
    id: "generic-v1",
    matches: () => true,
    normalize: (raw) => raw.trim(),
  },
];

const providers = [
  "PAYTM",
  "PHONEPE",
  "RAZORPAY",
  "RZP",
  "CASHFREE",
  "PAYU",
  "BILLDESK",
  "CCAVENUE",
];
const cities = [
  "MUMBAI",
  "DELHI",
  "BANGALORE",
  "BENGALURU",
  "CHENNAI",
  "HYDERABAD",
  "PUNE",
  "KOLKATA",
  "GURGAON",
  "GURUGRAM",
  "NOIDA",
];

function railOf(raw: string): PaymentRail {
  const value = raw.toUpperCase().trim();
  if (/^(?:UPI\b|.*\bUPI\b)/.test(value)) return "upi";
  if (/\bIMPS\b/.test(value)) return "imps";
  if (/\bNEFT\b/.test(value)) return "neft";
  if (/\bRTGS\b/.test(value)) return "rtgs";
  if (/\bNACH\b/.test(value)) return "nach";
  if (/\b(?:ACH|ACHD|ACHC)\b/.test(value)) return "ach";
  if (/\bECS\b/.test(value)) return "ecs";
  if (/\b(?:ATM|ATW|NWD)\b/.test(value)) return "atm";
  if (/\bPOS\b/.test(value)) return "pos";
  if (/\b(?:CARD|VISA|MASTERCARD|RUPAY)\b/.test(value)) return "card";
  if (/\b(?:CHQ|CHEQUE)\b/.test(value)) return "cheque";
  if (/\b(?:IB|BANK|FUNDS TRANSFER)\b/.test(value)) return "bank";
  return "unknown";
}

function eventOf(raw: string, direction: "debit" | "credit"): StatementEventType {
  const value = raw.toUpperCase();
  if (/\bSALARY\b/.test(value)) return "salary";
  if (/\b(?:DIVIDEND|DIVIDEND PAYOUT|CORPORATE ACTION|ISIN)\b/.test(value)) return "dividend";
  if (/\bINTEREST\b/.test(value)) return "interest";
  if (/\b(?:REFUND|RETURN)\b/.test(value)) return "refund";
  if (/\b(?:REVERSAL|REVERSED|REVERSD|CHARGEBACK)\b/.test(value)) return "reversal";
  if (/\b(?:MANDATE|AUTOPAY|NACH|ECS|SUBSCHARGE)\b/.test(value)) return "mandate";
  if (/\b(?:CHARGE|FEE|PENALTY)\b/.test(value)) return "fee";
  if (/\b(?:ATM|ATW|CASH WITHDRAWAL)\b/.test(value)) return "cash";
  if (/\b(?:FUNDS TRANSFER|SELF TRANSFER|OWN ACCOUNT|IMPS|NEFT|RTGS)\b/.test(value))
    return "transfer";
  if (direction === "credit" && /\b(?:REF|REV)\b/.test(value)) return "refund";
  return /\b(?:UPI|POS|PURCHASE|CARD)\b/.test(value) ? "purchase" : "unknown";
}

async function scopedHash(scopeSalt: string, value: string | undefined): Promise<string | null> {
  if (!value) return null;
  const bytes = new TextEncoder().encode(`${scopeSalt}\u0000${value.toLowerCase()}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest).slice(0, 16), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function cleanDisplay(value: string): string | null {
  const cleaned = value
    .replace(/\bBY WHATSAPP\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}

export async function parseNarrationFingerprint(input: {
  raw: string;
  direction: "debit" | "credit";
  bankFormat: string;
  scopeSalt: string;
  normalizedPattern: string;
  accountHolderTokens?: string[];
}): Promise<NarrationFingerprint> {
  const parser = BANK_NARRATION_PARSERS.find((candidate) => candidate.matches(input.bankFormat))!;
  const upper = parser.normalize(input.raw).toUpperCase();
  const rail = railOf(upper);
  const eventType = eventOf(upper, input.direction);
  const vpaMatch = upper.match(/(?:^|[-/\s])([A-Z0-9._]{3,})@([A-Z0-9._]{2,})\b/);
  const vpa = vpaMatch ? `${vpaMatch[1]}@${vpaMatch[2]}` : undefined;
  const account =
    upper.match(/\b(?:A\/C|ACCT?|ACCOUNT|XX+)[-\s:]*(\d{4,})\b/)?.[1] ??
    upper.match(/\bX{3,}\d{3,}\b/)?.[0];
  const merchantId = upper.match(/\b(?:MID|MERCHANT ID)[-\s:]*(\w{4,})\b/)?.[1];
  const mcc = upper.match(/\bMCC[-\s:]*(\d{4})\b/)?.[1] ?? null;
  const city = cities.find((candidate) => new RegExp(`\\b${candidate}\\b`).test(upper)) ?? null;
  const providerTokens = providers.filter((provider) =>
    new RegExp(`\\b${provider}\\b`).test(upper),
  );
  const display = cleanDisplay(input.normalizedPattern);
  const holderTokens = (input.accountHolderTokens ?? []).filter((token) => token.length > 2);
  const holderMatch =
    holderTokens.length > 0 && holderTokens.every((token) => upper.includes(token.toUpperCase()));
  const likelyPerson = rail === "upi" && !!vpa && /^\d/.test(vpa);
  const counterpartyKind: CounterpartyKind =
    eventType === "salary"
      ? "employer"
      : holderMatch
        ? "self"
        : likelyPerson
          ? "person"
          : display
            ? "business"
            : "unknown";
  const purposeTokens = Array.from(
    new Set([eventType, ...(eventType === "mandate" ? ["recurring"] : [])]),
  ).filter((token) => token !== "unknown");
  return {
    parserVersion: NARRATION_PARSER_VERSION,
    bankFormat: parser.id,
    rail,
    direction: input.direction,
    eventType,
    counterpartyDisplay: display,
    counterpartyKey: display?.toUpperCase() ?? null,
    counterpartyKind,
    vpaFingerprint: await scopedHash(input.scopeSalt, vpa),
    accountFingerprint: await scopedHash(input.scopeSalt, account),
    merchantIdFingerprint: await scopedHash(input.scopeSalt, merchantId),
    mcc,
    city,
    purposeTokens,
    providerTokens,
  };
}

export function semanticMergeAllowed(a: NarrationFingerprint, b: NarrationFingerprint): boolean {
  if (
    a.direction !== b.direction &&
    !(["refund", "reversal"].includes(a.eventType) || ["refund", "reversal"].includes(b.eventType))
  )
    return false;
  if (
    a.counterpartyKind !== "unknown" &&
    b.counterpartyKind !== "unknown" &&
    a.counterpartyKind !== b.counterpartyKind
  )
    return false;
  if (
    ["person", "self", "employer"].includes(a.counterpartyKind) ||
    ["person", "self", "employer"].includes(b.counterpartyKind)
  ) {
    return (
      a.counterpartyKind === b.counterpartyKind &&
      a.counterpartyKey === b.counterpartyKey &&
      !!(
        (a.vpaFingerprint && a.vpaFingerprint === b.vpaFingerprint) ||
        (a.accountFingerprint && a.accountFingerprint === b.accountFingerprint)
      )
    );
  }
  // A cluster currently owns one category/type decision, so two explicit event
  // semantics must not share it. Unknown remains a conservative wildcard.
  if (a.eventType !== "unknown" && b.eventType !== "unknown" && a.eventType !== b.eventType)
    return false;
  return true;
}

export function transactionTypeForFingerprint(
  fingerprint: NarrationFingerprint,
): "income" | "expense" | "transfer" {
  if (fingerprint.counterpartyKind === "self" && fingerprint.eventType === "transfer") {
    return "transfer";
  }
  if (["salary", "dividend", "interest", "refund", "reversal"].includes(fingerprint.eventType)) {
    return "income";
  }
  return fingerprint.direction === "credit" ? "income" : "expense";
}

export type ReversalCandidate = {
  date: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  pattern: string;
  fingerprint: NarrationFingerprint;
  reversal_group_id?: string;
};

export function linkReversalGroups<T extends ReversalCandidate>(transactions: T[]): T[] {
  const unmatchedDebits = new Map<string, T[]>();
  for (const transaction of transactions) {
    const identity = transaction.fingerprint.counterpartyKey ?? transaction.pattern;
    const key = `${identity}\u0000${Math.abs(transaction.amount).toFixed(2)}`;
    if (transaction.type === "expense") {
      const list = unmatchedDebits.get(key) ?? [];
      list.push(transaction);
      unmatchedDebits.set(key, list);
      continue;
    }
    if (!["refund", "reversal"].includes(transaction.fingerprint.eventType)) continue;
    const debit = (unmatchedDebits.get(key) ?? []).find((candidate) => {
      const days = Math.abs(Date.parse(transaction.date) - Date.parse(candidate.date)) / 86_400_000;
      return days <= 30 && !candidate.reversal_group_id;
    });
    if (!debit) continue;
    const groupId = `reversal:${debit.date}:${transaction.date}:${Math.abs(transaction.amount).toFixed(2)}:${identity}`;
    debit.reversal_group_id = groupId;
    transaction.reversal_group_id = groupId;
  }
  return transactions;
}
