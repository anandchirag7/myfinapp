# Category Type Display — Implementation Plan

## 1. Objective

Add a visible **Category type** field to:

1. The main Transactions page.
2. The transaction register on an individual Account page.

Category type means the category record's `kind`:

- `income`
- `expense`
- `transfer`
- `investment`

This is separate from the transaction's existing `type`. The UI must use the explicit category kind when a category is assigned and infer a useful display value for uncategorized transactions.

## 2. Agreed uncategorized behavior

For an uncategorized transaction:

- A negative/debit transaction displays `Expense`.
- A positive/credit transaction displays `Income`.
- A transfer displays `Transfer`.
- A zero amount or indeterminate direction displays `—`.

Imported statement amounts are stored as positive absolute values. Debit or credit direction is stored in `transaction.type`. The implementation therefore must not use `amount > 0` by itself for imported records.

The effective resolution order will be:

```ts
if (transaction.category?.kind) return transaction.category.kind;
if (transaction.type === "expense") return "expense";
if (transaction.type === "income") return "income";
if (transaction.type === "transfer") return "transfer";
if (Number(transaction.amount) < 0) return "expense";
if (Number(transaction.amount) > 0) return "income";
return null;
```

The amount-sign checks are defensive fallbacks for legacy or manually created signed records. The stored transaction type remains the authoritative direction for normalized imports.

## 3. Scope

### In scope

- Shared category-type resolution and presentation.
- A Category type column on both transaction tables.
- Explicit and inferred visual states.
- Sorting by category type.
- Transaction detail displays.
- Split and EMI child transaction handling.
- Main transaction and account-register CSV exports.
- Compatibility with customizable columns and saved views.
- Type-safe category-kind definitions.
- Automated and manual verification.

### Out of scope

- Changing a category's kind from either transaction table.
- Automatically assigning a category to an uncategorized transaction.
- Persisting the inferred category type to the database.
- Changing transaction direction based on a selected category.
- A Supabase schema migration.
- Category-type filtering, unless separately approved after the display feature is complete.

## 4. Existing data flow

`listTransactionsRich` already joins the required category fields:

```ts
category:categories(id, name, kind, color, icon)
```

Both target pages already declare `category.kind`, so no additional query or database column is required. The work is primarily a shared UI helper plus page-level table, sorting, detail, and export integration.

## 5. Shared category-type model

Introduce a reusable type and resolver in an appropriate shared library or component module:

```ts
export type CategoryKind = "income" | "expense" | "transfer" | "investment";

export type ResolvedCategoryType = {
  kind: CategoryKind | null;
  inferred: boolean;
};
```

The resolver will accept the minimum transaction fields required:

- `amount`
- `type`
- `category.kind`

It will return:

- The resolved kind.
- Whether the value was inferred because no category was assigned.

This centralizes the fallback rule and prevents the Transactions and Account pages from drifting apart.

## 6. Shared presentation component

Create a reusable `CategoryTypeBadge` or equivalent component.

Presentation requirements:

- `Income`: green treatment.
- `Expense`: red treatment.
- `Transfer`: blue treatment.
- `Investment`: purple treatment.
- Unknown: muted `—`.
- Use readable text in addition to color.
- Use compact sizing suitable for dense tables.
- Prevent wrapping or column distortion.
- Add `title` or tooltip text.
- For inferred values, use a lighter/outlined style and expose the message `Inferred from transaction direction`.
- For explicit values, expose the message `From assigned category`.

An inferred display must not visually imply that a real category has been assigned.

## 7. Main Transactions page

Target file:

`src/routes/_authenticated/transactions.tsx`

### 7.1 Column definition

- Add a `categoryType` key to `COL_DEFS`.
- Label it `Category type`.
- Place it immediately after `Category`.
- Use an initial width of approximately 120px.
- Make it visible in the default layout.
- Automatically make it available in the existing Customize view drawer.

### 7.2 Row rendering

- Resolve the effective category type for each row.
- Render the shared badge in the `categoryType` cell.
- Keep `Category` independently editable with the existing category popover.
- After an inline category change, the query invalidation/refetch must update both category name and category type.

### 7.3 Split transactions

For a parent transaction with category splits:

- If all categorized children resolve to the same category type, show that type.
- If child rows resolve to multiple types, display `Mixed`.
- If no child provides a type, fall back to the parent transaction direction.
- The `Mixed` state is display-only and uses a neutral badge.

The expanded split breakdown should also show each child's category type where space permits.

### 7.4 Sorting

- Add `categoryType` to the supported sort keys.
- Sort on the resolved display value, not only `category.kind`, so uncategorized rows are placed under their inferred type.
- Use stable label ordering or case-insensitive label sorting.
- Preserve the current secondary/order behavior for equal values.

### 7.5 Saved views and column customization

- Existing saved views must continue to load when they do not contain the new key.
- The new column must always appear as an available option in Customize view.
- Default layouts created after this change include the column.
- Applying an old saved view may retain its explicit visible-column selection; users can enable Category type from customization.
- Saving a new or updated view persists its visibility, width, and order through the existing layout payload.

### 7.6 Transaction detail sheet

Add a separate `Category type` detail row immediately after `Category`.

- Explicit value: normal badge or label.
- Inferred value: label it as inferred.
- Uncategorized must continue to display `Uncategorized` for the category itself.

### 7.7 CSV export

Add a `Category Type` column immediately after `Category`.

- Export `Income`, `Expense`, `Transfer`, or `Investment`.
- Export the resolved fallback for uncategorized rows.
- Do not write `Inferred` into the value unless a separate provenance column is introduced later.

## 8. Individual Account register page

Target file:

`src/routes/_authenticated/accounts_.$accountId.tsx`

### 8.1 Register table

- Add the `Category type` header immediately after `Category`.
- Add the corresponding cell to every primary register row.
- Preserve amount-column alignment and horizontal scrolling.
- Give the column a practical minimum width.

### 8.2 EMI and child rows

- Add the matching cell to expanded EMI/split child rows.
- Ensure every header and body row retains the same number of cells.
- Resolve each child independently from its category and direction.

### 8.3 Sorting

- Extend the account register's `sortKey` union with `categoryType`.
- Add `Category type` to the Sort by menu.
- Sort using the same shared resolver as the main Transactions page.

### 8.4 Detail sheet

Add `Category type` beside or immediately below Category in the transaction overview.

- Explicit category kinds display normally.
- Uncategorized fallback values display as inferred.

### 8.5 CSV export

Add `category_type` immediately after `category` in the account-register CSV.

- Use the resolved display value for uncategorized rows.
- Preserve existing CSV escaping and column order for all other fields.

## 9. Type safety

Replace generic `kind: string` declarations in the two page-local transaction types with the shared `CategoryKind` type.

The resolver must safely handle:

- Missing category objects.
- Null or unexpected category kinds returned by legacy data.
- Numeric and string amounts.
- Zero and non-finite amounts.
- Existing `income`, `expense`, and `transfer` transaction types.

Unexpected values should produce the neutral unknown state rather than crash rendering.

## 10. Cache and mutation behavior

Verify the existing mutation success paths invalidate the transaction queries used by both screens.

Required outcomes:

- Inline category changes immediately refresh Category type.
- Bulk category changes immediately refresh Category type.
- Category removal switches the cell to an inferred value.
- Category assignment switches the cell from inferred to explicit.
- Split changes recalculate the parent display.

If existing invalidations use inconsistent query keys, update them narrowly so both the main transaction list and account register remain current.

## 11. Optional follow-up: Category type filtering

Filtering is intentionally a follow-up because correct filtering should occur on the server before the list limit is applied.

If approved, add:

- A `categoryKinds` input to `listTransactionsRich`.
- Income, Expense, Transfer, Investment, and Uncategorized choices.
- Server-side filtering through the category relationship.
- Separate handling for `category_id IS NULL`.
- Filter controls on both target pages.
- Saved-view persistence on the Transactions page.

Client-only filtering is not recommended because both screens request a bounded result set and could omit matching rows beyond that limit.

## 12. Test plan

### 12.1 Unit tests

Cover the shared resolver:

1. Assigned income category returns explicit Income.
2. Assigned expense category returns explicit Expense.
3. Assigned transfer category returns explicit Transfer.
4. Assigned investment category returns explicit Investment.
5. Uncategorized expense transaction returns inferred Expense even when stored amount is positive.
6. Uncategorized income transaction returns inferred Income.
7. Uncategorized transfer returns inferred Transfer.
8. Negative legacy amount returns inferred Expense when type is unavailable.
9. Positive legacy amount returns inferred Income when type is unavailable.
10. Zero or invalid amount with no usable type returns unknown.
11. An explicit category kind always takes precedence over transaction direction.

### 12.2 Split-resolution tests

- Uniform child types resolve to that type.
- Different child types resolve to Mixed.
- Empty child categories fall back to parent direction.
- Explicit investment splits are not reduced to the parent expense direction.

### 12.3 Page-level checks

- Column appears in the intended position on both pages.
- Customize view supports visibility, order, and width.
- Old saved layouts still load.
- Sort direction works on both pages.
- Category assignment and removal update the badge.
- Detail sheets display explicit and inferred states.
- Expanded account child rows remain aligned.
- Narrow screens retain usable horizontal scrolling.

### 12.4 Export checks

- Main transaction CSV contains `Category Type`.
- Account-register CSV contains `category_type`.
- Explicit and inferred values are exported correctly.
- Existing commas, quotes, and line breaks remain escaped.

## 13. Delivery phases

### Phase A — Foundation

- Add the shared category-kind type.
- Add the resolver and badge.
- Add unit tests for inference and explicit precedence.

### Phase B — Transactions page

- Add the column and rendering.
- Add sorting and split aggregation.
- Integrate column customization and saved views.
- Update detail sheet and CSV export.

### Phase C — Account page

- Add the register and child-row cells.
- Add sorting.
- Update detail sheet and CSV export.
- Verify responsive alignment.

### Phase D — Verification

- Run the complete regression suite.
- Run the production build.
- Run `git diff --check`.
- Perform desktop and narrow-layout manual checks.
- Record all modified files in `CHANGES.md` under the current date.

## 14. Acceptance criteria

The feature is complete when:

1. Both transaction tables display Category type.
2. Assigned categories display their actual category kind.
3. Uncategorized debits display Expense.
4. Uncategorized credits display Income.
5. Uncategorized transfers display Transfer.
6. Inferred values are visibly distinguishable from explicit category values.
7. No inferred value is persisted as a category assignment.
8. Split and EMI rows remain aligned and correctly resolved.
9. Sorting and exports include Category type.
10. Existing saved views continue to function.
11. Tests and the production build pass.
