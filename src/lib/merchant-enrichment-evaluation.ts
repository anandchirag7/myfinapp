import { buildMerchantSearchQuery, type SafeSearchResult } from "./merchant-web-enrichment";

export type EnrichmentGoldCase = {
  candidate: string;
  kind: "business" | "person";
  expectedHost?: string;
  results: SafeSearchResult[];
};

export function evaluateEnrichmentShadow(cases: readonly EnrichmentGoldCase[]) {
  let eligible = 0;
  let correct = 0;
  let piiQueries = 0;
  let personQueries = 0;
  for (const item of cases) {
    const gate = buildMerchantSearchQuery({
      consent: true,
      kind: item.kind,
      candidate: item.candidate,
    });
    if (!gate.eligible) continue;
    eligible++;
    if (item.kind === "person") personQueries++;
    if (/\d{9,}|@\w+|\b(?:utr|rrn|account|card)\b/i.test(gate.query)) piiQueries++;
    if (
      item.expectedHost &&
      item.results.some((result) => new URL(result.url).hostname === item.expectedHost)
    ) {
      correct++;
    }
  }
  return {
    total: cases.length,
    eligible,
    correct,
    precision: eligible ? correct / eligible : 0,
    piiQueries,
    personQueries,
    passesPrivacy: piiQueries === 0 && personQueries === 0,
    passesPrecision: eligible > 0 && correct / eligible >= 0.95,
  };
}
