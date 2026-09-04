# Changes Log

This file tracks all modified and newly created files along with their date of change.

## 2026-09-04

- Added a phased implementation plan for displaying explicit and direction-inferred category types on the Transactions and individual Account register pages, including split handling, sorting, saved views, details, exports, type safety, and verification.
- `category_type_implement.md`
- Implemented Category type across the Transactions workspace and individual Account register with explicit category-kind badges, debit/credit inference for uncategorized rows, mixed split handling, sorting, saved-view compatibility, detail displays, CSV exports, and focused regression coverage.
- `src/lib/category-type.ts`
- `src/components/category-type-badge.tsx`
- `src/routes/_authenticated/transactions.tsx`
- `src/routes/_authenticated/accounts_.$accountId.tsx`
- `src/tests/category-type.test.ts`
- `src/tests/test-runner.ts`
- Fixed the Transactions analytics breakdown header so it follows the selected grouping and displays Top categories, merchants, tags, or accounts as appropriate.
- Added a detailed phased plan for full transaction editing across Transactions and Account registers, including atomic backend persistence, balance recomputation, optimistic concurrency, and an explicit memorized-payee update/create/reuse workflow when merchant names change.
- `TRANSACTION_EDIT_IMPLEMENTATION_PLAN.md`

## 2026-09-03

- Revamped Settings page with modern hero profile banner, Radix tabbed layout (General, Statement & AI, Notifications, Statement Archive, Data & Reset), visual Light/Dark theme mockups, auto-approve threshold presets, and polished notifications.
- `src/routes/_authenticated/settings.tsx`
- `src/lib/profile.functions.ts`
- Added comprehensive Firefly III rules engine analysis and implementation plan.
- `RULES_FEATURE_IMPLEMENTATION_PLAN.md`
- Added a unified household rules engine with ordered groups, deterministic triggers/actions, ad-hoc and scheduled execution, audit logs, and an idempotent migration of existing payee rules.
- Added Planning → Rules with natural-language AI classification preferences and deterministic rule creation.
- Statement imports now apply deterministic rules after normalization and before lookups/AI, then pass bounded natural-language household preferences to the classifier for unmatched rows.
- Added bearer-authenticated `/api/public/hooks/rules-worker` scheduling support through `RULES_WORKER_SECRET`.
- Added `supabase_undo.sql`, a narrowly scoped transaction-safe rollback for all database objects and data introduced by the unified Rules migration while preserving the original payee rules and financial records.
- Expanded deterministic Rules UI and execution support to 19 transaction trigger fields, 13 comparison operators, and 34 Paisa-compatible actions covering descriptions, notes, tags, accounts, transaction types, budgets, payment metadata, status, and review flags.
- Enlarged and made the Rules editor responsive, with viewport-bounded scrolling, mobile-stacked fields, proportional desktop columns, constrained option menus, truncated long selected labels, and a sticky action footer.
- Fixed the statement import confirmation dialog overflowing horizontally by widening it responsively, allowing all grids and duplicate rows to shrink, wrapping long match explanations, constraining both scroll axes, and stacking footer actions on narrow screens.
- Added dynamic multi-condition deterministic rules with numbered condition rows, add/remove controls, per-condition inversion, between-range inputs, and selectable AND/OR matching semantics.
- Increased the Create Rule dialog desktop width from the 5XL to 6XL breakpoint while retaining its 96vw responsive limit.
- Widened the deterministic condition matching-mode control and dropdown so the complete AND/OR labels remain visible.
- Added a Run Now execution modal with immediate feedback, animated phase indicators, progress bar, dry-run scan/match counts, apply and refresh stages, final updated totals, failure details, and per-rule loading state.
- Added editing for existing deterministic and natural-language rules, preloading group, rule type, every condition, AND/OR behavior, action, timing, and schedule into the shared editor and updating the original rule in place.
- Made rule editing lossless for multi-action rules by loading, displaying, reordering by saved priority, adding/removing, and resaving the complete ordered action list.
- Fixed category rule actions accepting visible names such as `Miscellaneous`: names are now resolved to household category UUIDs on save, and legacy name-valued actions are hydrated at execution time.
- Fixed approved high-confidence statement payees not reaching `memorized_payees`: approval now explicitly marks new clusters for persistence, and preview/commit use the same approved-or-selected eligibility rule.
- Fixed learned `user_payee_overrides` being mislabeled as existing memorized payees; only a real `memorized_payees` match now sets `isExisting`, while learned names remain high-confidence and eligible to be saved on import.
- Optimized ad-hoc rule execution by loading rules/categories once, evaluating the full transaction set in memory, applying matched updates in bounded parallel batches, and bulk-inserting audit logs instead of performing database reads and writes sequentially per row.
- Fixed category-only statement rules replacing payee names with full bank/UPI narrations: deterministic category overrides still take precedence, while normal lookup/AI naming continues unless a rule explicitly changes the merchant/description.
- Added payment-rail display-name cleanup for learned overrides, including removal of `UPI-` wrappers and concatenated/reversed duplicate handles such as `ABHISHEK ANAND-ANANDABHISHEK`, while preserving ordinary user-entered payee names.
- Improved LLM-assisted categorization to select validated exact household category names before coarse fallback keys, use narration/type/merchant evidence, honor natural-language preferences, reject invented categories, avoid generic categories when specific evidence exists, and distinguish refunds, salary, investments, transfers, and payment rails more carefully.

## 2026-09-02

- Implemented Release A of `import_plan.md`: a native Ollama-only statement inference client with preflight, typed errors, retries, validation, telemetry, realistic batching, truthful partial states, and provider contract/failure tests.
- Completed Release B with hard ledger reconciliation, versioned rail-aware narration fingerprints, household-scoped identifier hashes, separate transaction-type decisions, semantic merge guards, post-resolution canonical merging, reversible debit-return links, and a labelled pairwise-precision corpus.
- `src/lib/statement-ledger.ts`
- `src/lib/statement-fingerprint.ts`
- `src/tests/statement-release-b.test.ts`
- `src/tests/fixtures/statement-release-b-gold.ts`
- `src/lib/ollama.server.ts`
- `src/lib/statement-classify.server.ts`
- `src/lib/statement-parse.server.ts`
- `src/lib/statement-pipeline.server.ts`
- `src/lib/statement-import.functions.ts`
- `src/routes/api/public/hooks/statement-classify.ts`
- `src/hooks/use-statement-classification.ts`
- `src/integrations/supabase/types.ts`
- `src/tests/ollama.test.ts`
- `src/tests/test-runner.ts`
- `supabase/migrations/20260902000000_statement_import_job_states.sql`
- `CHANGES.md`
- Started Release C with a durable PGMQ statement-classification queue, service-role queue RPCs, visibility timeout and retry metadata, an authenticated worker endpoint, idempotent enqueue keys, and a feature-flagged rollout path.
- `supabase/migrations/20260902010000_statement_classification_queue.sql`
- `src/lib/statement-queue.server.ts`
- `src/routes/api/public/hooks/statement-worker.ts`
- `src/routeTree.gen.ts`
- Added a complete Supabase Vault, `pg_net`, and Cron setup and operations runbook for the statement worker.
- `SUPABASE_STATEMENT_WORKER_CRON.md`
- Completed Release C with stable category-key classification, calibrated Ollama confidence, verified pgvector entity retrieval with corroboration and negative-memory guards, structured pattern resolutions, household-only positive/negative learning, risk-based non-blocking review rules, durable queue processing, and reversible import coverage.
- `supabase/migrations/20260902020000_release_c_resolution_memory.sql`
- `src/lib/statement-category-keys.ts`
- `src/lib/statement-embedding.server.ts`
- `src/lib/statement-review-risk.ts`
- `src/lib/statement-pipeline.functions.ts`
- `src/tests/statement-release-c.test.ts`
- `import_plan.md`
- `package.json`
- `package-lock.json`
- Started Release D with explicit versioned Ollama consent, a business-only eligibility and hard-redaction gate, an Ollama Web Search shadow adapter, hashed positive/negative caching, hostile-result filtering, evidence scoring, and privacy regression tests.
- `supabase/migrations/20260902030000_release_d_web_enrichment_pilot.sql`
- `src/lib/merchant-web-enrichment.ts`
- `src/lib/merchant-web-enrichment.server.ts`
- `src/tests/statement-release-d.test.ts`
- Made Release D API-key driven: `ollama-web-search` is tagged `enabled` when `OLLAMA_API_KEY` exists and `skipped_no_api_key` otherwise, without affecting local Ollama classification or embeddings.
- Completed Release D with a versioned consent UI, provider disclosure/status, aggregate privacy and precision auditing, a labelled sanitized evaluation corpus, and the plan-approved disabled-provider fallback when no web-search API key exists.
- `src/lib/merchant-enrichment-evaluation.ts`
- `src/tests/fixtures/statement-release-d-gold.ts`
- `supabase/migrations/20260902040000_release_d_enrichment_audits.sql`
- `src/routes/_authenticated/settings.tsx`
- `src/lib/profile.functions.ts`
- Completed Release E with service-controlled resolver/web feature flags, deterministic household canaries, persisted shadow comparison metrics, database and deployment kill switches, staged-rollout SQL, and rollback regression tests.
- `supabase/migrations/20260902050000_release_e_controlled_rollout.sql`
- `src/lib/statement-rollout.ts`
- `src/lib/statement-rollout.server.ts`
- `src/tests/statement-release-e.test.ts`
- `RELEASE_E_ROLLOUT.md`
- Added malformed-JSON recovery for Ollama classification: failed batches are retried and bisected so one bad batch response cannot discard every payee classification.
- `src/lib/batch-recovery.ts`
- `src/tests/batch-recovery.test.ts`

## 2026-09-03

- Prevented local Ollama CUDA exhaustion during JSON recovery by making split batches sequential and bounding the default context window to 2,048 tokens; added optional `OLLAMA_NUM_GPU` CPU-fallback configuration.
- `.env`
- Stopped using the service-role client for local synchronous statement classification and household pattern learning; the authenticated session now performs those RLS-scoped writes.
- Fixed the confirm screen so the background naming spinner stops after `complete`, `partial`, `failed`, or `cancelled` terminal states.
- Switched statement classification back to `gpt-oss:120b-cloud` after validating the current five-pattern stable-category JSON contract through the local Ollama client; local `mxbai-embed-large` remains the embedding model.

## 2026-08-30

- Added an Ollama-first, low-touch statement-import architecture and merchant-enrichment research plan based on the supplied 572-transaction regression statement.
- `import_plan.md`
- Added the statement-import remediation and acceptance-test plan.
- `fixplan.md`
- Implemented response-local category resolution, reliable awaited AI classification, household learning persistence, safer merchant normalization and lookup, import diagnostics, and sanitized regression coverage for statement import.
- `src/components/statement-import-dialog.tsx`
- `src/components/statement-import/parsing-timeline.tsx`
- `src/lib/pattern-categories.functions.ts`
- `src/lib/statement-classify.server.ts`
- `src/lib/statement-clusters.ts`
- `src/lib/statement-pipeline.functions.ts`
- `src/lib/statement-pipeline.server.ts`
- `src/routes/api/public/hooks/statement-classify.ts`
- `src/tests/fixtures/statement-import-regression.ts`
- Implemented the approved 98-row global category template, safe existing-household backfill, stable category keys, 319 seed merchant remaps, 6 unsafe seed removals, and 189 new global patterns.
- Aligned import classification categories and deterministic keyword rules with the compact taxonomy while preserving legacy aliases.
- `CATEGORY_RECONCILIATION_REVIEW_PLAN.md`
- `EXISTING_MERCHANT_REMAP.md`
- `NEW_PATTERN_PROPOSALS.md`
- `supabase/migrations/20260830000000_default_category_taxonomy.sql`
- `src/lib/default-category-templates.ts`
- `src/lib/statement-normalize.ts`
- `src/lib/category-resolver.ts`
- `src/integrations/supabase/types.ts`
- `src/tests/statement-normalize.test.ts`
- `CHANGES.md`

## 2026-08-29

- Completed the Phase 1 statement-import auto-categorization flow with a summary-first exception review, keyword and AI bulk category assignment, one-click approval, a working auto-pilot transition, and a configurable per-user approval threshold.
- Added review documents for the proposed default category taxonomy, existing merchant remaps, and new merchant-pattern candidates.
- `CATEGORY_RECONCILIATION_REVIEW_PLAN.md`
- `EXISTING_MERCHANT_REMAP.md`
- `NEW_PATTERN_PROPOSALS.md`
- `src/components/statement-import/confirm-step.tsx`
- `src/components/statement-import-dialog.tsx`
- `src/lib/statement-import.functions.ts`
- `src/lib/profile.functions.ts`
- `src/routes/_authenticated/settings.tsx`
- `CHANGES.md`

## 2026-08-05

- `.env`
- `package.json`
- `package-lock.json`
- `vite.config.ts`
- `src/lib/ai-gateway.server.ts`
- `src/routes/api/chat.ts`
- `src/routes/auth.tsx`
- `src/lib/statement-import.functions.ts`
- `src/lib/statement-parse.server.ts`
- `src/components/statement-import-dialog.tsx`
- `src/routeTree.gen.ts`
- `src/components/statement-import/confirm-step.tsx`
- `src/lib/memorized-payees.functions.ts`
- `src/integrations/supabase/client.server.ts`
- `src/lib/statement-pipeline.server.ts`
- `src/lib/statement-classify.server.ts`
- `src/routes/__root.tsx`
- `src/components/category-select-popover.tsx`
- `src/lib/categories.functions.ts`
- `src/routes/_authenticated/categories.tsx`
- `src/lib/transactions.functions.ts`
- `src/routes/_authenticated/accounts_.$accountId.tsx`
- `src/lib/statement-parse.server.ts`
- `src/lib/statement-import.functions.ts`
- `supabase/migrations/20260805223000_create_emi_tables.sql`
- `AGENTS.md`
- `CHANGES.md`

## 2026-08-25

- Reimagined the dashboard as a responsive money command center with a financial pulse hero, contextual highlights, quick actions, clearer workspace controls, refined widget surfaces, and a net-worth card that fits saved and newly created layouts.
- `src/routes/_authenticated/index.tsx`
- `src/lib/dashboard-widgets.tsx`
- `src/lib/dashboard-templates.ts`
- `src/styles.css`
- `CHANGES.md`

## 2026-08-06

- `src/lib/statement-detect.ts`
- `src/lib/statement-parse.server.ts`
- `src/lib/statement-import.functions.ts`
- `src/routes/_authenticated/accounts_.$accountId.tsx`
- `src/components/statement-import/confirm-step.tsx`
- `src/components/statement-import/review/virtualized-list.tsx`
- `src/components/statement-import/review-step.tsx`
- `src/components/statement-import/review/transaction-row.tsx`
- `src/components/statement-import/review/category-combobox.tsx`
- `src/components/statement-import/review/payee-combobox.tsx`
- `CHANGES.md`

## 2026-08-15

- Enhanced authentication flow with auto-confirmation and fallback for email verification in `src/routes/auth.tsx` and `src/lib/auth.functions.ts`
- Added server-side admin user provisioning and auto-confirmation for demo account in `src/lib/demo.functions.ts`
- Fixed invalid hook call and HeadContent useContext error by structuring RootDocument inside RootComponent and adding explicit deduplication for react, @tanstack/react-router, and @tanstack/react-start in vite.config.ts
- Resolved SSR hydration mismatch error by removing conflicting `ssr: false` route overrides in `src/routes/auth.tsx`, `src/routes/_authenticated/route.tsx`, and `src/routes/[.]lovable.oauth.consent.tsx`
- Pulled latest code from `dev1` branch of `https://github.com/anandchirag7/Speedy-Finance-Friend.git`
- Integrated multi-category split transaction dialog support, import history scrollbar improvements, high confidence review workflows, and category pagination updates
- Updated TanStack Start and MCP server configuration in `vite.config.ts`
- Added hydration safety enhancements in `src/routes/__root.tsx`, `src/components/theme-provider.tsx`, and `src/routes/auth.tsx`
- `vite.config.ts`
- `src/styles.css`
- `src/routes/__root.tsx`
- `src/components/theme-provider.tsx`
- `src/routes/auth.tsx`
- `src/components/split-transaction-dialog.tsx`
- `src/components/statement-import/confirm-step.tsx`
- `src/components/statement-import/review/types.ts`
- `src/components/statement-import-dialog.tsx`
- `src/components/statement-archive-card.tsx`
- `src/components/category-select-popover.tsx`
- `src/lib/categories.functions.ts`
- `src/lib/transactions.functions.ts`
- `src/lib/statement-import.functions.ts`
- `src/lib/statement-pipeline.server.ts`
- `src/lib/statement-classify.server.ts`
- `src/lib/statement-clusters.ts`
- `src/lib/statement-detect.ts`
- `src/lib/finance.functions.ts`
- `src/lib/memorized-payees.functions.ts`
- `src/routes/_authenticated/accounts_.$accountId.tsx`
- `src/routes/_authenticated/categories.tsx`
- `src/routes/_authenticated/payees.tsx`
- `src/routes/_authenticated/reports.tsx`
- `src/routes/_authenticated/route.tsx`
- `src/routes/_authenticated/settings.tsx`
- `src/routes/_authenticated/transactions.tsx`
- `src/routes/[.]lovable.oauth.consent.tsx`
- `src/routes/mcp.ts`
- `src/routeTree.gen.ts`
- `CHANGES.md`

## 2026-08-18

- Fixed `Uncaught TypeError: import_browser_external_node_async_hooks.AsyncLocalStorage is not a constructor` by removing `@tanstack/react-start` from Vite browser `optimizeDeps.include` to prevent server context modules from being bundled into client builds
- Fixed `Cannot read properties of null (reading 'useContext')` and `Invalid hook call` in `<AuthPage>` and other route components by replacing raw `Route.useSearch()`, `Route.useParams()`, and `Route.useRouteContext()` with TanStack Router hooks (`useSearch({ strict: false })`, `useParams({ strict: false })`, `useRouteContext({ strict: false })`)
- `src/routes/auth.tsx`
- `src/routes/__root.tsx`
- `src/routes/_authenticated/accounts_.$accountId.tsx`
- `src/routes/_authenticated/chat.$threadId.tsx`
- `src/routes/_authenticated/transactions.tsx`
- `src/routes/[.]lovable.oauth.consent.tsx`
- `vite.config.ts`
- `CHANGES.md`

- Fixed `accounts.map is not a function` error boundary crash by safeguarding account queries and adding safe array fallback checks to `AccountPicker`, `MultiPicker`, and `import-step.tsx`
- Added "Remember me" option on the login and signup screens with client-side credential persistence, auto-population, and quick clear controls
- Fixed "No household" error by implementing resilient self-healing `getHouseholdId` helper in `src/lib/household.server.ts` that automatically provisions and links households for any user
- Updated all server functions to use the resilient household resolution logic
- Created Supabase migration `supabase/migrations/20260816000000_fix_user_households_trigger.sql` for trigger updates and existing user backfills
- Fixed `Cannot read properties of null (reading 'useContext')` and `Invalid hook call` crash by importing `PieChartIcon` from `lucide-react` instead of passing the Recharts `PieChart` component as an icon in dashboard widgets
- Cleaned up inline `useServerFn` hook calls within `useMutation` options in `categories.tsx`
- Phase 1 Performance Optimization: Added high-performance PostgreSQL composite/partial indexes for 1M+ transactions & 5k+ categories
- Phase 1 Performance Optimization: Added stored procedures `recompute_account_balance`, `get_categories_with_usage`, `get_dashboard_cashflow`, and `get_dashboard_top_spend`
- Phase 1 Performance Optimization: Eliminated unbounded in-memory loops in `listCategoriesWithUsage`, `recomputeAccountBalance`, and `getDashboard`
- Phase 2 Bundle Optimization: Refactored `jspdf` and `jspdf-autotable` to dynamic imports across `statement-export.ts`, `reports-pdf.ts`, and `report-exports.functions.ts`
- Phase 2 Bundle Optimization: Configured Rollup manual chunking in `vite.config.ts` for export engines, charts, icons, and table utilities
- Phase 3 Architecture: Implemented centralized query key factory `src/lib/query-keys.ts` with tenant-aware invalidation patterns
- Phase 3 Architecture: Standardized React Query cache policies and stale-times across `categories.tsx`, `transactions.tsx`, and `index.tsx`
- Resolved `[plugin unwasm] Failed to load the WebAssembly module: Cannot resolve module 'env'` by completely decoupling Shiki/Oniguruma WASM dependencies from Streamdown plugins
- Fixed `Cannot read properties of null (reading 'useContext')` and `Invalid hook call` in `<AuthPage>` by removing manualChunks chunk splitting that caused React module graph separation in SSR and client builds
- `package.json`
- `src/components/ai-elements/message.tsx`
- `src/lib/query-keys.ts`
- `src/routes/_authenticated/index.tsx`
- `src/lib/statement-export.ts`
- `src/lib/reports-pdf.ts`
- `src/lib/report-exports.functions.ts`
- `vite.config.ts`
- `supabase/migrations/20260817000000_performance_indexes_and_rpc.sql`
- `src/lib/statement-audit.server.ts`
- `src/routes/_authenticated/transactions.tsx`
- `src/components/statement-import/import-step.tsx`
- `src/routes/auth.tsx`
- `src/lib/household.server.ts`
- `src/lib/finance.functions.ts`
- `src/lib/bills.functions.ts`
- `src/lib/categories.functions.ts`
- `src/lib/transactions.functions.ts`
- `src/lib/budgets.functions.ts`
- `src/lib/payee-rules.functions.ts`
- `src/lib/memorized-payees.functions.ts`
- `src/lib/statement-audit.functions.ts`
- `src/lib/statement-pipeline.server.ts`
- `src/lib/statement-import.functions.ts`
- `src/lib/statement-archive.functions.ts`
- `src/lib/chat.functions.ts`
- `src/lib/dashboards.functions.ts`
- `src/lib/data-reset.functions.ts`
- `src/lib/reports-fetch.ts`
- `src/lib/profile.functions.ts`
- `src/routes/api/chat.ts`
- `src/lib/dashboard-widgets.tsx`
- `src/routes/_authenticated/categories.tsx`
- `supabase/migrations/20260816000000_fix_user_households_trigger.sql`
- `CHANGES.md`

## 2026-08-18

- Fixed `Uncaught TypeError: import_browser_external_node_async_hooks.AsyncLocalStorage is not a constructor` by excluding server-only `@tanstack/react-start` packages from browser `optimizeDeps` while bundling `@tanstack/react-router`, `@tanstack/react-query`, and React to ensure a unified singleton instance without Node.js `async_hooks` leaks
- Fixed `Invalid hook call` and `Cannot read properties of null (reading 'useContext')` by configuring `optimizeDeps.include` in `vite.config.ts` to bundle `@tanstack/react-router` and `@tanstack/react-query` with React, preventing shallow CJS interop copy of React namespace
- Stabilized `QueryClientProvider` fallback client instantiation inside `src/routes/__root.tsx` using `useState`
- Fixed missing `profile` reference in `src/lib/reports-fetch.ts` and `src/routes/api/chat.ts`
- Fixed navigate search requirement in `src/components/budgets/BudgetAnalytics.tsx`
- Fixed accountId nullability prop typing in `src/routes/_authenticated/accounts_.$accountId.tsx`
- Fixed type comparisons in `src/lib/memorized-payees.functions.ts`
- `vite.config.ts`
- `src/routes/__root.tsx`
- `src/lib/reports-fetch.ts`
- `src/routes/api/chat.ts`
- `src/components/budgets/BudgetAnalytics.tsx`
- `src/routes/_authenticated/accounts_.$accountId.tsx`
- `src/lib/memorized-payees.functions.ts`
- `src/lib/statement-classify.server.ts`
- `src/lib/statement-clusters.ts`
- `src/components/statement-import-dialog.tsx`
- `src/tests/statement-normalize.test.ts`
- `src/lib/categories.functions.ts`
- `src/lib/finance.functions.ts`
- `src/lib/observability.ts`
- `src/lib/performance-monitor.ts`
- `src/lib/statement-detect.ts`
- `src/tests/test-framework.ts`
- `src/tests/format.test.ts`
- `src/tests/statement-detect.test.ts`
- `src/tests/statement-normalize.test.ts`
- `src/tests/query-keys.test.ts`
- `src/tests/finance-math.test.ts`
- `src/tests/observability.test.ts`
- `src/tests/test-runner.ts`
- `src/integrations/supabase/client.ts`
- `src/integrations/supabase/client.server.ts`
- `src/integrations/supabase/auth-middleware.ts`
- `src/routes/_authenticated/route.tsx`
- `src/routes/auth.tsx`
- `src/routes/__root.tsx`
- `src/start.ts`
- `vite.config.ts`
- `package.json`
- `CHANGES.md`

## 2026-08-24

- Fixed app boot issue where `src/App.tsx` was returning an empty container by properly wiring `RouterProvider` with `getRouter()` and enabling dual client-SPA/SSR document mounting in `src/routes/__root.tsx`
- Cleaned up leftover `temp_repo` and `speedy-finance-friend-dev1` temporary directories for a clean workspace structure
- `src/App.tsx`
- `src/routes/__root.tsx`
- `index.html`
- `src/main.tsx`
- `src/start.ts`
- `src/server.ts`
- `src/lib/error-capture.ts`
- `vite.config.ts`
- `CHANGES.md`
- Fixed `Invalid hook call / Cannot read properties of null (reading 'useSyncExternalStore')` by configuring explicit path aliases for `react`, `react-dom`, `react/jsx-runtime` and bundling `@tanstack/react-router` & `@tanstack/react-store` in `optimizeDeps.include` while strictly keeping only server-side TanStack Start packages in `optimizeDeps.exclude`
- `vite.config.ts`
- `CHANGES.md`
- Fixed `AsyncLocalStorage is not a constructor` error by excluding `@tanstack/react-start` and `@tanstack/react-router` in `optimizeDeps.exclude` in `vite.config.ts`, preventing Node server modules from being bundled into client dependency optimization
- `vite.config.ts`
- Fixed bank statement import popup close button by removing blocked window.confirm call, adding right-padding to header stepper, and setting explicit z-50 on dialog close button
- `vite.config.ts`
- Fixed `dashboards.find is not a function` error by adding robust array validation and fallback handlers to `listDashboards`, index route, and dashboard builder component
- `src/lib/dashboards.functions.ts`
- `src/routes/_authenticated/index.tsx`
- `src/components/dashboard-builder.tsx`
- `src/components/ui/dialog.tsx`
- `src/components/statement-import-dialog.tsx`
- Fixed SSR `HTTPError` / `forwardRef is not a function` by wiring TanStack Start router and start entry hooks in `src/server.ts`, normalizing React resolution aliases in `vite.config.ts`, and establishing robust SSR request routing
- `src/server.ts`
- `vite.config.ts`
- Fixed `Invalid hook call / Cannot read properties of null (reading 'useState')` in RootComponent by resolving QueryClient context directly from router options without extra state hook overhead
- `src/routes/__root.tsx`
- `CHANGES.md`
