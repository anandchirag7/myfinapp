export const WEB_ENRICHMENT_NOTICE_VERSION = "2026-09-02";

export type CounterpartyKind = "business" | "person" | "self" | "employer" | "bank" | "unknown";

export type WebEligibility =
  | { eligible: true; query: string; sanitizedCandidate: string }
  | { eligible: false; reason: string };

const SENSITIVE = [
  /\b\d{9,18}\b/, // accounts, cards, phone numbers and long references
  /\b(?:utr|rrn|ref(?:erence)?|account|acct|a\/c|card)\b/i,
  /\b[\w.+-]+@(?:ybl|ibl|paytm|ok\w+|upi|axl|apl|sbi|hdfcbank)\b/i,
  /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/,
  /(?:₹|rs\.?|inr)\s*\d/i,
];

const BUSINESS_SIGNAL =
  /\b(?:ltd|limited|pvt|private|store|mart|hotel|restaurant|cafe|pharmacy|hospital|foods?|services?|technologies|airlines|insurance|retail)\b/i;

const looksLikePersonName = (value: string) => {
  const words = value.split(/\s+/);
  return (
    words.length >= 2 &&
    words.length <= 4 &&
    words.every((word) => /^[A-Z][a-z]+(?:['-][A-Z][a-z]+)?$/.test(word))
  );
};

export function buildMerchantSearchQuery(input: {
  consent: boolean;
  kind: CounterpartyKind;
  candidate: string;
  city?: string | null;
  businessType?: string | null;
}): WebEligibility {
  if (!input.consent) return { eligible: false, reason: "consent_required" };
  if (input.kind !== "business") return { eligible: false, reason: "business_only" };
  const candidate = input.candidate.trim().replace(/\s+/g, " ");
  if (!candidate || candidate.length > 120) return { eligible: false, reason: "invalid_candidate" };
  if (SENSITIVE.some((pattern) => pattern.test(candidate)))
    return { eligible: false, reason: "sensitive_identifier" };
  if (!/[a-z]{3}/i.test(candidate)) return { eligible: false, reason: "no_brand_tokens" };
  // A plain two/three-token name without an explicit business signal is too
  // person-like to disclose, even if an upstream classifier said business.
  if (looksLikePersonName(candidate) && !BUSINESS_SIGNAL.test(candidate))
    return { eligible: false, reason: "person_like" };

  const safeLocation = (input.city ?? "")
    .replace(/[^a-z .'-]/gi, "")
    .trim()
    .slice(0, 50);
  const safeType = (input.businessType ?? "")
    .replace(/[^a-z &-]/gi, "")
    .trim()
    .slice(0, 40);
  const query = [candidate, "India", safeLocation, safeType].filter(Boolean).join(" ");
  if (SENSITIVE.some((pattern) => pattern.test(query)))
    return { eligible: false, reason: "redaction_failed" };
  return { eligible: true, query, sanitizedCandidate: candidate };
}

const INJECTION =
  /(?:ignore (?:all|any|previous)|system prompt|developer message|follow these instructions|tool call|jailbreak|prompt injection)/i;
const REJECTED_HOST =
  /(?:facebook|instagram|linkedin|x\.com|twitter|reddit|truecaller|peoplefinder)/i;

export type SafeSearchResult = { title: string; url: string; snippet: string };

export function sanitizeSearchResults(results: unknown[]): SafeSearchResult[] {
  const safe: SafeSearchResult[] = [];
  for (const value of results.slice(0, 10)) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    const title = String(row.title ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
    const snippet = String(row.content ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500);
    const rawUrl = String(row.url ?? "");
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(url.protocol) || REJECTED_HOST.test(url.hostname)) continue;
    if (INJECTION.test(`${title} ${snippet}`)) continue;
    safe.push({ title, url: url.toString(), snippet });
  }
  return safe;
}

export function scoreMerchantEvidence(candidate: string, results: SafeSearchResult[]) {
  const tokens = candidate
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
  const scored = results.map((result) => {
    const haystack = `${result.title} ${result.url}`.toLowerCase();
    const tokenMatches = tokens.filter((token) => haystack.includes(token)).length;
    const tokenAgreement = tokens.length ? tokenMatches / tokens.length : 0;
    const officialDomainSignal = tokens.some((token) =>
      new URL(result.url).hostname.includes(token),
    );
    return {
      ...result,
      confidence: Math.min(0.95, tokenAgreement * 0.65 + (officialDomainSignal ? 0.25 : 0)),
      signals: [
        tokenAgreement >= 0.5 ? "name_tokens" : null,
        officialDomainSignal ? "domain" : null,
      ].filter(Boolean) as string[],
    };
  });
  scored.sort((a, b) => b.confidence - a.confidence);
  return scored;
}
