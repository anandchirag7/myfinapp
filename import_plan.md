# Statement Import: Impeccable, Low-Touch Resolution Plan

Status: proposed for review  
Scope: statement parsing, counterparty resolution, clustering, categorization, learning, Ollama, optional merchant enrichment, and import review UX  
Implementation status: Releases A, B, C, D, and E complete.  
Baseline: `Acct_Statement_XXXXXXXX7576_05082026.xls`

## Executive decision

The next implementation should not try to force the cluster count below an arbitrary number. The supplied statement contains many genuinely different counterparties, especially person-to-person UPI recipients. The correct goal is:

- preserve every ledger transaction;
- never merge different people or different transaction purposes;
- automatically resolve and categorize everything that has sufficient evidence;
- let safe broad defaults import without blocking;
- show the user only genuine conflicts or low-confidence decisions;
- remember every correction so the same decision is not requested again.

Web lookup is possible, but only as a gated enrichment layer for sanitized, business-like merchant candidates. It must never receive raw narrations, likely personal names, VPAs, account/card numbers, UTR/RRN values, dates, amounts, or other banking data. Search evidence can improve a merchant suggestion, but it cannot recover information that the bank did not include and must not be treated as proof by itself.

The recommended order is:

```text
ledger validation
-> rail-aware narration parsing
-> household memory
-> curated global merchant aliases
-> deterministic rules
-> embedding similarity to verified merchants
-> Ollama extraction/classification
-> optional sanitized web evidence
-> risk-based exception review
-> household learning
```

## 1. What the screenshot proves

| Measure                |                Current result |
| ---------------------- | ----------------------------: |
| Parsed transactions    |                           572 |
| Payee clusters         |                           198 |
| Auto-matched           |  45 payees / 297 transactions |
| AI or rule suggested   |     0 payees / 0 transactions |
| Needs review           | 153 payees / 275 transactions |
| New payees             |                           175 |
| Uncategorized clusters |                           158 |

This is not a small quality miss. The Ollama classification layer contributed no accepted result.

### Confirmed causes

1. The checked-in environment points `OLLAMA_BASE_URL` to loopback. Local Ollama is healthy and the configured model exists, but a remotely deployed application resolves `localhost` inside its own container, not to the developer workstation.
2. A one-pattern diagnostic request to the configured `gpt-oss:120b-cloud` model took about 7.5 seconds. The classifier currently sends 35 patterns per request, runs four requests concurrently, and aborts each after 12 seconds. That combination is too aggressive for this endpoint.
3. Batch errors are caught internally. Failed patterns are returned as unresolved, the upload row is then written as `complete`, and its error is cleared. This converts provider failure into an apparently successful partial classification.
4. A valid AI merchant name is discarded if its category does not exactly match an allowed category. Identity resolution and category resolution are incorrectly coupled.
5. The UI displays `Naming ... in the background` whenever a cluster remains pending, even after the database job has reached a terminal state. There is no active background task at that point.
6. Recognized descriptions with no category explain why 158 clusters are uncategorized while 153 clusters need identity review.
7. Resolved patterns are deliberately kept as singleton clusters. Variants that resolve to the same canonical merchant are not merged after lookup or AI resolution.

### Parsing is not the present problem

The XLS contains 572 ledger transactions: 506 debits and 66 credits. The parser returns those exact counts. Its debit and credit totals reconcile the opening balance to the closing balance exactly:

```text
opening balance - debit total + credit total = closing balance
```

This reconciliation must become a permanent import invariant, but the current user-interference problem starts after parsing.

### Residual-pattern profile

An offline pass over the supplied statement leaves approximately these unresolved structures before database-specific matches:

| Structure                          | Patterns | Transactions | Recommended handling                                       |
| ---------------------------------- | -------: | -----------: | ---------------------------------------------------------- |
| Ambiguous or person-like UPI       |       97 |          156 | Exact identity only; broad household default; non-blocking |
| Likely-business UPI                |       21 |           28 | Merchant aliases, Ollama, then optional web evidence       |
| Inbound UPI or refunds             |        9 |           13 | Direction/event-aware rules                                |
| ACH corporate-action credits       |       22 |           22 | Dividend/investment-income parser                          |
| ACH mandates                       |        2 |           28 | Mandate/subscription/insurance parser                      |
| Tata AIA policy variants           |        5 |            7 | Stable policy/merchant fingerprint                         |
| Own, self, or investment transfers |        9 |           31 | Account ownership and transfer-pair rules                  |
| Recurring Intel salary             |        1 |            4 | Employer/cadence rule                                      |
| Opaque numeric/other               |        3 |            6 | Abstain or broad fallback                                  |

The current fuzzy grouper also merges salary, self-transfer, net-banking transfer, and UPI patterns containing the account holder's name. This is an unsafe semantic merge and demonstrates why a lower cluster count cannot be the primary success metric.

## 2. Definition of impeccable

`Impeccable` should mean safe, observable, reversible, and low-touch rather than pretending every lossy narration has a knowable merchant.

### Required acceptance gates for the supplied statement

- Parse exactly 572 transactions, including exactly 506 debits and 66 credits.
- Reconcile debit total, credit total, opening balance, and closing balance with zero unexplained delta.
- Lose or duplicate zero transactions.
- Produce zero false merges between different people, salary, self-transfers, refunds, and purchases.
- Achieve at least 99.5% pairwise precision for auto-created clusters.
- Achieve at least 99% precision for automatically applied merchant identities.
- Achieve at least 97% precision for automatically applied categories.
- Categorize at least 85% of transactions at high confidence on a first import and at least 97% on a repeat import.
- Require no more than 10 blocking decisions on the first import and no more than 2 on a repeat import.
- Finish every Ollama batch as succeeded or explicitly failed; never silently fall back.
- Produce schema-valid Ollama responses for at least 98% of batches before repair/retry.
- Send zero personal/banking data in web queries.
- Require at least 95% measured merchant precision before any web result may be auto-applied.

Unknown person-to-person payment purpose should not block the import. It should receive a safe household-configured broad category or a deferred category and remain correctable later.

## 3. Phase 0 - replace Lovable inference with one Ollama client

### 3.1 Create one server-only provider

Create `src/lib/ollama.server.ts` and route all statement AI work through it. It should own:

- base URL normalization;
- native `/api/chat`, `/api/embed`, `/api/version`, and `/api/tags` calls;
- `OLLAMA_MODEL` and `OLLAMA_EMBED_MODEL` selection;
- optional bearer authentication through `OLLAMA_API_KEY` or a private gateway token;
- timeouts, retry policy, jitter, rate limiting, and `Retry-After` handling;
- JSON extraction, Zod validation, repair attempts, and typed errors;
- request latency, model, token usage, and outcome telemetry without raw descriptions.

There must be no fallback URL to `ai.gateway.lovable.dev`, no `Lovable-API-Key` header, and no `LOVABLE_API_KEY` gate in statement-import inference.

### 3.2 Replace all statement-import inference call sites

- `src/lib/statement-classify.server.ts`
- `src/lib/statement-pipeline.server.ts`
- `src/lib/statement-import.functions.ts`
- `src/lib/statement-parse.server.ts`
- `src/routes/api/public/hooks/statement-classify.ts`

The general chat and transaction-insight AI paths also contain Lovable inference fallback and should later use the same Ollama client:

- `src/lib/ai-gateway.server.ts`
- `src/routes/api/chat.ts`
- `src/lib/transactions.functions.ts`

Do not mechanically replace the Lovable usage in `statement-audit.server.ts` or `whatsapp.server.ts`: those keys authenticate email and Twilio connector services, not AI inference. If the requirement is to eliminate the key from the entire application, email and WhatsApp need separate provider migrations.

### 3.3 Choose a deployment topology that can work

Recommended production choices, in order:

1. **Ollama Cloud direct:** the deployed server calls `https://ollama.com` with `OLLAMA_API_KEY`. This is the simplest topology for the already-selected cloud model.
2. **Private hosted Ollama:** deploy Ollama on a server reachable from the app through HTTPS with gateway authentication, IP restrictions or private networking, rate limiting, and TLS. Never expose unauthenticated port 11434 directly.
3. **Co-hosted local deployment:** run the application and Ollama on the same machine/private network. This preserves local inference but is not compatible with an unrelated cloud deployment using `localhost`.
4. **Secure desktop companion:** a later option if local-only privacy is mandatory while the web app remains hosted. It adds installation, availability, authentication, and update complexity and is not the first recommendation.

### 3.4 Add mandatory provider preflight

At deployment/startup and before an import:

1. call `/api/version`;
2. verify the configured model through `/api/tags`;
3. run a tiny JSON canary;
4. record supported capabilities and latency;
5. warm the model when using a self-hosted instance.

If preflight fails, the UI must say `Ollama unavailable` with a retry action. It must not claim that automatic classification completed.

### 3.5 Use provider-aware request settings

Initial safe defaults:

- 10-15 patterns per batch;
- concurrency 1 for local/self-hosted Ollama and at most 2 for tested remote capacity;
- 90-second batch timeout, adjustable from measured p95 latency;
- three retries with exponential backoff and jitter;
- temperature 0;
- dynamic batch reduction after timeout/rate-limit errors;
- total job deadline with resumable continuation, not lost work.

Self-hosted Ollama can use a JSON schema. Ollama Cloud currently documents that structured outputs are not supported, so cloud behavior must be capability-tested and use strict JSON prompting plus Zod validation/repair when schema enforcement is unavailable.

## 4. Phase 1 - make classification durable and truthful

### 4.1 Use a real job state machine

```text
queued -> running -> partial -> complete
                   -> retrying -> complete
                   -> failed
                   -> cancelled
```

Do not map `partial` to `complete`, and do not clear the last error while failed patterns remain.

Persist:

- total patterns, completed patterns, and failed patterns;
- current batch and attempt;
- heartbeat and last-progress time;
- provider/model/resolver version;
- per-batch latency and typed error code;
- identity result and category result independently;
- retry eligibility and next retry time.

### 4.2 Use a durable queue

Recommended implementation with the existing stack:

- Supabase Queue/`pgmq` for guaranteed message persistence;
- an authenticated Supabase Edge Function or dedicated worker as the consumer;
- `pg_cron` for scheduled retry/recovery;
- an idempotency key based on upload ID, normalized fingerprint, and resolver version;
- visibility timeout, bounded retries, and dead-letter/archive behavior.

`EdgeRuntime.waitUntil` is acceptable for small bounded work, but a durable queue is the safer primary design because Edge Functions have runtime limits and large imports must resume after termination.

### 4.3 Never throw away a partial success

Store these independently for each pattern:

```text
canonical identity
identity confidence/evidence
counterparty kind
category key
category confidence/evidence
transaction type
event type
abstain reason
```

A valid name with an invalid category remains a valid name. Category resolution should try category key, aliases, deterministic broad fallback, and only then abstain.

## 5. Phase 2 - replace destructive normalization with rail-aware parsing

The current single normalized string mixes identity, payment rail, direction, event, and purpose. Removing tokens before understanding their role causes false merges and loses refund/mandate context.

### 5.1 Introduce a versioned narration fingerprint

```ts
type NarrationFingerprint = {
  parserVersion: string;
  bankFormat: string;
  rail:
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
  direction: "debit" | "credit";
  eventType:
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
  counterpartyDisplay: string | null;
  counterpartyKey: string | null;
  counterpartyKind: "business" | "person" | "employer" | "self" | "bank" | "unknown";
  vpaFingerprint: string | null;
  accountFingerprint: string | null;
  merchantIdFingerprint: string | null;
  mcc: string | null;
  city: string | null;
  purposeTokens: string[];
  providerTokens: string[];
};
```

Retain the raw description separately for audit and display. Store only salted/household-scoped hashes for sensitive stable identifiers when the clear value is unnecessary.

### 5.2 Add a bank parser registry

Use a known-bank parser first and a conservative generic parser second. Each parser needs fixtures for:

- UPI P2P, P2A, and P2M;
- card POS and e-commerce descriptors;
- IMPS/NEFT/RTGS transfers;
- ACH/NACH/ECS mandates and corporate actions;
- salary, dividends, interest, refunds, reversals, and bank fees;
- ATM/cash and cheque transactions;
- own-account transfer pairs.

Extract fields by their position and markers before removing bank/processor noise. Keep PSP/provider tokens as evidence but exclude them from the canonical merchant name.

### 5.3 Fix known regression classes

- Keep Intel salary separate from all account-holder/self-transfer patterns.
- Collapse Tata AIA policy variants without losing policy/mandate event type.
- Recognize FINZOOM/INDMONEY variants consistently.
- Preserve Medibuddy during refund processing instead of reducing it to `PG`.
- Remove `BY WHATSAPP` without fragmenting a person's name.
- Recognize McDonald's singular/plural variants.
- Do not reduce `STATE BANK OF INDIA` to `STATE`.
- Preserve refund/reversal context even when a canonical merchant alias is found early.
- Treat matching ACH debit/credit rows as possible debit-return pairs with a `reversal_group_id`, not duplicates.

## 6. Phase 3 - identity-first entity resolution and safe clustering

### 6.1 Resolution priority

1. explicit user override;
2. exact household fingerprint/alias;
3. confirmed saved payee;
4. exact curated global business alias;
5. strong stable identifier match;
6. deterministic bank/rail rule;
7. embedding match against verified merchant entities;
8. Ollama extraction;
9. optional web enrichment;
10. exact cleaned counterparty or safe provisional label.

Every layer returns an evidence record; later layers cannot silently override stronger evidence.

### 6.2 Cluster by entity, not narration similarity

- Merge business variants only when they resolve to the same canonical entity or verified stable identifier.
- Run a post-resolution merge so patterns independently resolved as the same merchant become one cluster.
- For people, require exact normalized name plus the same VPA/account fingerprint or a confirmed household alias.
- Never fuzzy-merge likely people.
- Block merging across person/business/employer/self kinds.
- Block salary, refund, reversal, purchase, and own-transfer semantics from merging merely because names overlap.
- Allow one merchant entity to contain transaction-level events with different categories where appropriate.

### 6.3 Add semantic similarity without making it authoritative

Use Ollama `/api/embed` with an embedding model to retrieve the nearest verified merchant aliases. Embeddings reduce LLM calls and handle spelling variants, but auto-application still requires token/rail/identifier corroboration and calibrated thresholds. Store vectors in `pgvector` with resolver/model versioning.

## 7. Phase 4 - category and transaction type as separate decisions

### 7.1 Use stable keys, not model-generated display names

The model should return a `category_key` from a compact allowed enum. Resolve that key to the household category UUID. Category display names and aliases are presentation concerns and should not invalidate an otherwise useful identity.

### 7.2 Use direction and event-aware deterministic rules first

High-value rules include:

- own-account identifiers -> transfer;
- employer plus recurring credit cadence -> salary;
- corporate-action/ISIN/dividend markers -> investment income;
- same merchant debit followed by matching credit -> refund/reversal relationship;
- bank charge/return markers -> fees;
- ATM/ATW -> cash withdrawal;
- mandate plus known insurer/lender/service -> insurance, EMI, or subscription;
- known MCC, when present, -> category family.

### 7.3 Do not call every external P2P payment an own-account transfer

An external person payment may be rent, reimbursement, a shared bill, a gift, or something else. Recommended default behavior:

- preserve the exact person identity;
- use a household preference such as `Payments to people` or defer the category;
- do not block import;
- learn a category only after the user categorizes that exact household fingerprint;
- reserve transaction type `transfer` for confirmed own-account movements or an explicit user rule.

### 7.4 Make `new payee` informational

A new payee is not automatically an error. Auto-create saved payees only for recurring or high-confidence businesses and confirmed household recipients. Keep one-off P2P labels on the transaction without polluting the saved-payee list.

## 8. Phase 5 - optional merchant identification from the web

### Direct answer

Yes. A cleaned business candidate such as a brand, restaurant, pharmacy, or local service can be searched. This is useful for likely-business UPI/POS descriptions, but it is unsuitable for people, opaque references, most corporate actions, and descriptors with no recoverable identity.

### 8.1 Eligibility and redaction gate

Search only when all conditions pass:

- counterparty kind is likely `business`;
- candidate contains meaningful alphabetic brand tokens;
- no likely person name or numeric VPA is present;
- all account/card/phone/VPA/UTR/RRN/reference values are removed;
- dates, amounts, and raw descriptions are excluded;
- the user has enabled external merchant enrichment with a clear provider/purpose notice.

Allowed query shape:

```text
<sanitized business candidate> India <optional city> <optional business type>
```

### 8.2 Provider assessment

| Option                           | Value                                                             | Constraint                                                                                   | Decision                                                           |
| -------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Ollama Web Search                | Same ecosystem; official REST API; simple integration             | Requires `OLLAMA_API_KEY`; query leaves local environment; must validate India quality       | Best first shadow-mode pilot                                       |
| Brave Web/Place Search           | Strong general and place search                                   | Retention/storage rights vary by plan; merchant-only redaction and contract review required  | Second pilot candidate                                             |
| Google Places Text Search        | Good for physical/service-area businesses and India location bias | Paid display-name field, variable results, attribution and strict caching/storage rules      | Use only for physical merchants after license review               |
| Public OSM Nominatim             | Useful for a local place plus city                                | Public service max 1 request/second; bulk use discouraged; attribution/license obligations   | Do not use for automatic batch imports; self-host or buy a service |
| Google Custom Search             | Former general web-search option                                  | Closed to new customers and scheduled to end on January 1, 2027                              | Exclude                                                            |
| Bing Search APIs                 | Former general web-search option                                  | Retired on August 11, 2025                                                                   | Exclude                                                            |
| Visa Merchant Search             | Purpose-built card transaction enrichment                         | Issuer/commercial onboarding, certificates, pricing, and storage terms                       | Strong future partner option                                       |
| Mastercard Merchant Identifier   | Purpose-built for unreadable card descriptors                     | Commercial access/onboarding                                                                 | Strong future partner option                                       |
| Plaid Enrich                     | Merchant/category enrichment                                      | Officially US/Canada only                                                                    | Exclude for the India workflow                                     |
| Cashfree/Razorpay VPA validation | Can return registered account name for supported contractual use  | Payout/onboarding product, not a public merchant directory; identity is not category         | Do not use without approved use case, consent, and contract        |
| FinBox BankConnect               | India-specific statement enrichment benchmark                     | Requires sending substantially more statement data to a third party                          | Benchmark only after DPA, accuracy, retention, and cost review     |
| Generic scraping                 | Broad reach                                                       | Fragile, ambiguous, privacy/ToS/copyright risk, prompt injection, no reliable storage rights | Reject                                                             |

There is no official public NPCI directory that can safely convert an arbitrary UPI descriptor into a verified merchant. Arbitrary `UPI lookup` websites must not be used.

### 8.3 Evidence scoring

For an eligible query:

1. retrieve only a few results;
2. prefer an official merchant domain or licensed place/network record;
3. require name-token agreement plus location/business-type/handle corroboration;
4. require two independent signals for automatic application;
5. reject social profiles, people directories, public bank statements, and ambiguous results;
6. treat fetched content as untrusted and defend against prompt injection;
7. store provider, URL/place ID, evidence, confidence, timestamp, and expiry subject to provider terms;
8. negative-cache misses to avoid repeated disclosure and cost;
9. globally promote only verified business aliases after curator approval or a privacy-preserving multi-household threshold.

Run the feature in shadow mode first. Compare its suggestions to a labeled merchant set before allowing any auto-application.

## 9. Phase 6 - household learning and global-dictionary quality

### Household learning

Every approve, rename, recategorize, merge, split, or `do not merge` action should save:

- the versioned structured fingerprint;
- canonical entity/payee ID;
- category key/UUID and transaction event context;
- positive and negative alias relationships;
- confidence source and timestamp;
- whether the mapping is recurring or one-off.

Household memory always wins over global and model suggestions. A repeat import should resolve from memory before Ollama or web calls.

### Global learning

Only business entities may enter the global dictionary. Never publish person names, VPAs, account identifiers, or raw household descriptions globally. Require:

- verified business classification;
- normalized non-sensitive alias;
- evidence/provenance;
- minimum confidence and preferably independent confirmations;
- administrative review for web-derived aliases;
- versioning, expiry/revalidation, and rollback.

## 10. Phase 7 - redesign review around risk, not newness

### Desired flow

```text
Import file
-> validate ledger
-> resolve deterministic matches
-> run Ollama / optional enrichment
-> auto-apply high-confidence outcomes
-> show only blocking conflicts
-> import everything else with safe provisional defaults
-> learn corrections
```

### UX changes

- Automatically accept high-confidence outcomes; do not require a click to approve the 45 already-known payees.
- Separate counters for identity resolved, category resolved, transaction type resolved, and genuinely blocking conflicts.
- Do not use `new payee` as a review filter by default.
- Show accurate stages: `Parsing`, `Matching`, `Ollama`, `Web enrichment` when enabled, and `Finalizing`.
- Show batch progress and terminal result from the persisted job, not from `pendingAi` flags.
- Never show a spinner after `complete`, `partial`, or `failed`.
- On provider failure, show the real error class and `Retry unresolved` without losing deterministic results.
- Group exceptions by reason: identity conflict, category conflict, possible duplicate, reversal/refund, own-account match, or truly unknown.
- Provide one-click bulk rules for repeated exception types.
- Allow import with deferred non-blocking P2P categories.
- Make every import reversible by batch ID so greater automation remains safe.
- Preserve idempotency so retry/cancel cannot insert duplicate transactions.

## 11. Data model changes

Use the existing tables where practical, but add structured records rather than expanding one opaque JSON result indefinitely.

Suggested entities:

- `merchant_entities`: canonical business/person/self/employer/bank entity, household/global scope;
- `merchant_aliases`: structured alias/fingerprint, source, version, confidence, positive/negative relation;
- `statement_pattern_resolutions`: independent identity/category/type/event results and evidence per upload pattern;
- `statement_classification_jobs`: durable state, heartbeat, attempts, provider/model, progress, and terminal error;
- `merchant_enrichment_cache`: redacted query hash, provider evidence, TTL, and terms-compatible stored fields;
- transaction `import_batch_id` and optional `reversal_group_id` for undo and debit-return pairing.

RLS must isolate household data. Global tables must reject person-like or sensitive identifiers through server-side validation.

## 12. Testing and evaluation

### 12.1 Build a real gold corpus

Hand-label all 205 normalized patterns from the supplied statement with:

- rail, direction, event type, counterparty kind, canonical identity;
- expected grouping and explicit `must not merge` pairs;
- category key and whether the category is actually knowable;
- own-account, salary, dividend, mandate, refund, and reversal relationships.

Add sanitized statements from multiple Indian banks and card issuers. The current 13-line fixture is useful but far too small to protect the workflow.

### 12.2 Required automated tests

- 572/506/66 count and exact balance reconciliation;
- transaction deduplication and idempotent retry;
- bank-specific rail parsing;
- Intel salary versus account-holder/self-transfer non-merge;
- distinct-person non-merge;
- Tata AIA variant collapse;
- Medibuddy refund identity preservation;
- own-account transfer matching;
- ACH debit-return pairing rather than deletion;
- State Bank name preservation;
- post-resolution canonical merchant merge;
- category-key mapping and name/category partial preservation;
- Ollama unavailable, model missing, timeout, rate limit, invalid JSON, partial rows, and retry recovery;
- partial/failed database state and truthful UI terminal state;
- household re-import learning and negative `do not merge` rules;
- web query redaction with zero PII leakage;
- malicious search-result/prompt-injection rejection;
- provider cache expiry and global-promotion safeguards.

### 12.3 Metrics dashboard

Track by parser version, resolver version, bank, and rail:

- parse/reconciliation failures;
- identity and category auto-coverage;
- identity/category precision on audited samples;
- pairwise cluster precision/recall and false-merge count;
- blocking review count and user corrections;
- Ollama availability, p50/p95 latency, schema validity, retries, and failures;
- web eligibility, hit rate, precision, cost, and redaction failures;
- repeat-import cache/memory hit rate.

Never log raw statement descriptions, names, VPAs, or account identifiers in telemetry.

## 13. Delivery order and review gates

### Release A - make the current pipeline honest and functional

1. Central Ollama-only client and deployment-reachable topology.
2. Remove statement-import Lovable inference branches.
3. Preflight, realistic timeout/batching, and typed diagnostics.
4. Preserve name results when category resolution fails.
5. Correct partial/failed states and remove the false background spinner.
6. Add live Ollama contract and failure-injection tests.

Gate: the supplied statement produces accepted Ollama rows or an explicit actionable provider failure; zero silent completion.

### Release B - correctness before aggressive automation

1. Ledger reconciliation invariant.
2. Versioned rail-aware parsers.
3. Identity/category/type/event separation.
4. Person and cross-semantic merge guards.
5. Post-resolution canonical entity merge.
6. Regression coverage for all known failures.

Gate: zero known unsafe merges and at least 99.5% cluster precision on the gold corpus.

### Release C - durable low-touch classification

Implementation: complete (2026-09-02).

1. Supabase queue/worker and resumable jobs.
2. Category keys and calibrated Ollama output.
3. Embedding retrieval over verified entities.
4. Household positive/negative learning.
5. Risk-based, non-blocking review UX and reversible imports.

Gate: no more than 10 blocking decisions on the supplied first import and no more than 2 after learning.

### Release D - optional web enrichment pilot

Implementation: complete (2026-09-02). When no web-search API key is available, the provider is disabled as permitted by the gate; the full shadow path remains available automatically when configured.

1. One-time user consent and provider/purpose disclosure.
2. Business/person eligibility classifier and hard redaction gate.
3. Ollama Web Search shadow adapter; optionally benchmark Brave and Google Places.
4. Evidence scorer, provenance, TTL/negative cache, and prompt-injection controls.
5. Accuracy/privacy review before any auto-application.

Gate: zero PII queries and at least 95% merchant precision in shadow mode. Otherwise retain web results as suggestions only or disable the feature.

### Release E - controlled rollout

Implementation: complete (2026-09-02).

1. Feature flags for resolver v2 and web enrichment.
2. Shadow comparison against the current resolver.
3. Canary households, metric review, and rollback switch.
4. Promote only when every acceptance gate passes.

## 14. Decisions to approve before implementation

Recommended defaults are shown first:

1. **Ollama topology:** direct Ollama Cloud from the deployed server with `OLLAMA_API_KEY`; alternatively an authenticated private Ollama gateway.
2. **P2P policy:** exact person identity, non-blocking `Payments to people`/deferred category, and no global learning.
3. **Web pilot:** Ollama Web Search in sanitized business-only shadow mode; no automatic application until measured precision passes.
4. **Saved-payee policy:** auto-save recurring/high-confidence businesses; do not auto-save one-off people.
5. **Review policy:** block only real conflicts; import safe provisional outcomes and allow batch undo.

## 15. Research references

- Ollama API and cloud access: https://docs.ollama.com/api/introduction
- Ollama authentication: https://docs.ollama.com/api/authentication
- Ollama network binding, privacy, proxying, and concurrency: https://docs.ollama.com/faq
- Ollama OpenAI compatibility: https://docs.ollama.com/api/openai-compatibility
- Ollama structured output caveat and guidance: https://docs.ollama.com/capabilities/structured-outputs
- Ollama embeddings: https://docs.ollama.com/api/embed
- Ollama Web Search API: https://docs.ollama.com/capabilities/web-search
- Brave Web and Place Search: https://api-dashboard.search.brave.com/api-reference/web/search/get and https://api-dashboard.search.brave.com/api-reference/web/place_search
- Brave Search API privacy terms: https://api-dashboard.search.brave.com/privacy-policy
- Supabase durable queues: https://supabase.com/docs/guides/queues
- Supabase background tasks and limits: https://supabase.com/docs/guides/functions/background-tasks and https://supabase.com/docs/guides/functions/limits
- Supabase automatic-embedding queue pattern: https://supabase.com/docs/guides/ai/automatic-embeddings
- Google Places Text Search: https://developers.google.com/maps/documentation/places/web-service/text-search
- Google Places storage/attribution policy: https://developers.google.com/maps/documentation/places/web-service/policies
- OSM Nominatim usage policy: https://operations.osmfoundation.org/policies/nominatim/
- Google Custom Search lifecycle: https://developers.google.com/custom-search/v1/overview
- Bing Search API retirement: https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement
- Visa Merchant Search: https://developer.visa.com/capabilities/merchant_search/overview
- Visa Merchant Search terms: https://developer.visa.com/capabilities/merchant_search/product-terms
- Mastercard merchant products: https://developer.mastercard.com/apis
- Plaid Enrich regional limitation: https://plaid.com/docs/enrich/
- Cashfree and Razorpay VPA validation: https://www.cashfree.com/docs/api-reference/payouts/v1/validate-payout-v1-2 and https://razorpay.com/docs/api/x/composite-account-validation/vpa/
- FinBox BankConnect: https://docs.finbox.in/session-flow/fetch-data.html
- NPCI merchant-ecosystem circular: https://www.npci.org.in/PDF/npci/upi/circular/2017/Circular18_BankCompliances_to_enbaleUPIMerchantecosystem_0.pdf
- India DPDP Act and Rules: https://www.meity.gov.in/static/uploads/2024/02/Digital-Personal-Data-Protection-Act-2023-1.pdf and https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf

## Final recommendation

Implement Releases A through C before adding web search. They address the actual failure shown in the screenshot and should remove most immediate user intervention. Then pilot Ollama Web Search only on the small business-like residual. This produces a system that is accurate because it uses stronger local evidence first, useful because it does not block on unknowable P2P purposes, and trustworthy because AI or network failure is never disguised as success.
