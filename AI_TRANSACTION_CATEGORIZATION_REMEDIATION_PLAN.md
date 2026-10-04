# AI Transaction Categorization Remediation Plan

## 1. Purpose

This document records the current statement-import transaction categorization design, the issues found during review, and a phased resolution plan. The goal is to retain the existing hybrid resolver while preventing uncertain AI decisions from being promoted into trusted household memory.

The plan covers the automatic statement-import classifier and the confirm-screen **Ask AI** categorization action. It does not propose replacing Ollama or redesigning the complete import experience.

## 2. Current implementation

### 2.1 Automatic classification pipeline

The current flow is:

1. Parse the uploaded statement.
2. Normalize transaction narrations and construct merchant patterns and fingerprints.
3. Group transactions by normalized pattern.
4. Execute deterministic household rules.
5. Resolve known patterns from:
   - user payee overrides;
   - memorized payees and aliases;
   - household/global pattern-category memory;
   - the global merchant dictionary;
   - verified embedding matches.
6. Send unresolved patterns to Ollama in batches.
7. Validate the returned payee, household category name, stable category key, and confidence.
8. Resolve a stable category key into the household taxonomy when an exact household category was not returned.
9. Apply deterministic keyword categorization when AI does not produce a usable category.
10. Persist pattern resolution evidence and reusable household pattern-category mappings.
11. Build review clusters and determine whether the import is ready for auto-pilot.

The current local configuration uses `gpt-oss:120b-cloud`, batch size 5, concurrency 1, and a 2,048-token context. `STATEMENT_QUEUE_ENABLED=false`, so the primary upload request waits for classification. Queue support remains available when explicitly enabled.

### 2.2 Manual Ask AI path

The confirm screen can send uncategorized clusters to a second Ollama endpoint. That endpoint asks the model to choose one exact household category for each cluster, validates returned names against the allowed list, and assigns accepted results to the clusters.

### 2.3 Intended precedence

The desired decision precedence is:

1. Explicit user correction or confirmation.
2. Deterministic household rule.
3. Exact household memory or memorized payee.
4. Verified global dictionary or verified entity evidence.
5. High-confidence AI classification.
6. Keyword fallback.
7. Review as uncategorized or unresolved.

AI must never overwrite a higher-precedence decision.

## 3. Findings

### Issue 1: Model confidence is discarded before review

**Severity:** High

The Ollama classifier returns a calibrated `confidence`, and the server initially retains it. The cluster boundary narrows the result to payee, category, and source, after which the UI assigns fixed confidence values based on source. Automatic AI results therefore appear as `0.72` regardless of whether the model returned `0.20` or `0.98`.

The realtime update path also uses a fixed minimum of `0.72`, while the manual Ask AI path uses a fixed minimum of `0.75`.

**Impact:**

- Low-confidence classifications can be presented as stronger than they are.
- High-confidence classifications are unnecessarily downgraded.
- Review tiers and readiness calculations do not reflect model uncertainty.
- Confidence displayed to the user is not auditable back to the provider response.

### Issue 2: Weak AI decisions can become trusted future matches

**Severity:** Critical

Every categorized batch result is currently eligible for household pattern-memory persistence. Persistence uses the fixed source `ai` and fixed confidence `0.72`, including keyword fallbacks and AI results whose actual confidence was low.

On a later import, the saved pattern is resolved through the lookup layer and presented as a dictionary-style result. The cluster layer assigns dictionary results confidence `0.90`, which can make a previously uncertain result eligible for automatic handling.

**Impact:**

- A single weak classification can create a reinforcing error across later imports.
- Incorrect provenance makes diagnosis and correction harder.
- User trust is weakened because a formerly uncertain guess appears authoritative.

### Issue 3: Embedding identity matches can suppress category classification

**Severity:** High

Verified embedding retrieval returns both `categoryKey` and `categoryId`. The lookup resolver keeps the identity and category key but ignores `categoryId`, assigns `category: null`, and removes the pattern from the unresolved list.

When the entity has an identity but no usable category key, the AI category classifier is skipped. The upload may report classification as complete even though the resulting cluster remains uncategorized.

**Impact:**

- Valid category evidence can be lost.
- Identity-only matches are incorrectly treated as fully resolved.
- Completion and unresolved counts can be inaccurate.

### Issue 4: Category-only deterministic rules do not fully resolve a pattern

**Severity:** High

The statement rules stage marks a pattern as resolved only when a rule changes merchant or description identity fields. A rule that only performs `set_category` records an override but does not create a resolved entry or remove the pattern from AI processing.

The category override is applied only when another stage creates a resolved entry. If Ollama fails completely and no keyword fallback is available, a valid deterministic category rule can still leave the pattern unresolved.

**Impact:**

- Deterministic rules are not truly authoritative.
- Unnecessary AI calls are made for category-only rule matches.
- A model outage can hide a valid rule-derived category.

### Issue 5: Rules are reloaded for every transaction

**Severity:** High for performance; Medium for correctness

`applyStatementRules` calls the rules pipeline separately for each transaction, and each call reloads rule groups and categories from the database. The codebase already has an `executeLoadedRules` path intended for batch processing, but the statement pipeline does not use it.

**Impact:**

- Database queries grow approximately with transaction count.
- Large statements can become slow or time out before AI classification begins.
- Repeated reads during one import can observe inconsistent rule state.

### Issue 6: Memorized-payee category IDs are treated as category names

**Severity:** Medium

The memorized-payee lookup assigns `category_id`, a UUID, to the resolved merchant's `category` field, which otherwise contains a category name. The client often masks the problem by independently rediscovering the memorized payee, but partial or progressive lookup-key matches can expose the invalid contract.

**Impact:**

- Category-name resolution can receive a UUID and fail.
- API results are internally inconsistent.
- Edge-case memorized-payee matches can become uncategorized.

### Issue 7: Prompt size is not bounded to the configured context

**Severity:** Medium to High

The automatic prompt permits up to 250 household category names and 50 household instructions of up to 1,000 characters each. The configured Ollama context is 2,048 tokens, so a realistic rule set can exceed the available context before transaction samples and output space are considered.

**Impact:**

- Earlier system instructions or category options may be truncated.
- Output completeness and JSON reliability may degrade.
- Batch recovery treats truncation symptoms as malformed model output rather than preventing them.

### Issue 8: Manual Ask AI forces a category without uncertainty

**Severity:** Medium

The manual categorizer instructs the model to choose exactly one category and to choose the closest broad category when uncertain. Its schema has no confidence or abstention field. Every allowed response is accepted and assigned fixed confidence `0.75`.

**Impact:**

- The model cannot safely abstain.
- A valid JSON response is treated as a confident answer.
- The UI message can claim the model could not confidently assign categories even though no confidence was measured.

### Issue 9: Stable-key resolution is not transaction-direction aware

**Severity:** Medium

Stable category keys are mapped to household categories using name hints alone. The resolver does not filter candidates by category kind or transaction direction.

**Impact:**

- Similar category names across expense, income, transfer, or investment branches can map to the wrong category.
- Category insertion order can influence equal-scoring matches.

### Issue 10: Documentation and progress semantics are stale

**Severity:** Low

Some comments describe AI classification as background and non-blocking, while the currently configured primary path awaits classification. Queue-mode progress also counts only pending AI patterns in places where the synchronous path reports total resolved patterns.

**Impact:**

- Operational behavior is harder to understand.
- UI progress can differ between synchronous and queued execution.

## 4. Proposed resolution

### 4.1 Define one resolution contract

Replace loosely shaped resolver objects with a shared contract used by the lookup, AI, queue, cluster, and UI layers:

```ts
type ClassificationSource =
  | "user_confirmed"
  | "user_rule"
  | "memorized_payee"
  | "household_pattern"
  | "global_dictionary"
  | "verified_embedding"
  | "ai"
  | "keyword";

type Resolution = {
  payee: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryKey: StatementCategoryKey | null;
  identityConfidence: number | null;
  categoryConfidence: number | null;
  source: ClassificationSource;
  evidence: string[];
  requiresReview: boolean;
  blockingReason: "identity_unknown" | "category_unknown" | "low_confidence" | null;
};
```

UUIDs and category names must remain separate fields. Confidence must be copied without replacing it with a source-based constant.

### 4.2 Adopt an explicit confidence policy

Initial policy:

| Classification                                 | Action                                                       |
| ---------------------------------------------- | ------------------------------------------------------------ |
| User-confirmed                                 | Apply and learn immediately                                  |
| Deterministic rule                             | Apply immediately; rule category cannot be overwritten by AI |
| Exact memorized/household match                | Apply according to stored confidence and provenance          |
| AI category confidence `>= 0.90`               | Apply; eligible for controlled household learning            |
| AI category confidence `0.75-0.89`             | Suggest for user review; do not learn yet                    |
| AI category confidence `< 0.75`                | Abstain and leave uncategorized                              |
| `other`, transfer, or person-payment ambiguity | Require review unless deterministic or user-confirmed        |

Thresholds should be named constants or configuration values. The model-reported confidence should not be treated as perfectly calibrated; production metrics should be used to revise thresholds.

### 4.3 Separate identity and category confidence

Update the model schema to return independent confidence values:

```json
{
  "pattern": "SWIGGY",
  "payee": "Swiggy",
  "category_name": "Restaurants & Cafes",
  "category_key": "food_dining",
  "identity_confidence": 0.98,
  "category_confidence": 0.93,
  "reason_code": "known_business"
}
```

The reason should be a short enum, not unrestricted chain-of-thought text. Identity may be accepted while category remains pending.

### 4.4 Introduce safe learning gates

Persist household pattern memory only when one of these conditions is true:

1. The user explicitly confirms or corrects the category.
2. A deterministic rule supplies the category.
3. AI supplies an exact valid household category with category confidence `>= 0.90`, the category is not a guarded ambiguity, and no higher-precedence evidence conflicts.

Persistence must retain the true source and confidence. Keyword fallback should use source `keyword`; it must never be relabelled as `ai`.

Future lookup confidence should come from stored evidence. It must not be upgraded simply because it was found in a lookup table.

### 4.5 Make deterministic rules authoritative and batch-efficient

Before iterating over transactions:

1. Load active rule groups and category mappings once.
2. Execute the loaded rules against every transaction.
3. For every matching category action, create or update a resolution entry immediately.
4. For identity-only rule actions, keep category classification pending if no category was assigned.
5. Pass rule-derived category as a locked value to later stages.
6. Allow AI to fill only missing identity or category fields; never overwrite locked rule fields.

If transactions sharing one pattern receive conflicting rule categories, split the group or mark it for review rather than letting the final transaction silently win.

### 4.6 Correct embedding resolution

For a verified entity match:

- If `categoryId` belongs to the current household, resolve and apply its name.
- Otherwise, try the stable `categoryKey` using direction-compatible household categories.
- If identity is known but category remains unknown, retain the identity evidence while keeping the pattern in the category-classification queue.
- Mark the pattern complete only when all required dimensions are resolved or explicitly reviewable.

### 4.7 Make stable-key mapping direction aware

Extend `resolveCategoryKey` to accept transaction direction/type. Filter candidates before scoring:

- debit/expense: expense categories, with explicit exceptions for transfer and investment;
- credit/income: income, refund, transfer, or investment categories;
- transfer: transfer categories only when transfer evidence exists;
- investment: investment categories when the fingerprint or rule supplies investment evidence.

Prefer exact template-key mappings when category templates are available. Use fuzzy name hints only as a compatibility fallback.

### 4.8 Budget prompts before sending them

Create a deterministic prompt-budget builder that:

1. Reserves output tokens for every batch item.
2. Includes only categories compatible with the batch transaction types.
3. Deduplicates household category names.
4. Orders applicable household instructions by rule priority.
5. Truncates instructions by total token/character budget rather than count alone.
6. Reduces batch size dynamically when the prompt is large.
7. Records prompt truncation in diagnostics.

If the prompt cannot fit safely, reduce the batch or skip optional context; never silently rely on provider truncation.

### 4.9 Make manual Ask AI abstention-safe

Change the manual schema to return, per cluster:

- exact category name or `null`;
- category confidence;
- stable reason code.

Prompt the model to return `null` when evidence is insufficient. Apply the same thresholds as automatic classification and leave lower-confidence results unchanged for manual selection.

### 4.10 Align statuses and metrics

Track these counts consistently in synchronous and queued modes:

- total unique patterns;
- identities resolved;
- categories resolved;
- high-confidence automatic decisions;
- review-required decisions;
- fully unresolved decisions;
- AI failures and keyword fallbacks.

An upload is `complete` only when every pattern is either fully resolved or intentionally placed in review with a reason. Provider failure should not erase deterministic results.

## 5. Implementation phases

### Phase 1: Correctness boundary

Files expected to change:

- `src/lib/statement-classify.server.ts`
- `src/lib/statement-clusters.ts`
- `src/components/statement-import-dialog.tsx`
- `src/lib/pattern-categories.functions.ts`
- relevant tests

Tasks:

- Introduce the shared resolution contract.
- Preserve actual identity/category confidence through the UI.
- Preserve exact provenance.
- Stop unconditional AI-memory persistence.
- Add guarded confidence thresholds.
- Ensure previous low-confidence records are not automatically upgraded.

### Phase 2: Rules and embedding fixes

Files expected to change:

- `src/lib/rules-engine.server.ts`
- `src/lib/statement-pipeline.server.ts`
- `src/lib/statement-embedding.server.ts`
- `src/lib/statement-classify.server.ts`
- relevant tests

Tasks:

- Load rule groups once per import.
- Materialize category-only rule resolutions.
- Lock rule-derived fields against AI overwrites.
- Apply embedding `categoryId` when valid.
- Keep identity-only embedding matches pending for category resolution.

### Phase 3: Prompt and taxonomy safety

Files expected to change:

- `src/lib/statement-classify.server.ts`
- `src/lib/statement-category-keys.ts`
- `src/lib/category-resolver.ts`
- relevant tests

Tasks:

- Add a prompt-budget builder.
- Separate identity and category confidence.
- Add safe abstention.
- Make stable-key resolution category-kind and transaction-direction aware.

### Phase 4: Manual AI and observability

Files expected to change:

- `src/lib/statement-import.functions.ts`
- `src/components/statement-import/confirm-step.tsx`
- queue/progress files as required
- relevant tests

Tasks:

- Use a validated structured schema for manual categorization.
- Return confidence and abstentions.
- Align synchronous and queued metrics.
- Display clear decision provenance and review reasons.

### Phase 5: Existing-memory audit and rollout

Tasks:

- Identify household pattern rows saved as `ai` with fixed confidence `0.72`.
- Do not delete user data automatically.
- Either mark affected rows `requires_review`, downgrade their reuse policy, or provide a reversible migration after product approval.
- Roll out behind the existing resolver feature gate.
- Compare correction rate, unresolved rate, latency, and categorization coverage before increasing rollout.

## 6. Required tests

### Unit tests

- Model confidence survives classifier, resolver, cluster, and review transformations.
- A low-confidence AI category is not persisted to reusable memory.
- A high-confidence AI category retains its real source and confidence.
- Keyword fallback persists as `keyword`.
- User confirmation overrides AI and keyword memory.
- Category UUIDs never enter category-name fields.
- Category-only rules resolve categories when Ollama is unavailable.
- Rule categories cannot be overwritten by AI.
- Embedding `categoryId` is applied when valid.
- Identity-only embedding matches remain pending for category classification.
- Stable keys cannot cross incompatible category kinds.
- Manual AI may abstain.
- Prompt construction stays within its configured budget.

### Integration tests

- Import a mixed debit/credit/transfer fixture with Ollama stubbed.
- Import the same statement twice and verify that only qualified decisions are reused.
- Simulate malformed JSON, timeouts, partial batches, and complete provider failure.
- Exercise synchronous and queue modes and compare final resolution/status counts.
- Confirm that corrections become authoritative on the next import.

### Regression and performance tests

- Preserve the current labelled-corpus precision gate.
- Add a maximum correction-rate gate for auto-applied AI categories.
- Verify rule database reads are constant per import rather than proportional to transaction count.
- Measure prompt tokens and batch latency.

## 7. Acceptance criteria

The remediation is complete when:

1. The confidence shown in review matches the confidence returned or derived by the responsible resolver.
2. No AI result below the learning threshold is stored as reusable household memory.
3. Lookup does not increase confidence without additional evidence or user confirmation.
4. Deterministic category rules work even when Ollama is unavailable.
5. Verified embedding categories are used, while identity-only matches remain category-pending.
6. Category IDs and category names are never interchanged.
7. Prompts remain within a defined context budget.
8. Manual AI can abstain and low-confidence results remain for review.
9. Rule loading is constant per statement import.
10. All targeted and existing regression tests pass.
11. TypeScript validation passes for touched categorization files; generated Supabase types include the rules tables used by the pipeline.

## 8. Rollback strategy

- Keep new resolution behavior behind the existing resolver rollout controls.
- Retain the old lookup path during the canary period.
- Make any memory-data migration reversible and avoid deleting household corrections.
- On regression, disable the new resolver while continuing deterministic rules, exact user memory, and manual review.
- Store resolver version, source, confidence, and evidence on every new resolution so affected decisions can be identified precisely.

## 9. Recommended priority

Implement Phases 1 and 2 before model tuning or increasing auto-pilot usage. Those phases prevent confidence inflation, stop weak AI decisions from becoming trusted memory, and restore deterministic-rule authority. Prompt optimization and manual-AI improvements should follow after the resolution contract is reliable.

## 10. Implementation status — 2026-10-03

The remediation described above has been implemented in the current working tree:

- Actual identity/category confidence now crosses the classifier, queue result, realtime hook, cluster builder, and review UI.
- AI categories below `0.75` abstain; results from `0.75` through `0.89` require review; results at or above `0.90` may be eligible for learning.
- `other`, `payments_to_people`, and `transfer` remain guarded from automatic AI learning.
- Only qualifying high-confidence AI categories are written to reusable pattern memory. Keyword fallbacks retain `keyword` provenance and are not learned automatically.
- Existing low-confidence pattern rows retain their stored confidence and are presented for review rather than being upgraded to dictionary confidence.
- Memorized category UUIDs and category names are carried separately.
- Deterministic rules are loaded once per import, category-only rules materialize without Ollama, and conflicting categories for one pattern are sent to review.
- Verified embedding category IDs are applied when valid; identity-only matches remain pending for category classification.
- Stable category-key resolution filters incompatible category kinds using transaction direction.
- Automatic prompts use bounded category/rule context and bounded narration samples.
- Manual Ask AI uses structured output, real confidence, and explicit abstention.
- Queued and synchronous progress both report total resolved pattern counts.

Verification completed:

- `npm test`: 128 tests passed.
- `npm run build`: production client and server build passed.
- Targeted lint passed for the new policy, category-key, and remediation-test files.
- Targeted TypeScript output contains no errors in the touched categorization paths. The repository-wide TypeScript check still reports pre-existing errors in generated Supabase rules-table types and unrelated UI/tests.

No destructive migration was applied to historical household memory. Previously stored AI rows keep their original confidence, and the new lookup policy safely downgrades them to review when below the new threshold.

## 11. AI Spending Profile implementation — 2026-10-03

The follow-up context and coverage feature is implemented in the current working tree:

- A four-step, skippable first-login wizard asks about spending context, household identities and own-account labels, income sources, frequent merchants, recurring payments, P2P review, and categories that should never be auto-assigned.
- The same editor is permanently available under Settings → Statement & AI.
- Profile data is household-scoped, while onboarding completion/dismissal is tracked per user so one member cannot suppress onboarding for another member.
- Exact merchant, income, and recurring mappings are deterministic and execute before lookup or AI classification. Existing explicit deterministic rules retain higher precedence.
- Names and account labels assist local narration normalization but are not added to model prompt context.
- General profile context is generated from fixed templates, sanitized, bounded, and passed through both synchronous and queued classification.
- Protected category IDs force review. The P2P review preference is honored only for high-confidence AI results, and exact user mappings remain authoritative.
- The migration adds household RLS and does not rewrite transactions, categories, memorized payees, or existing learned patterns.

Current verification:

- `npm test`: 133 tests passed.
- `npm run build`: production client and server build passed.
- Targeted ESLint passed for the new profile module, server functions, UI, and tests.
- No TypeScript errors are reported in the touched profile or categorization paths. The repository-wide TypeScript check continues to report pre-existing generated rules-table and unrelated UI/test errors.
