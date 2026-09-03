# Statement Import Remediation Plan

## Implementation status — 2026-08-30

- [x] Build category lookups from the upload response before clustering.
- [x] Return and apply household/global pattern-category mappings.
- [x] Await bounded AI classification and expose partial/failure diagnostics.
- [x] Persist learned household mappings using a partial-index-safe upsert.
- [x] Improve processor-noise removal, merchant aliases, and lookup keys.
- [x] Add resolution reasons, transaction-level counters, and regression tests.
- [x] Verify the production build and all 68 statement-import tests.
- [ ] Run a deployed import of the supplied XLS to validate the configured AI provider and final review count.

The local deterministic pass now reduces the supplied statement from 226 to 205 unique patterns and from 222 to 196 clusters. It categorizes 287 of 572 parsed transactions before AI; the awaited AI pass handles the remaining eligible patterns. The original targets of fewer than 150 clusters and fewer than 40 review items remain deployment-level outcome targets, not guaranteed acceptance assertions, because distinct person-to-person payees are intentionally not merged.

## Objective

Reduce manual review during statement import by fixing category assignment, making AI classification reliable, and producing stable merchant clusters without unsafe person-to-person merges.

## Phase 1 — Fix category assignment

Goal: Categories must be available before clusters are built.

1. Build the category index directly from `res.categories` instead of waiting for React's `setCategories()` state update.
2. Build `categoryIdByName` from the same response-local category array.
3. Return the resolved pattern-category mappings from the upload API.
4. Pass those mappings into `buildClusters()`.
5. Apply category resolution in this order:

   ```text
   Saved payee category
   → household pattern mapping
   → global pattern mapping
   → dictionary category
   → keyword category
   → AI category
   → Uncategorized
   ```

6. Record a diagnostic reason whenever a category name cannot resolve to a category UUID instead of silently returning `null`.

### Acceptance criteria

- Known dictionary merchants receive category IDs immediately.
- Previously learned patterns use their household categories.
- `Not Categorized` is no longer equal to the total cluster count.
- Re-importing the same statement requires fewer decisions.

## Phase 2 — Make AI classification reliable

Goal: Every unresolved cluster must finish as classified or show an explicit failure.

1. Replace the unawaited server-side classification request with a reliable execution model:
   - Await classification for manageable imports; or
   - Use a durable background job or queue for large imports.
2. Store job progress in `statement_uploads`:

   ```text
   queued → classifying → complete
                       ↘ failed
   ```

3. Record total pending patterns, processed patterns, batch number, retry count, last error, and completion time.
4. Process AI requests in bounded batches of approximately 25–40 patterns.
5. Retry transient failures with capped exponential backoff.
6. Validate every AI response:
   - Payee must be non-empty.
   - Category must match an available category.
   - Invalid categories fall back to deterministic keyword resolution.
   - Failed items remain visible with a failure reason.
7. Persist successful results to household `payee_pattern_categories`.
8. Recalculate clusters and summary counters when classification results arrive.
9. Show live progress such as `Classifying 86 of 182`.
10. Disable final bulk approval until classification completes or the user explicitly chooses to continue.

### Acceptance criteria

- No upload remains indefinitely in `classifying`.
- Every pending pattern ends as classified or explicitly failed.
- UI counters update after AI completes.
- A repeated import uses stored results without another AI call.

## Phase 3 — Improve normalization and clustering

Goal: Convert description variants into stable merchant identities without incorrectly merging people.

### 3A. Improve normalization

1. Separate narration into transaction channel, beneficiary or merchant name, UPI handle, payment processor, bank code, reference text, and transaction purpose.
2. Remove low-value suffixes such as:

   ```text
   PHONE
   PAYTM
   RZP
   RZPREC
   BRK
   TRANSACTION
   PAYMENT
   UPIINTENT
   MANDATE
   MERCHANT UPI TXN
   ```

3. Preserve useful merchant tokens before removing payment-provider text.
4. Add specialized extractors for UPI, ACH/NACH, NEFT/IMPS, card/POS, autopay/mandates, refunds, salary credits, and self-transfers.
5. Never globally categorize person-to-person UPI names solely from the payment rail.

Expected examples:

```text
COMPASS INDIA FOOD ... PAYTM ... PAYMENT FROM PHONE
→ COMPASS INDIA FOOD

INDMONEY ... RZP
→ INDMONEY

ZERODHA.ICCL6.BRK
→ ZERODHA

ADOBE.ADYENAUTOPAY
→ ADOBE
```

### 3B. Improve lookup

1. Generate lookup keys from meaningful tokens anywhere in a pattern instead of only the first three words.
2. Store known merchant aliases explicitly.

Example:

```text
INDIAN CLEARING CORP ZERODHA ICCL6 BRK
```

Should generate candidates including:

```text
ZERODHA
INDIAN CLEARING CORP
INDIAN CLEARING CORP ZERODHA
```

### 3C. Improve clustering

1. Cluster using extracted merchant identity first.
2. Use fuzzy similarity only when merchant identity is unavailable.
3. Compare token overlap, UPI-handle root, known aliases, processor-stripped text, and character similarity.
4. Use confidence rules appropriate to the signal:

   ```text
   Known merchant alias: exact
   Same UPI-handle root: high confidence
   Business-name similarity: medium/high confidence
   Person-name similarity: never auto-merge
   ```

5. Prevent unsafe merges between different individuals.

### Acceptance criteria

- Zerodha variants form one merchant cluster.
- INDmoney variants form one merchant cluster.
- Adobe variants form one merchant cluster.
- Blinkit variants form one merchant cluster.
- Person-to-person payees remain separate unless previously confirmed.
- Cluster count materially decreases without incorrect merges.

## Phase 4 — Diagnostics and regression protection

1. Add a resolution reason to every cluster:

   ```text
   saved_payee
   household_pattern
   global_pattern
   dictionary
   keyword
   ai
   unresolved
   ```

2. Add an import diagnostics report containing parsed transactions, unique patterns, clusters, matches per layer, categorized transactions, uncategorized transactions, and AI failures.
3. Create a sanitized regression fixture from the supplied 605-row statement.
4. Add tests covering:
   - Category-index timing.
   - Pattern-map propagation.
   - AI completion and failure handling.
   - Zerodha, INDmoney, Adobe, and Blinkit normalization.
   - Person-name non-merging.
   - Re-import learning.
   - Summary-counter recalculation.
5. Add an invariant preventing a cluster with a valid category name from losing its category UUID.

## Target outcome for the supplied statement

Initial import target:

```text
222 clusters → fewer than 150
Auto-categorized transactions → above 80%
Clusters requiring review → fewer than 40
```

After one confirmed import:

```text
Auto-categorized transactions → above 95%
Clusters requiring review → fewer than 10
AI calls on repeat import → near zero
```

## Implementation order

```text
Category-state fix
→ pattern-map wiring
→ reliable AI execution
→ normalization
→ lookup and clustering
→ diagnostics and regression tests
```
