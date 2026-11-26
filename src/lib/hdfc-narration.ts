import type { PaymentRail } from "./statement-fingerprint";

export type HdfcNarrationSubtype =
  | "debit"
  | "credit"
  | "return"
  | "payment"
  | "cash"
  | "fee"
  | "unknown";

export type HdfcNarration = {
  raw: string;
  rail: PaymentRail;
  subtype: HdfcNarrationSubtype;
  counterparty: string | null;
  vpa: string | null;
  bankCode: string | null;
  railReference: string | null;
  originalReference: string | null;
  mandateReference: string | null;
  accountHint: string | null;
  processor: string | null;
  remarks: string | null;
};

const BANK_CODE = /^[A-Z]{4}[A-Z0-9]{3,}$/;
const REFERENCE = /^[A-Z]*\d[A-Z0-9]{7,}$/;
const ACCOUNT_HINT = /^(?:X{3,}\d{3,}|\d{4,})$/;

function clean(value: string | undefined): string | null {
  const result = String(value ?? "").replace(/\s+/g, " ").trim();
  return result || null;
}

function processorOf(raw: string): string | null {
  if (/\b(?:RAZORPAY|\bRZP\b)/i.test(raw)) return "RAZORPAY";
  if (/\bPAYU\b/i.test(raw)) return "PAYU";
  if (/\bCASHFREE\b/i.test(raw)) return "CASHFREE";
  if (/\bBILLDESK\b/i.test(raw)) return "BILLDESK";
  if (/\bCRED\b/i.test(raw)) return "CRED";
  return null;
}

function base(raw: string, rail: PaymentRail): HdfcNarration {
  return {
    raw,
    rail,
    subtype: "unknown",
    counterparty: null,
    vpa: null,
    bankCode: null,
    railReference: null,
    originalReference: null,
    mandateReference: null,
    accountHint: null,
    processor: processorOf(raw),
    remarks: null,
  };
}

/** Parses stable HDFC narration positions without treating free text as truth. */
export function parseHdfcNarration(rawInput: string): HdfcNarration {
  const raw = String(rawInput ?? "").trim();
  const upper = raw.toUpperCase();
  const parts = raw.split("-").map((part) => part.trim());

  if (/^UPIRET(?:-|\b)/i.test(raw)) {
    const parsed = base(raw, "upi");
    parsed.subtype = "return";
    parsed.originalReference = clean(parts.find((part, index) => index > 0 && /^\d{8,}$/.test(part)));
    parsed.railReference = parsed.originalReference;
    parsed.counterparty = clean(parts[2]);
    parsed.remarks = clean(parts.slice(3).join("-"));
    return parsed;
  }

  if (/^UPI(?:-|\b)/i.test(raw)) {
    const parsed = base(raw, "upi");
    parsed.subtype = "payment";
    parsed.counterparty = clean(parts[1]);
    const vpaIndex = parts.findIndex((part) => /^[A-Z0-9._-]{2,}@[A-Z0-9._-]{2,}$/i.test(part));
    if (vpaIndex >= 0) {
      parsed.vpa = clean(parts[vpaIndex])?.toUpperCase() ?? null;
      const tail = parts.slice(vpaIndex + 1);
      parsed.bankCode = clean(tail.find((part) => BANK_CODE.test(part.toUpperCase())))?.toUpperCase() ?? null;
      parsed.railReference = clean(tail.find((part) => /^\d{9,}$/.test(part)));
      const referenceIndex = parsed.railReference
        ? parts.findIndex((part) => part === parsed.railReference)
        : -1;
      parsed.remarks = referenceIndex >= 0 ? clean(parts.slice(referenceIndex + 1).join("-")) : null;
    }
    return parsed;
  }

  const ach = raw.match(/^(ACH|NACH|ECS)\s*([DC])?\s*-\s*(.*)$/i);
  if (ach) {
    const rail = ach[1]!.toLowerCase() as PaymentRail;
    const parsed = base(raw, rail);
    parsed.subtype = ach[2]?.toUpperCase() === "C" ? "credit" : ach[2]?.toUpperCase() === "D" ? "debit" : "unknown";
    const body = ach[3]!.split("-").map((part) => part.trim()).filter(Boolean);
    parsed.counterparty = clean(body[0]);
    parsed.mandateReference = clean(body.at(-1));
    parsed.railReference = parsed.mandateReference;
    return parsed;
  }

  if (/^IMPS(?:-|\b)/i.test(raw)) {
    const parsed = base(raw, "imps");
    parsed.subtype = /(?:^|-)CR(?:-|$)/i.test(raw) ? "credit" : "payment";
    parsed.railReference = clean(parts[1]);
    parsed.counterparty = clean(parts[2]);
    parsed.bankCode = clean(parts.find((part, index) => index >= 3 && /^[A-Z]{4}$/.test(part.toUpperCase())))?.toUpperCase() ?? null;
    parsed.accountHint = clean(parts.find((part, index) => index >= 3 && ACCOUNT_HINT.test(part.toUpperCase())))?.toUpperCase() ?? null;
    parsed.remarks = clean(parts.at(-1));
    return parsed;
  }

  if (/^(?:NEFT|RTGS)(?:\s|\b)/i.test(raw)) {
    const rail: PaymentRail = /^RTGS/i.test(raw) ? "rtgs" : "neft";
    const parsed = base(raw, rail);
    parsed.subtype = /^(?:NEFT|RTGS)\s+CR-/i.test(raw)
      ? "credit"
      : /^(?:NEFT|RTGS)\s+DR-/i.test(raw)
        ? "debit"
        : "unknown";
    parsed.bankCode = clean(parts.find((part) => BANK_CODE.test(part.toUpperCase())))?.toUpperCase() ?? null;
    parsed.railReference = clean(
      [...parts].reverse().find((part) => REFERENCE.test(part.toUpperCase()) && part.toUpperCase() !== parsed.bankCode),
    )?.toUpperCase() ?? null;
    const bankIndex = parsed.bankCode ? parts.findIndex((part) => part.toUpperCase() === parsed.bankCode) : -1;
    parsed.counterparty = bankIndex >= 0 ? clean(parts[bankIndex + 1]) : null;
    return parsed;
  }

  if (/\b(?:ATM|ATW|CASH WITHDRAWAL)\b/i.test(raw)) {
    const parsed = base(raw, "atm");
    parsed.subtype = "cash";
    return parsed;
  }

  if (/\b(?:CHARGE|FEE|PENALTY)\b/i.test(raw)) {
    const parsed = base(raw, "bank");
    parsed.subtype = "fee";
    return parsed;
  }

  return base(raw, "unknown");
}
