import {
  buildMerchantSearchQuery,
  sanitizeSearchResults,
  scoreMerchantEvidence,
  WEB_ENRICHMENT_NOTICE_VERSION,
  type CounterpartyKind,
} from "./merchant-web-enrichment";

const OLLAMA_WEB_SEARCH_URL = "https://ollama.com/api/web_search";
export const OLLAMA_WEB_SEARCH_TAG = "ollama-web-search" as const;

export function getMerchantWebEnrichmentCapability(env = process.env) {
  const enabled = Boolean(env.OLLAMA_API_KEY?.trim());
  return {
    tag: OLLAMA_WEB_SEARCH_TAG,
    enabled,
    state: enabled ? ("enabled" as const) : ("skipped_no_api_key" as const),
    provider: "ollama" as const,
    mode: "shadow" as const,
  };
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function runMerchantEnrichmentShadow(opts: {
  admin: any;
  householdId: string;
  userId: string;
  candidate: string;
  kind: CounterpartyKind;
  city?: string | null;
  businessType?: string | null;
  fetchImpl?: typeof fetch;
}) {
  const capability = getMerchantWebEnrichmentCapability();
  if (!capability.enabled) {
    return { status: "skipped" as const, capability };
  }
  const { data: profile } = await opts.admin
    .from("profiles")
    .select(
      "statement_web_enrichment_consent_at, statement_web_enrichment_provider, statement_web_enrichment_notice_version",
    )
    .eq("id", opts.userId)
    .maybeSingle();
  const consent =
    !!profile?.statement_web_enrichment_consent_at &&
    profile.statement_web_enrichment_provider === "ollama" &&
    profile.statement_web_enrichment_notice_version === WEB_ENRICHMENT_NOTICE_VERSION;
  const eligibility = buildMerchantSearchQuery({ ...opts, consent });
  if (!eligibility.eligible)
    return { status: "ineligible" as const, reason: eligibility.reason, capability };

  const queryHash = await sha256(eligibility.query.toLowerCase());
  const { data: cached } = await opts.admin
    .from("merchant_enrichment_cache")
    .select("status, evidence, expires_at")
    .eq("household_id", opts.householdId)
    .eq("query_hash", queryHash)
    .eq("provider", "ollama")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (cached) return { status: "cached" as const, evidence: cached.evidence, capability };

  const apiKey = process.env.OLLAMA_API_KEY!;
  const response = await (opts.fetchImpl ?? fetch)(OLLAMA_WEB_SEARCH_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: eligibility.query, max_results: 5 }),
  });
  if (!response.ok) throw new Error(`Ollama web search failed with HTTP ${response.status}`);
  const payload = (await response.json()) as { results?: unknown[] };
  const evidence = scoreMerchantEvidence(
    eligibility.sanitizedCandidate,
    sanitizeSearchResults(payload.results ?? []),
  ).slice(0, 3);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (evidence.length ? 30 : 7) * 86_400_000).toISOString();
  await opts.admin.from("merchant_enrichment_cache").upsert(
    {
      household_id: opts.householdId,
      query_hash: queryHash,
      provider: "ollama",
      status: evidence.length ? "hit" : "miss",
      evidence,
      expires_at: expiresAt,
    },
    { onConflict: "household_id,query_hash,provider" },
  );
  // Shadow mode invariant: never return or persist an automatically applied entity.
  return {
    status: evidence.length ? ("suggested" as const) : ("miss" as const),
    evidence,
    autoApply: false,
    capability,
  };
}
