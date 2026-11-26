import type { HdfcNarration } from "./hdfc-narration";

export type FinancialIdentity = {
  canonicalName: string | null;
  familyName: string | null;
  processorName: string | null;
  confidence: number;
  reasons: string[];
};

export function resolveFinancialIdentity(
  description: string,
  narration?: Pick<HdfcNarration, "processor">,
): FinancialIdentity {
  const text = description.toUpperCase().replace(/\s+/g, " ");
  let canonicalName: string | null = null;
  let familyName: string | null = null;
  const reasons: string[] = [];

  if (/\b(?:ZERODHA|INDIAN CLEARING CORP|ICCL)\b/.test(text)) {
    canonicalName = /\b(?:INDIAN CLEARING CORP|ICCL)\b/.test(text) ? "INDIAN CLEARING CORPORATION" : "ZERODHA";
    familyName = "ZERODHA";
    reasons.push("Matched the Zerodha/ICCL financial family.");
  } else if (/\b(?:INDMONEY|FINZOOMERS)\b/.test(text)) {
    canonicalName = /\bFINZOOMERS\b/.test(text) ? "FINZOOMERS SERVICES" : "INDMONEY";
    familyName = "INDMONEY";
    reasons.push("Matched the INDmoney/Finzoomers financial family.");
  } else if (/\bCRED(?: CLUB)?\b/.test(text)) {
    canonicalName = "CRED";
    familyName = "CRED";
    reasons.push("Matched CRED as the financial counterparty.");
  } else if (/\bRACPC\b/.test(text)) {
    canonicalName = "HDFC BANK RACPC";
    familyName = "HDFC BANK";
    reasons.push("Matched the HDFC retail asset servicing centre.");
  } else if (/\bTATA AIA\b/.test(text)) {
    canonicalName = "TATA AIA LIFE";
    familyName = "TATA AIA LIFE";
    reasons.push("Matched the insurance provider.");
  }

  const processorName = narration?.processor ??
    (/\b(?:RAZORPAY|\bRZP\b)\b/.test(text)
      ? "RAZORPAY"
      : /\bPAYU\b/.test(text)
        ? "PAYU"
        : null);
  if (processorName) reasons.push(`Kept ${processorName} as the processor, separate from the counterparty.`);

  return {
    canonicalName,
    familyName,
    processorName,
    confidence: canonicalName || processorName ? 0.99 : 0,
    reasons,
  };
}
