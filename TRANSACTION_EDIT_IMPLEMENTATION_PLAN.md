# Complete Transaction Editing and Memorized Payee Workflow

## 1. Objective

Allow a user to open any transaction from either:

1. The main Transactions page.
2. An individual Account register page.

The user must be able to edit the complete user-managed transaction record and save the changes to the backend. If the merchant name changes, the application must ask how the change should affect memorized payees before completing the save.

The merchant workflow must support:

- Updating only the current transaction.
- Updating an existing memorized payee.
- Adding the renamed merchant as a new memorized payee.
- Reusing an already-existing memorized payee when the new name already exists.

## 2. Existing-system findings

### 2.1 Current transaction editing is incomplete

`patchTransaction` currently supports only a subset of transaction fields:

- Category
- Merchant
- Memo
- Note
- Payment method
- Tax code
- Check/reference number
- Tags
- Amount
- Date
- Cleared status
- Flagged, favorite, and reviewed flags

It does not currently support complete edits of:

- Transaction type
- Source account
- Transfer destination account

It also does not recompute account balances after changing amount, type, source account, or transfer destination.

### 2.2 Transaction amounts are normalized

Transaction amounts are stored as positive absolute values. Direction is represented by `type`:

- `income`
- `expense`
- `transfer`

The editor must display a positive amount input and a separate type selector. It must not save expenses as negative amounts.

### 2.3 Memorized payees are not linked by transaction foreign key

Transactions store merchant text and normalized statement patterns. They do not currently store a `memorized_payee_id`.

Payee recognition is based on:

- `memorized_payees.merchant`
- `memorized_payees.aliases`
- `memorized_payees.match_tokens`
- Transaction `normalized_pattern`
- `user_payee_overrides`

The merchant rename workflow must therefore update aliases/pattern memory deliberately rather than assume a database relationship that does not exist.

### 2.4 Existing payee APIs are not enough for atomic editing

`quickSavePayee` can create or enrich a memorized payee and write user overrides, but transaction editing and payee-memory updates currently happen through separate operations. A complete edit should not leave the transaction updated while the selected payee action silently fails.

## 3. Scope

### In scope

- A shared full-transaction editor used on both target pages.
- Complete editable user-managed transaction fields.
- Backend validation and household authorization.
- Correct account balance recomputation.
- Transfer-specific invariants.
- Merchant-change detection.
- A merchant-memory decision dialog.
- Existing memorized-payee lookup and duplicate prevention.
- Updating an existing memorized payee.
- Creating a new memorized payee.
- Updating recognition aliases and the applicable user override.
- Transaction activity/audit records.
- Cache invalidation across Transactions, Accounts, Dashboard, Payees, reports, and detail views.
- Responsive, accessible UI and robust error/retry behavior.
- Automated tests and production-build verification.

### Out of scope

- Automatically bulk-renaming all historical transactions when a payee is renamed.
- Editing statement import audit data.
- Editing `normalized_pattern` manually.
- Editing `import_batch_id`, creation metadata, attachment counts, or comment counts.
- Deleting attachments or comments from the edit form.
- Editing split children and the split definition in the same form; the existing Split Transaction workflow remains responsible for split structure.
- Automatically merging two memorized payees without an explicit future merge workflow.

## 4. Editable transaction fields

The shared editor will expose the following fields.

### Core fields

- Transaction type: Expense, Income, or Transfer
- Amount
- Transaction date
- Merchant/payee name
- Source account
- Destination account for transfers
- Category for non-transfer transactions

### Description and metadata

- Memo
- Note
- Payment method
- Check/reference number
- Tags
- Tax code

### Status fields

- Cleared status: Pending, Cleared, or Reconciled
- Reviewed
- Flagged
- Favorite

### Read-only context

- Transaction ID
- Import/source indicator when available
- Created date
- Last updated date
- Normalized statement pattern when useful for explaining payee memory
- Split/import warnings
- Attachment and comment counts

The form must use explicit allowlisted fields. It must never submit a spread of the complete database row.

## 5. Shared frontend model

Create a shared schema and form value type, for example:

```ts
type TransactionEditValues = {
  type: "income" | "expense" | "transfer";
  amount: string;
  txn_date: string;
  account_id: string;
  transfer_account_id: string | null;
  category_id: string | null;
  merchant: string;
  memo: string;
  note: string;
  payment_method: string;
  check_number: string;
  tags: string[];
  tax_code: string;
  cleared_status: "pending" | "cleared" | "reconciled";
  is_reviewed: boolean;
  is_flagged: boolean;
  is_favorite: boolean;
};
```

Create pure helpers to:

- Convert a transaction into form values.
- Trim and normalize nullable text fields.
- Produce the minimal changed-field patch.
- Detect a meaningful merchant-name change using trimmed, case-insensitive comparison.
- Validate type/account/category combinations.
- Detect fields that require account balance recomputation.

## 6. Shared full-transaction editor

Create a reusable `TransactionEditDialog` component used by both pages.

### 6.1 Entry points

Main Transactions page:

- Add `Edit transaction` to the row context menu.
- Add a pencil/edit action in the row action area.
- Add an Edit button to the transaction detail panel.

Individual Account page:

- Add an Edit action to each register row.
- Add Edit to the transaction detail sheet.

All entry points open the same component with the transaction ID. The editor should load authoritative transaction details rather than relying only on a possibly stale list-row object.

### 6.2 Dialog layout

Use a responsive dialog approximately `sm:max-w-2xl` or `sm:max-w-3xl`, bounded by viewport height with an internal scroll region and sticky footer.

Suggested sections:

1. Type and amount
2. Accounts and category
3. Merchant and description
4. Payment metadata
5. Status and flags
6. Read-only source/audit information

The footer contains:

- Cancel
- Save changes

The Save button must show pending state and prevent duplicate submission.

### 6.3 Conditional behavior

For Expense and Income:

- Show one Account selector.
- Show Category selector filtered to a compatible category kind while still allowing the current legacy value to remain visible.
- Hide and clear transfer destination.

For Transfer:

- Label source account as `From account`.
- Require a different `To account`.
- Clear category because transfers are not categorized through an expense/income category.

Changing type must not silently discard category or destination values. Show a confirmation or clearly explain the values that will be cleared before saving.

### 6.4 Split restrictions

For split parent or child transactions:

- Allow safe descriptive/status fields in the full editor.
- Route category allocation and split amounts through the existing split editor.
- Disable incompatible amount/type/account changes when they would invalidate child totals or relationships, unless a later atomic split-edit backend is added.
- Show a clear explanation and an `Edit split` shortcut.

## 7. Merchant rename decision workflow

### 7.1 Trigger

When the user clicks Save:

1. Build and validate the changed-field patch.
2. Compare the original and new merchant values after trimming and case folding.
3. If the merchant did not materially change, save immediately.
4. If the merchant changed, open the merchant-memory decision dialog before writing anything.

Changes that only add/remove surrounding whitespace or change casing can still update the transaction display, but should not force a payee-memory decision unless the canonical stored value meaningfully changes.

### 7.2 Candidate lookup

Before presenting choices, ask the backend for memorized-payee candidates using:

- Exact old merchant name
- Exact new merchant name
- Existing aliases
- The transaction's `normalized_pattern`
- Normalized merchant tokens

Results must be household-scoped and ranked with exact matches first. The response must identify:

- A payee matching the old name
- A payee already using the new name
- Alias/pattern matches
- Whether the candidate is locked

### 7.3 Dialog choices

The dialog will show:

**1. Update this transaction only**

- Save the new merchant on this transaction.
- Do not change or create memorized payees.
- Do not update recognition memory.

**2. Update an existing memorized payee**

- Let the user select from ranked candidates if more than one exists.
- Rename the selected payee's canonical merchant to the new value.
- Preserve the old canonical merchant as an alias.
- Preserve all existing payee settings, rules, categories, automation flags, and aliases.
- Update applicable user-payee overrides so this transaction's normalized pattern resolves to the new name.
- If the selected payee is locked, require explicit confirmation or disallow the action according to existing lock semantics.

**3. Add as a new memorized payee**

- Create a new payee using the new merchant name.
- Seed its default category and transaction type from the edited transaction.
- Seed account/payment/tags only through clearly defined defaults; do not silently enable unrelated automation.
- Store the old merchant name and transaction pattern as aliases/matching evidence where safe.
- Upsert the applicable `user_payee_overrides` entry.

**4. Use the memorized payee that already has this name**

- Show this instead of creating a duplicate when the new canonical name already exists.
- Add the current normalized pattern and safe old-name alias to that payee.
- Preserve the existing payee's defaults unless the user explicitly opts to replace them.

### 7.4 Default selection

- If the old merchant matches exactly one memorized payee and the new merchant does not exist, preselect `Update existing memorized payee`.
- If the new merchant already exists, preselect `Use existing payee`.
- If neither name matches, preselect `Add as a new memorized payee`.
- Always retain `Update this transaction only` as an explicit choice.

### 7.5 Historical transactions

Renaming a memorized payee must not silently rewrite historical transactions. The current transaction is updated because it is the item being edited. Existing transactions keep their stored merchant text and remain discoverable through the preserved alias.

A future bulk historical rename can be added as a separate previewed operation with affected-row counts.

## 8. Backend API design

### 8.1 Read endpoint

Extend or reuse `getTransactionDetail` so the editor receives:

- Every editable transaction field
- `updated_at` for concurrency protection
- Split-parent/child information
- `normalized_pattern`
- Joined account and category display data

Add a household-scoped merchant candidate lookup function returning only fields required by the decision dialog.

### 8.2 Complete update endpoint

Add a dedicated function such as `updateTransactionComplete` rather than expanding the lightweight inline-patch endpoint without limits.

Suggested request shape:

```ts
{
  id: string;
  expected_updated_at: string;
  patch: TransactionEditPatch;
  merchant_memory: {
    action: "transaction_only" | "update_payee" | "create_payee" | "use_existing_payee";
    payee_id?: string;
  } | null;
}
```

The server must ignore any client assertion about household or user identity and derive both from authenticated context.

### 8.3 Validation

Validate with Zod and backend ownership checks:

- Transaction belongs to the active household.
- Amount is finite, positive, and within supported precision/range.
- Date is valid.
- Merchant and text lengths are bounded.
- Tags are trimmed, deduplicated, bounded in count, and bounded in length.
- Source and destination accounts belong to the household.
- Transfer destination differs from source.
- Non-transfer transactions have no transfer destination.
- Selected category belongs to the household.
- Category kind is compatible with transaction type, or an explicit legacy exception is handled.
- Payee candidate belongs to the household.
- The requested payee action is consistent with whether the merchant changed.
- Imported/audit-only fields cannot be patched.

### 8.4 Optimistic concurrency

Use `expected_updated_at` to reject stale edits if another operation changed the transaction after the dialog loaded.

Return a typed conflict response containing the latest transaction data. The UI should offer:

- Reload latest values
- Cancel

Do not silently overwrite concurrent edits.

### 8.5 Atomicity

Transaction update, memorized-payee change, user override update, activity log, and affected-account balance recomputation should form one atomic database operation.

Recommended approach:

- Add a narrowly scoped PostgreSQL RPC in a Supabase migration.
- Use `SECURITY INVOKER` where practical so RLS remains effective.
- If elevated function privileges are required, explicitly verify `auth.uid()`, household membership, and ownership for every referenced row.
- Revoke public execution and grant only to `authenticated` and `service_role` as required.
- Raise typed errors for stale versions, duplicates, locked payees, invalid accounts, or invalid categories.

If an RPC is not used, the server function must implement compensating recovery and expose partial failure explicitly. Silent best-effort payee memory is not acceptable for a user-confirmed action.

### 8.6 Balance recomputation

Fetch the original transaction before updating. Build a unique set containing:

- Original source account
- Original transfer destination
- New source account
- New transfer destination

Recompute every affected account after the transaction update using `recompute_account_balance`. This is required when any of these change:

- Amount
- Type
- Source account
- Transfer destination

Recomputation must occur inside the atomic workflow or cause the whole operation to fail.

### 8.7 Payee update rules

When updating an existing memorized payee:

- Update by payee ID, never by merchant text alone.
- Preserve all fields not explicitly changed.
- Append the old canonical name to aliases after normalization and deduplication.
- Preserve current aliases and match tokens.
- Reject or redirect if the new canonical merchant conflicts with another household payee.
- Respect the payee's `locked` flag.
- Update `modified_by` and `updated_at`.

When creating a new memorized payee:

- Prevent case-insensitive duplicate canonical merchant names.
- Use conservative automation defaults.
- Derive default type and category from the transaction.
- Add the transaction's normalized pattern and appropriate old-name alias.
- Create or update the user's deterministic override for this pattern.

### 8.8 Activity log

Write a transaction activity entry containing:

- Changed field names
- Safe before/after values
- Merchant-memory action
- Affected payee ID when applicable
- Actor ID
- Timestamp

Do not store secrets or unbounded raw payloads. Avoid duplicating full statement narration when a field-level diff is enough.

Consider a separate payee activity entry if the existing payee audit model supports it.

## 9. Database migration plan

Add one migration for the atomic RPC and supporting constraints/indexes only if missing.

Recommended database improvements:

- Atomic `update_transaction_complete` RPC.
- Case-insensitive household-level duplicate protection for canonical memorized-payee names, after auditing existing duplicates.
- Indexes supporting household + lower merchant lookup if not already present.
- Explicit execute grants.
- Comments documenting security and transaction semantics.

No `memorized_payee_id` column is required for this release. Introducing that relationship would require a separate backfill, conflict-resolution policy, and import-pipeline change.

The migration must be idempotent where practical and accompanied by a narrowly scoped rollback section or update to the project's undo documentation.

## 10. Cache invalidation

After a successful complete edit, invalidate:

- Main transaction lists
- The edited transaction detail query
- Account register lists for old and new accounts
- Account summaries and balances
- Dashboard summaries
- Reports affected by date, amount, category, account, or type
- Memorized payee lists
- Payee transaction lists
- Pattern-resolution/memory queries if cached

Use centralized query keys where available. Fix inconsistent local keys rather than calling an unrestricted global invalidation.

## 11. UI state and failure handling

### 11.1 State machine

Use explicit stages:

1. Loading transaction
2. Editing
3. Validating
4. Choosing merchant-memory action
5. Saving transaction and payee decision
6. Refreshing affected views
7. Success or failure

### 11.2 Failure behavior

- Keep the editor values when save fails.
- Keep the selected merchant-memory action for retry.
- Show field errors beside their inputs.
- Show backend ownership/conflict errors clearly.
- Never close the dialog on failure.
- Prevent double submission.
- If the transaction was deleted elsewhere, close only after explaining that it no longer exists.

### 11.3 Success behavior

- Close both the payee decision and edit dialogs.
- Show a concise success toast.
- If a payee was updated or created, include that result in the message.
- Refresh all affected views before presenting stale totals as current.

## 12. Accessibility and responsive behavior

- Every input has a visible label.
- Validation errors are connected with `aria-describedby`.
- Dialog focus returns to the originating Edit control.
- Merchant-memory options are keyboard-selectable radio cards.
- Destructive implications such as clearing transfer/category data are expressed in text.
- The dialog is viewport-bounded and internally scrollable.
- The action footer remains reachable on smaller screens.
- Long merchant, account, and category names truncate visually while remaining available through title/accessible text.

## 13. Security requirements

- Require authenticated Supabase context for all reads and writes.
- Resolve household ID server-side.
- Verify transaction, account, category, and payee household membership independently.
- Never accept `household_id`, `created_by`, or `modified_by` from the client.
- Allowlist writable columns.
- Prevent mass assignment.
- Parameterize all database operations.
- Respect RLS and explicit RPC execute grants.
- Do not expose full memorized-payee automation configuration in candidate search results.
- Limit merchant candidate count and input lengths.
- Audit payee mutation choices.

## 14. Test plan

### 14.1 Pure validation and diff tests

- Converts a complete transaction into form values.
- Produces only changed fields.
- Treats case/whitespace-only merchant edits according to the agreed rule.
- Validates positive normalized amounts.
- Rejects identical transfer accounts.
- Clears destination for non-transfer types.
- Rejects incompatible category ownership/kind.
- Deduplicates and bounds tags.

### 14.2 Backend transaction tests

- Updates every allowed field.
- Rejects forbidden fields.
- Rejects cross-household transaction, account, category, and payee IDs.
- Recomputes the original account after moving a transaction.
- Recomputes the new account.
- Recomputes both old and new transfer destinations.
- Handles expense-to-income, income-to-expense, and transfer conversions.
- Rejects stale `expected_updated_at`.
- Writes a field-level activity record.
- Rolls back the transaction when the selected payee operation fails.

### 14.3 Merchant-memory tests

- Merchant unchanged skips the decision workflow.
- Transaction-only changes no payee data.
- Updating a payee preserves its settings and adds the old name as an alias.
- Creating a payee seeds category/type and recognition pattern.
- Existing new-name payee is reused instead of duplicated.
- Duplicate names differing only by case are prevented.
- Locked payees cannot be renamed without the defined confirmation path.
- Override creation maps the transaction's normalized pattern to the new merchant.
- Historical transaction merchant fields are not bulk rewritten.

### 14.4 UI tests

- Edit is reachable from both pages and detail views.
- The shared editor loads all current values.
- Conditional type/account/category fields behave correctly.
- Merchant rename opens the decision dialog.
- Canceling the decision returns to the populated editor without writing.
- Each payee choice submits the expected action.
- Loading, conflict, error, retry, and success states are visible.
- Both pages refresh after save.
- Mobile and desktop layouts remain usable.

### 14.5 Regression checks

- Inline category editing continues to work.
- Bulk transaction actions continue to work.
- Split editing continues to work.
- Existing imports and memorized-payee matching continue to work.
- Category type display refreshes after category/type changes.
- Account and dashboard totals reflect amount/type/account edits.
- Full test suite, production build, and `git diff --check` pass.

## 15. Delivery phases

### Phase A — Shared model and editor shell

- Add transaction edit types, form conversion, validation, and diff helpers.
- Build the shared responsive editor.
- Add edit entry points to both pages.
- Load authoritative transaction details.

### Phase B — Complete backend update

- Add the complete update schema and endpoint/RPC.
- Add ownership validation and optimistic concurrency.
- Add affected-account balance recomputation.
- Add field-level activity logging.
- Verify ordinary edits before enabling merchant-memory changes.

### Phase C — Merchant-memory decision

- Add candidate lookup.
- Add the decision dialog and recommended default selection.
- Implement transaction-only, update-payee, create-payee, and reuse-existing actions.
- Preserve aliases/settings and update deterministic pattern memory.
- Make the combined operation atomic.

### Phase D — Integration and refresh

- Connect both pages and detail views.
- Add targeted cache invalidation.
- Add conflict, error, and success handling.
- Verify category type and financial totals refresh immediately.

### Phase E — Verification and rollout

- Add unit, backend, and integration regression tests.
- Test expense, income, transfer, imported, split, and uncategorized examples.
- Run the complete regression suite.
- Run the production build.
- Run `git diff --check`.
- Update `CHANGES.md` under the current date.

## 16. Acceptance criteria

The feature is complete when:

1. A user can open the same full editor from Transactions and an individual Account register.
2. All allowlisted user-managed transaction fields can be edited and persist correctly.
3. Amount, type, source, and destination changes produce correct account balances.
4. Transfer validation prevents invalid source/destination combinations.
5. Changing a merchant always presents the merchant-memory decision before writing.
6. The user can choose transaction-only, update existing payee, create new payee, or reuse an existing new-name payee.
7. Existing payee settings and rules are preserved when its name changes.
8. Duplicate memorized payees are prevented.
9. Recognition aliases and the transaction's normalized-pattern override are updated when requested.
10. Historical transactions are not silently bulk renamed.
11. The combined transaction/payee operation cannot leave a silent partial save.
12. Concurrent edits are detected rather than overwritten.
13. Both pages, account balances, payees, reports, and dashboard data refresh correctly.
14. Activity history identifies what changed and which payee action was chosen.
15. Automated tests and the production build pass.
