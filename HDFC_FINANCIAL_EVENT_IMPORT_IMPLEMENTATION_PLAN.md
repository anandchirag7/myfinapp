# HDFC Statement Import and Financial Event Architecture Plan

Date: 2026-10-04

## Objective

Replace the current direction-plus-category statement import model with a traceable, deterministic financial-event pipeline that can ingest real HDFC statements without silently dropping rows or treating every credit as income. The implementation must preserve the original statement evidence, distinguish cash direction from economic meaning, reconcile balances, group linked rows into events, ask only focused exception questions, and remain usable at 1,000, 10,000, and 100,000 transactions.

The repository currently contains a real HDFC XLS fixture (`Acct_Statement_XXXXXXXX7576_05082026.xls`). It contains 572 transaction rows from 2026-04-01 through 2026-07-31, including 464 UPI rows and 54 ACH rows. The requested architecture also targets the described 1,209-row January-to-September statement and future full-year files.

## Current-state audit

| Area | Status | Evidence and gap |
| --- | --- | --- |
| Excel/CSV preamble and header detection | Partial | `extractRowsFromAOA` correctly finds the HDFC header, but emits only date, description, amount, and legacy type. |
| HDFC row fidelity | Needs refactor | Source row, value date, cheque/reference, separate debit/credit values, and row closing balance are discarded. |
| Ledger validation | Partial | Footer totals are checked; row-by-row closing-balance continuity is not. |
| Immutable raw layer | Missing | Upload metadata/file archive exists, but no immutable source-row table exists. |
| Normalized transaction layer | Partial | Normalization/fingerprinting is transient and its economic taxonomy is too small. |
| Financial-event layer | Missing | No event model joins reversals, refunds, settlements, mandates, or transfer legs. |
| Direction versus economic meaning | Missing | Legacy `transactions.type` conflates all credits with income and most debits with expense. |
| HDFC narration parsing | Partial | Generic rail/VPA/token extraction exists, but not a typed HDFC parser for UPIRET, mandates, or bank references. |
| Reversal/refund matching | Needs refactor | Current 30-day amount/counterparty grouping does not prioritize exact original references or enforce one-to-one links. |
| Canonical entities | Partial | Existing entity/alias tables do not represent financial families, brokers, insurers, loan servicers, and payment processors separately. |
| Internal transfers | Partial | Canonical transfers and evidence exist; they need raw-row lineage and account-alias integration. |
| Recurring payments | Partial | `recurring_templates` schedules postings but does not model observed mandates by provider, amount, reference, and date window. |
| Duplicate detection | Partial | Description-aware scoring exists, but there is no durable fingerprint containing bank reference and closing balance. |
| Categorization | Partial | Rules, memory, embeddings, AI confidence, learning guards, and abstention exist; economic classification is still conflated with category. |
| Exception workflow | Needs refactor | Review is virtualized/clustered but still row-oriented rather than decision-oriented. |
| Persistence | Partial | Inserts are chunked but raw rows, normalized postings, event links, matches, and review items are not atomic. |
| Query scale | Needs refactor | Fixed limits of 1,000–20,000 replace keyset pagination or server-side aggregation in several paths. |
| Dashboard semantics | Needs refactor | Reports cannot consistently exclude transfers, investments, card payments, reversals, or settlements. |
| Security | Partial | Existing household RLS is generally sound; every new table and privileged function requires explicit household enforcement. |

## Architectural decisions

### Three explicit layers

1. `statement_raw_transactions`: immutable evidence from one file row, including source row, raw cells, dates, narration, reference, debit, credit, closing balance, parser version, and source fingerprint.
2. `transactions`: the normalized account posting. Existing `type` remains for backward-compatible cash direction and balance calculations; new `economic_type` and interpretation evidence are added.
3. `financial_events` plus `financial_event_transactions`: economic events and their posting members. Transfers, reversals, refunds, and settlements can contain multiple rows without double counting.

### Direction, economic type, and category are independent

- Direction is `debit` or `credit` and comes only from statement evidence.
- Legacy `type` remains `expense`, `income`, or `transfer` during the safe migration.
- `economic_type` is one of `EXPENSE`, `INCOME`, `INTERNAL_TRANSFER`, `CREDIT_CARD_PAYMENT`, `INVESTMENT`, `INVESTMENT_REDEMPTION`, `BROKERAGE_SETTLEMENT`, `LOAN_PAYMENT`, `INSURANCE_PAYMENT`, `REFUND`, `REVERSAL`, `INVESTMENT_INCOME`, `INTEREST_INCOME`, `CASH_WITHDRAWAL`, `CASH_DEPOSIT`, `FEE_OR_CHARGE`, `TAX`, `VERIFICATION_TRANSACTION`, or `UNKNOWN`.
- Category answers purpose, not accounting treatment.
- Shared `spendingImpact`, `incomeImpact`, and `cashFlowImpact` helpers drive every dashboard/report.

### Deterministic-first resolver order

1. Parse the bank row and validate direction/balance continuity.
2. Parse HDFC narration into rail-specific fields.
3. Build source and normalized fingerprints.
4. Resolve explicit corrections, account aliases, and protected household rules.
5. Resolve exact reversal/refund references and internal-transfer evidence.
6. Resolve high-precision domain rules: CRED/card payments, NPS/investments, Zerodha/ICCL, INDmoney/Finzoomers, RACPC loans, insurers, salary, interest, dividends, bank fees/tax, cash, and corroborated micro-verification.
7. Resolve canonical entity independently from processor and purpose.
8. Match recurring mandates using provider + reference/token + amount tolerance + date window.
9. Apply merchant/category memory and conventional rules.
10. Use embeddings/AI only for unresolved fields, in batches, with confidence and abstention.
11. Create grouped exception questions for ambiguous/protected cases.

No per-transaction AI call or database round trip is permitted. Every automatic interpretation persists source, confidence, rule identifier, parser version, and ordered reasons.

## Database design

### New tables

- `statement_raw_transactions`: immutable evidence, unique by household/upload/source fingerprint; authenticated insert/select with controlled rollback deletion.
- `financial_events`: event type/date/amount/currency, confidence, resolution status, explanation, and optional related event.
- `financial_event_transactions`: event membership and role (`source`, `target`, `original`, `reversal`, `refund`, `settlement`, `payment`).
- `account_aliases`: household alias to owned account, alias type, confidence, and verification.
- `recurring_mandates`: provider/entity, mandate/reference token, amount/tolerance, cadence, expected date window, account, economic type, status, and observations.
- `transaction_matches`: duplicate/reversal/refund/transfer candidates with score, signals, and decision.
- `statement_review_items`: grouped exception type/key/priority, affected IDs, bounded options, answer, and status.

### Additions to `transactions`

`raw_transaction_id`, `economic_type`, `statement_direction`, `value_date`, `original_reference`, `payment_rail`, canonical and processor entity IDs, recurring mandate ID, financial-event ID, classification confidence/source/reasons, source fingerprint, and interpretation version.

Add household/date/economic-type, raw-row, event, entity, mandate, and fingerprint indexes plus an idempotency constraint.

### Reuse and migration safety

- Reuse `statement_uploads`, private file archive, merchant/entity tables, pattern resolutions, spending profile, unified rules, internal-transfer evidence/memory, and investments tables.
- Keep `recurring_templates` for scheduled posting rather than observed mandates.
- Add nullable/defaulted objects first; backfill economic type conservatively; use dual-read helpers; do not replace the legacy enum in this release.
- Rollback must switch reads back without deleting imported evidence.

## Implementation phases and test gates

### Phase 0 — Plan and baseline

- Record baseline tests/build, real-file parse count, ledger totals, and known failures.
- Use sanitized HDFC rows in source tests; do not log private statement contents.

Gate: baseline results recorded.

### Phase 1 — Domain vocabulary and accounting semantics

- Add direction/economic-type/confidence/explanation types and impact helpers.
- Red-first tests prove transfers, card payments, investments, reversals, refunds, and settlements do not inflate spending/income.

Gate: domain and financial-math tests pass.

### Phase 2 — Lossless HDFC extraction

- Extend `ExtractedTxn` compatibly to preserve source row, transaction/value date, narration, cheque/reference, debit, credit, closing balance, and raw cells.
- Add exact row-level closing-balance continuity diagnostics.
- Expose mismatches as blocking review items; zero extracted rows remains a hard failure.

Gate: the repository XLS extracts 572 unique rows and reconciles first/last rows, counts, and totals.

### Phase 3 — Structured HDFC narration parser

- Typed parsers for UPI, UPIRET, ACH/NACH/ECS, IMPS, NEFT/RTGS, card/POS, ATM/cash, interest, fees, and fallback.
- Extract reference/RRN/UTR, VPA, counterparty, mandate/provider, bank/account hints, remarks, and return reference while keeping processor separate.

Gate: real-pattern golden tests, malformed cases, masked identifiers, and privacy tests.

### Phase 4 — Schema and atomic persistence

- Add raw/event/match/mandate/review/alias schema, RLS, checks, grants, and indexes.
- Add a household-validating idempotent import RPC/service for chunked raw, normalized, and event writes.
- Return actual inserted/duplicate/rejected counts.

Gate: migration/RLS tests, retries, rollback, and a 1,209-row generated import.

### Phase 5 — Economic resolvers and entities

- Implement the resolver order and extend entity families/kinds without losing household overrides.
- Require corroboration for ₹1 verification and review ambiguous salary/reimbursement cases.

Gate: CRED, NPS, Zerodha/ICCL, INDmoney/Finzoomers, RACPC, insurance, dividends, interest, fees/tax, cash, income, and unknown golden cases.

### Phase 6 — Matches and financial events

- Exact-reference UPIRET matching first; processor-aware scored fallback second.
- Build refund, reversal, transfer, card-payment, investment, redemption, settlement, loan, and insurance events.
- Consume original rows at most once and retain rejected candidates for audit.

Gate: no double counting, ambiguity abstains, and opposite transfer legs reconcile to one event.

### Phase 7 — Recurring mandates

- Match provider/entity + mandate/reference + amount band + calendar window.
- Support multiple mandates per provider and correction scopes: this row, future, or existing and future.

Gate: RACPC ₹32,569 near the 10th clusters without merging other RACPC mandates.

### Phase 8 — Exception inbox and import summary

- Ask grouped questions for transfer ownership/target, destination card, salary versus reimbursement, entity ambiguity, duplicate ambiguity, and low-confidence economic type.
- Preserve inline account creation for transfer targets.
- Show server-derived imported, duplicate, unresolved, warning, and excluded counts.

Gate: accessible UI tests, group-answer fan-out, and blocking-question enforcement.

### Phase 9 — Detail and learning

- Show raw versus interpreted data, linked event/match, confidence, and reasons.
- Implement correction scopes with preview/audit; protected concepts never learn from weak evidence.

Gate: scope isolation, bounded updates, household separation, and audit tests.

### Phase 10 — Dashboard/report semantics

- Centralize aggregates for true spending/income, transfers, investments, card/loan/insurance payments, refunds/reversals, and unknowns.
- Migrate dashboard, reports, exports, budgets, and chat context while keeping cash flow distinct.

Gate: event totals reconcile with cash postings and exclude non-spending/non-income movements.

### Phase 11 — Performance, security, and rollout

- Keyset pagination, server aggregates, batched lookups/writes, bounded AI.
- Benchmark 1k/10k/100k; review file validation, formula injection, RLS/RPC authorization, PII logging, and denial-of-service protections.
- Roll out per household with parse-loss, unknown, review, mismatch, and correction metrics.

Gate: full regression suite, production build, RLS audit, benchmark thresholds, and rollback drill.

## Acceptance criteria

1. Every valid row becomes one immutable raw row or one explicit rejected-row record.
2. The repository XLS yields 572 rows; a supplied 1,209-row statement must yield 1,209 unless rejected rows are shown.
3. UI success counts equal server inserted + duplicate + rejected counts.
4. Dates, reference, debit/credit, closing balance, source row, and narration are preserved.
5. A classifier cannot alter statement direction.
6. Every normalized row has an economic type or `UNKNOWN` exception.
7. CRED payments are excluded from spending.
8. Internal transfers create/reconcile both account postings without spending/income impact.
9. Investments are not spending; redemptions/settlements are not salary income.
10. UPIRET uses exact original references where present.
11. Refund/reversal pairs neutralize net spending and do not become ordinary income.
12. ₹1 verification requires corroborating context.
13. Multiple mandates for one provider remain distinct.
14. RACPC uses amount/reference/date-window evidence, not name alone.
15. Salary, reimbursement, interest, dividend, and investment income remain reportable separately.
16. Legitimate same-date/same-amount rows are not dropped.
17. Re-import is idempotent and explains duplicates.
18. Balance discontinuities identify exact source rows.
19. Ambiguity produces grouped review rather than fabricated certainty.
20. Each automatic interpretation exposes source, confidence, and reasons.
21. Corrections support all three scopes and never cross households.
22. Dashboard aggregates expose unclassified totals and reconcile to events.
23. Lists/review remain responsive at 100,000 rows via pagination/virtualization.
24. New schema and privileged functions enforce household access.

## Regression, security, and performance matrix

- Unit: HDFC extraction/grammar, fingerprints, economic impacts, resolver priority, recurring windows, exact/fuzzy matching, and balance continuity.
- Invariants: immutable raw rows, positive amounts, one direction, unique source fingerprint, one consumed original, and consistent event totals.
- Integration: migrations/RLS, atomic chunks, retry, rollback, correction scopes, transfer reconciliation, and aggregates.
- Real data: sanitized real rows plus local full-file parse/reconcile; the user-provided 1,209-row file when available.
- UI: grouped questions, account/card selection, summary counts, raw/interpreted detail, pagination, and accessibility.
- Performance: 1k/10k/100k generated HDFC rows with time, query count, and peak memory.
- Security: hostile formulas/cells, oversized input, malformed JSON, cross-household IDs, forged tokens, unsafe RPC calls, archive access, and log redaction.

## Rollout and delivery policy

Use an interpretation version and household rollout flag. Shadow-compute before dashboard cutover and monitor unknown, changed-classification, unmatched-reversal, balance-warning, exception, and correction rates. Rollback switches reads to legacy semantics while retaining raw/event evidence.

The requester explicitly authorized implementation after this plan, so work proceeds phase by phase without another planning pause. Each major phase starts with failing coverage, finishes with targeted tests plus the full suite where practical, and updates `CHANGES.md`. No commit is created without explicit approval.

## Implementation status — 2026-10-04

Implemented in this delivery: economic vocabulary/impact semantics, lossless physical-row HDFC extraction, running-balance validation, structured narration parsing, deterministic protected resolvers, guarded unknown credits, exact-reference reversals, canonical financial families/processors, recurring mandate detection/persistence, raw evidence fingerprints/storage, event schema and synchronization, account aliases, grouped blocking questions, destination-card linkage, three-scope correction learning with audit history, raw-versus-interpreted detail, economic dashboard/report projections, reset cleanup, server-confirmed parsed/submitted/inserted/excluded counts, bounded uploads, CSV formula protection, RLS/indexes, real-file regression coverage, and 1k/10k/100k benchmarks.

Verification baseline: 158 unit/regression tests pass; the production build passes; the real HDFC fixture yields 572 rows, 506 debits, 66 credits, zero ledger delta, and zero discontinuities across 571 running-balance transitions. Synthetic core-pipeline benchmarks completed without row loss at 1k/10k/100k in 68 ms / 490 ms / 3,727 ms, with the 100k run using approximately 166 MB heap on the test machine.

Deployment-dependent checks remain explicit: the migration must be applied to the target Supabase project before the new persistence path is exercised there, generated database types should then be regenerated from that live schema, and live RLS negative tests require authenticated users from two households. The repository does not contain local Supabase/PostgreSQL executables or target credentials, so those external-state checks cannot be truthfully marked complete from this workspace alone.
