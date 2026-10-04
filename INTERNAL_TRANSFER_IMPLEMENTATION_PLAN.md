# Internal Statement Transfer Implementation

## Outcome

Paisa stores one canonical internal-transfer transaction. The source account owns the row in `account_id`; the destination is stored in `transfer_account_id`. Account views render that row as a withdrawal for the source and a deposit for the destination, avoiding two editable records that can drift or double-count.

External bank-rail payments (UPI, NEFT, IMPS, RTGS, or a named payee) remain expenses when debited and income when credited. A payment rail alone is never ownership evidence.

## Import flow

1. Fingerprinting identifies a possible self-transfer.
2. The confirmation screen asks for the directional account: **To account** for a debit and **From account** for a credit.
3. The user can select an existing household account, create one inline, or mark the row as an external payment.
4. The server validates household ownership, different source/target accounts, direction, and matching currency.
5. A database RPC serializes matching imports and either creates one canonical transfer or reconciles the opposite statement leg within a three-day posting window.
6. Statement evidence makes retries idempotent. Learned account mappings prefill future occurrences of the same pattern and direction.
7. Both affected balances are recomputed. A failed batch removes its evidence and newly created rows and recomputes balances again.

## Duplicate and ambiguity policy

- Re-uploading the same statement row reuses its evidence and cannot create another transfer.
- Two genuine identical rows remain distinct through their stable statement row keys.
- A candidate already evidenced by the current account is excluded, so a second same-side row does not collapse into it.
- More than one viable opposite-side candidate is rejected with an explicit ambiguity error instead of guessing.

## Security

- Both accounts must belong to the authenticated user's household.
- New evidence and transfer-memory tables use row-level security and household-access policies.
- The resolver uses invoker security and verifies `auth.uid()` against the request user.
- Cross-currency transfers are rejected until the ledger supports separate source and destination amounts.

## Verification

Automated coverage includes external-vs-internal classification, remembered mappings, debit/credit orientation, account validation, date-tolerant reconciliation, ambiguity, account perspective, retry fingerprints, and otherwise-identical row evidence. The full regression suite and production build must pass before release. A real anonymized bank Excel file is recommended as the final bank-layout acceptance fixture.
