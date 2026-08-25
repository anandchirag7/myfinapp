-- Investments (Phase 3): enrich holdings + holding_transactions, make price_history writable and
-- household-scoped for manual NAV updates, and add tenant-guarded FIFO recompute RPCs.
-- Migration: 20260825000000_investments_phase3.sql
--
-- This migration is IDEMPOTENT and may be re-applied: every DDL statement uses
-- ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS / DROP ... IF EXISTS before CREATE /
-- CREATE OR REPLACE FUNCTION, or is wrapped in a catalog-guarded DO block.

-- =========================================
-- 1. HOLDINGS - enrichment
-- =========================================

-- household_id is DENORMALISED from accounts.household_id. The portfolio page needs to read every
-- holding for a household in one query without joining through accounts; the join was the hot path.
-- It stays nullable at the column level so re-applying on live data can never fail, and a trigger
-- (section 1c) keeps it authoritative.
ALTER TABLE public.holdings
  ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES public.households(id) ON DELETE CASCADE;

-- asset_class is intentionally a plain TEXT with a permissive default and NO CHECK constraint:
-- existing rows stay valid, and new Indian asset classes (sgb, nsc, kvp, ssy, scss, elss, reit,
-- chit_fund, ...) can be added in application code without another migration.
ALTER TABLE public.holdings
  ADD COLUMN IF NOT EXISTS asset_class TEXT NOT NULL DEFAULT 'other';

ALTER TABLE public.holdings ADD COLUMN IF NOT EXISTS isin TEXT;
ALTER TABLE public.holdings ADD COLUMN IF NOT EXISTS folio_number TEXT;
ALTER TABLE public.holdings ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR';

-- units_label drives the UI's unit language: 'units' for mutual funds, 'shares' for stocks,
-- 'grams' for gold, 'bonds' for SGB / post-office certificates.
ALTER TABLE public.holdings ADD COLUMN IF NOT EXISTS units_label TEXT;

ALTER TABLE public.holdings ADD COLUMN IF NOT EXISTS sector TEXT;
ALTER TABLE public.holdings ADD COLUMN IF NOT EXISTS target_allocation_pct NUMERIC(6,2);
ALTER TABLE public.holdings ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.holdings ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.holdings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- price_updated_at records when a human last entered a NAV/price. Manual entry is the ONLY price
-- source in this app, so the UI surfaces staleness from this column.
ALTER TABLE public.holdings ADD COLUMN IF NOT EXISTS price_updated_at TIMESTAMPTZ;

-- 1a. Backfill household_id from the owning account. Re-runnable: only touches NULL rows.
UPDATE public.holdings h
SET household_id = a.household_id
FROM public.accounts a
WHERE a.id = h.account_id
  AND h.household_id IS NULL;

-- 1b. RLS: replace "holdings access".
--
-- Reasoning, spelled out because getting this wrong leaks another household's portfolio:
--   * USING accepts a row when EITHER the original account-join check passes OR
--     has_household_access(household_id) is true. The OR is required because household_id is a NEW
--     nullable column: rows written before this migration (or by a client that omits it) must stay
--     readable via the account join, while household_id-only queries must stay readable too.
--   * WITH CHECK deliberately does NOT include the household_id branch. If it did, a caller could
--     INSERT a holding into someone else's account_id while spoofing their OWN household_id and the
--     row would be accepted. Requiring the account-join check on write means the caller must
--     actually have access to the target account. The section 1c trigger then overwrites
--     household_id with the account's real household, so a spoofed value cannot survive.
DROP POLICY IF EXISTS "holdings access" ON public.holdings;
CREATE POLICY "holdings access" ON public.holdings FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = holdings.account_id AND public.has_household_access(a.household_id)
    )
    OR (holdings.household_id IS NOT NULL AND public.has_household_access(holdings.household_id))
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = holdings.account_id AND public.has_household_access(a.household_id)
    )
  );

-- 1c. Keep the denormalised household_id honest. accounts.household_id is the single source of
-- truth; this trigger derives it on INSERT and whenever account_id/household_id is touched, so the
-- column can never drift and cannot be spoofed. SECURITY DEFINER so the lookup is not itself
-- filtered by RLS on accounts (the WITH CHECK policy above already proved caller access).
CREATE OR REPLACE FUNCTION public.holdings_sync_household_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT a.household_id INTO NEW.household_id
  FROM public.accounts a
  WHERE a.id = NEW.account_id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.holdings_sync_household_id() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_holdings_household_id ON public.holdings;
CREATE TRIGGER trg_holdings_household_id
  BEFORE INSERT OR UPDATE OF account_id, household_id ON public.holdings
  FOR EACH ROW EXECUTE FUNCTION public.holdings_sync_household_id();

-- 1d. Indexes. One holding per (account, symbol) is the invariant that makes bulk price updates and
-- CSV-style imports upsertable. Wrapped in a DO block so a re-apply against pre-existing duplicate
-- rows warns the operator instead of aborting the whole migration.
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS holdings_account_symbol_uidx
    ON public.holdings (account_id, symbol);
EXCEPTION
  WHEN unique_violation THEN
    RAISE WARNING 'holdings_account_symbol_uidx not created: duplicate (account_id, symbol) rows exist. Merge them, then re-run this migration.';
END $$;

CREATE INDEX IF NOT EXISTS holdings_household_idx ON public.holdings (household_id);
CREATE INDEX IF NOT EXISTS holdings_account_idx ON public.holdings (account_id);

-- =========================================
-- 2. HOLDING_TRANSACTIONS - enrichment
-- =========================================

-- fees = brokerage + STT + stamp duty + GST. Added to cost on buys, subtracted from proceeds on
-- sells, so realized/unrealized P&L is net of transaction costs.
ALTER TABLE public.holding_transactions
  ADD COLUMN IF NOT EXISTS fees NUMERIC(18,2) NOT NULL DEFAULT 0;

-- amount = explicit cash leg. For dividend / interest rows quantity is 0 and the whole event lives
-- in amount; for buy/sell it is redundant with quantity * price but records what actually hit the bank.
ALTER TABLE public.holding_transactions ADD COLUMN IF NOT EXISTS amount NUMERIC(18,2);

ALTER TABLE public.holding_transactions ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.holding_transactions
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Named CHECK on kind, added only when absent (catalog lookup) so re-applying is safe. If legacy
-- rows carry a kind outside the list the ADD would raise check_violation - we downgrade that to a
-- WARNING rather than failing the migration.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'holding_transactions'
      AND c.conname = 'holding_transactions_kind_check'
  ) THEN
    BEGIN
      ALTER TABLE public.holding_transactions
        ADD CONSTRAINT holding_transactions_kind_check
        CHECK (kind IN (
          'buy', 'sell', 'sip', 'dividend', 'bonus',
          'split', 'interest', 'contribution', 'withdrawal'
        ));
    EXCEPTION
      WHEN check_violation THEN
        RAISE WARNING 'holding_transactions_kind_check not added: existing rows have an unsupported kind. Clean them up, then re-run this migration.';
    END;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS holding_transactions_holding_date_idx
  ON public.holding_transactions (holding_id, txn_date);

-- =========================================
-- 3. PRICE_HISTORY - writable + household-scoped
-- =========================================

-- Manual NAV updates are per-household data, but this table shipped as a global, SELECT-only cache.
-- household_id NULL keeps meaning "global/shared price" (nothing but service_role can write those
-- now); a non-NULL household_id is a price a member typed in for their own portfolio.
ALTER TABLE public.price_history
  ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.price_history
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE public.price_history
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 3a. Drop the old global UNIQUE(symbol, price_date). It was declared inline so Postgres auto-named
-- it; resolve the real name from pg_constraint by matching the column set instead of trusting the
-- conventional name.
DO $$
DECLARE
  v_conname TEXT;
BEGIN
  FOR v_conname IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'price_history'
      AND c.contype = 'u'
      AND (
        -- attname is `name`, so cast to text before comparing against a text[] literal.
        SELECT array_agg(a.attname::text ORDER BY a.attname::text)
        FROM unnest(c.conkey) AS k(attnum)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
      ) = ARRAY['price_date', 'symbol']::text[]
  LOOP
    EXECUTE format('ALTER TABLE public.price_history DROP CONSTRAINT %I', v_conname);
  END LOOP;
END $$;

-- Belt and braces for the conventional auto-generated name.
ALTER TABLE public.price_history DROP CONSTRAINT IF EXISTS price_history_symbol_price_date_key;

-- 3b. New scoped uniqueness. NULLS NOT DISTINCT (Postgres 15+, which Supabase runs) is what makes
-- this work: without it every global row would have a NULL household_id, NULLs would all compare as
-- distinct, and the index would silently permit unlimited duplicate global (symbol, price_date)
-- rows. With it, one global row and one row per household can coexist for the same symbol/date, and
-- the app can upsert with ON CONFLICT (household_id, symbol, price_date).
CREATE UNIQUE INDEX IF NOT EXISTS price_history_scope_uidx
  ON public.price_history (household_id, symbol, price_date) NULLS NOT DISTINCT;

-- Latest-price-per-symbol lookups for a household.
CREATE INDEX IF NOT EXISTS price_history_household_symbol_date_idx
  ON public.price_history (household_id, symbol, price_date DESC);

-- 3c. The table was GRANT SELECT only; manual NAV entry needs write access.
GRANT INSERT, UPDATE, DELETE ON public.price_history TO authenticated;

-- 3d. RLS: read global + own household; write ONLY own household. Every write policy requires
-- household_id IS NOT NULL AND has_household_access(household_id), which means no authenticated
-- caller can create, edit or delete a global (household_id IS NULL) row - those stay service_role
-- only. UPDATE carries both USING and WITH CHECK so a row cannot be moved into another household.
DROP POLICY IF EXISTS "price history read" ON public.price_history;
CREATE POLICY "price history read" ON public.price_history FOR SELECT TO authenticated
  USING (household_id IS NULL OR public.has_household_access(household_id));

DROP POLICY IF EXISTS "price history insert" ON public.price_history;
CREATE POLICY "price history insert" ON public.price_history FOR INSERT TO authenticated
  WITH CHECK (household_id IS NOT NULL AND public.has_household_access(household_id));

DROP POLICY IF EXISTS "price history update" ON public.price_history;
CREATE POLICY "price history update" ON public.price_history FOR UPDATE TO authenticated
  USING (household_id IS NOT NULL AND public.has_household_access(household_id))
  WITH CHECK (household_id IS NOT NULL AND public.has_household_access(household_id));

DROP POLICY IF EXISTS "price history delete" ON public.price_history;
CREATE POLICY "price history delete" ON public.price_history FOR DELETE TO authenticated
  USING (household_id IS NOT NULL AND public.has_household_access(household_id));

-- =========================================
-- 4. RPC - FIFO recompute of a single holding
-- =========================================

-- Recomputes holdings.quantity and holdings.avg_price from the holding_transactions ledger using
-- FIFO lot matching, with fees capitalised into cost.
--
-- SECURITY: this is SECURITY DEFINER, so it runs with the table owner's rights and RLS does NOT
-- protect it. The tenant check below is therefore mandatory, not decorative - resolve the holding's
-- account -> household_id and refuse unless the caller is a member of that household. (Several
-- earlier RPCs in this repo take p_household_id from the caller and never verify it; do not copy
-- that pattern.)
CREATE OR REPLACE FUNCTION public.recompute_holding(p_holding_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_household_id UUID;

  -- Open FIFO lots as two parallel arrays: remaining quantity, and cost per unit (fees included).
  -- v_head is the index of the oldest lot that still has quantity left - everything before it is
  -- fully consumed, which is exactly FIFO.
  v_lot_qty   NUMERIC[] := ARRAY[]::NUMERIC[];
  v_lot_cost  NUMERIC[] := ARRAY[]::NUMERIC[];
  v_head      INT := 1;
  v_len       INT;
  v_i         INT;

  v_qty       NUMERIC;
  v_price     NUMERIC;
  v_fees      NUMERIC;
  v_ratio     NUMERIC;
  v_remaining NUMERIC;

  -- Sell/withdrawal quantity that had no lot left to match. Kept as a signal instead of being
  -- clamped away, so a data-entry error surfaces as a negative net quantity in the UI.
  v_short     NUMERIC := 0;

  v_total_qty  NUMERIC := 0;
  v_total_cost NUMERIC := 0;
  v_avg        NUMERIC := 0;

  -- Explicit cursor over the ledger in chronological order. id is a final tiebreaker so two rows
  -- with the same txn_date and created_at always replay in a stable order.
  c_txn CURSOR FOR
    SELECT
      ht.kind,
      COALESCE(ht.quantity, 0) AS quantity,
      COALESCE(ht.price, 0)    AS price,
      COALESCE(ht.fees, 0)     AS fees
    FROM public.holding_transactions ht
    WHERE ht.holding_id = p_holding_id
    ORDER BY ht.txn_date ASC, ht.created_at ASC, ht.id ASC;
  v_txn RECORD;
BEGIN
  -- ---- Tenant guard (see SECURITY note above) ----
  SELECT a.household_id INTO v_household_id
  FROM public.holdings h
  JOIN public.accounts a ON a.id = h.account_id
  WHERE h.id = p_holding_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Holding not found';
  END IF;

  IF v_household_id IS NULL OR NOT public.has_household_access(v_household_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- ---- Replay the ledger ----
  FOR v_txn IN c_txn LOOP
    v_qty   := v_txn.quantity;
    v_price := v_txn.price;
    v_fees  := v_txn.fees;

    IF v_txn.kind IN ('buy', 'sip', 'contribution') THEN
      -- Acquisition. Fees are capitalised: cost per unit = (qty * price + fees) / qty.
      -- 'contribution' (PPF / EPF / NPS / RD style inflows) behaves like a buy; schemes without real
      -- units record quantity = rupees and price = 1.
      IF v_qty > 0 THEN
        v_lot_qty  := array_append(v_lot_qty, v_qty);
        v_lot_cost := array_append(v_lot_cost, (v_qty * v_price + v_fees) / v_qty);
      END IF;

    ELSIF v_txn.kind = 'bonus' THEN
      -- Bonus units arrive at zero cost, which drags the FIFO average down.
      IF v_qty > 0 THEN
        v_lot_qty  := array_append(v_lot_qty, v_qty);
        v_lot_cost := array_append(v_lot_cost, 0);
      END IF;

    ELSIF v_txn.kind IN ('sell', 'withdrawal') THEN
      -- Consume oldest lots first; the cost basis of the units that left goes with them. Realized
      -- P&L is computed in application code from this same ledger.
      -- ABS() because disposals are the magnitude of units leaving - a client that records sells as
      -- negative quantities must not be silently ignored here.
      v_remaining := ABS(v_qty);
      v_len := COALESCE(array_length(v_lot_qty, 1), 0);
      WHILE v_remaining > 0 AND v_head <= v_len LOOP
        IF v_lot_qty[v_head] <= v_remaining THEN
          v_remaining := v_remaining - v_lot_qty[v_head];
          v_lot_qty[v_head] := 0;
          v_head := v_head + 1;
        ELSE
          v_lot_qty[v_head] := v_lot_qty[v_head] - v_remaining;
          v_remaining := 0;
        END IF;
      END LOOP;

      IF v_remaining > 0 THEN
        v_short := v_short + v_remaining;
      END IF;

    ELSIF v_txn.kind = 'split' THEN
      -- quantity carries the split ratio multiplier (2 for a 1:2 split, 10 for a face-value split
      -- of 10 -> 1). Every open lot's quantity is multiplied and its cost per unit divided, so the
      -- total cost basis - and therefore realized/unrealized P&L - is unchanged.
      v_ratio := v_qty;
      IF v_ratio > 0 THEN
        v_len := COALESCE(array_length(v_lot_qty, 1), 0);
        FOR v_i IN v_head..v_len LOOP
          v_lot_qty[v_i]  := v_lot_qty[v_i] * v_ratio;
          v_lot_cost[v_i] := v_lot_cost[v_i] / v_ratio;
        END LOOP;
      END IF;

    -- 'dividend' and 'interest' are pure cash events: they never change quantity or cost basis.
    END IF;
  END LOOP;

  -- ---- Aggregate the remaining (unsold) lots ----
  v_len := COALESCE(array_length(v_lot_qty, 1), 0);
  FOR v_i IN v_head..v_len LOOP
    v_total_qty  := v_total_qty + v_lot_qty[v_i];
    v_total_cost := v_total_cost + v_lot_qty[v_i] * v_lot_cost[v_i];
  END LOOP;

  v_total_qty := v_total_qty - v_short;

  IF v_total_qty > 0 THEN
    v_avg := v_total_cost / v_total_qty;
  ELSE
    v_avg := 0;
  END IF;

  UPDATE public.holdings
  SET quantity   = ROUND(v_total_qty, 4),
      avg_price  = ROUND(v_avg, 4),
      updated_at = now()
  WHERE id = p_holding_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recompute_holding(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recompute_holding(UUID) TO authenticated;

-- =========================================
-- 5. RPC - resync an investment account's balance to market value
-- =========================================

-- Manual NAV updates change market value, and net worth reads accounts.current_balance. This keeps
-- the two in sync: current_balance = SUM(quantity * price) over the account's ACTIVE holdings.
-- Same mandatory tenant guard as section 4.
--
-- TWO GUARDS THAT MUST NOT BE REMOVED - both protect user-entered balances from being destroyed:
--
--   1. An account with NO holdings rows is tracked as a plain balance (PPF, EPF, FD, RD, a
--      post-office certificate, a chit fund - every scheme that has no units). SUM() over zero rows
--      is NULL, so a naive COALESCE(...,0) would write 0 and silently wipe a balance the user typed
--      in by hand. Worse, accounts.current_balance feeds net worth directly, so the loss would
--      propagate. We detect the empty case with COUNT(*) and return the existing balance untouched.
--
--   2. A holding whose current_price has never been set (0) falls back to its avg_price, i.e. to
--      cost basis. An unpriced position is worth "what I paid" until a NAV is entered - never zero.
--      NULLIF(current_price, 0) is what selects that fallback.
CREATE OR REPLACE FUNCTION public.recompute_investment_account_balance(p_account_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_household_id UUID;
  v_value NUMERIC;
  v_count INT;
BEGIN
  SELECT a.household_id INTO v_household_id
  FROM public.accounts a
  WHERE a.id = p_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found';
  END IF;

  IF v_household_id IS NULL OR NOT public.has_household_access(v_household_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT
    ROUND(COALESCE(SUM(h.quantity * COALESCE(NULLIF(h.current_price, 0), h.avg_price)), 0), 2),
    COUNT(*)
  INTO v_value, v_count
  FROM public.holdings h
  WHERE h.account_id = p_account_id
    AND COALESCE(h.is_active, true);

  -- Guard 1: no unit-bearing holdings -> this is a manually-tracked balance. Leave it alone.
  IF v_count = 0 THEN
    SELECT a.current_balance INTO v_value FROM public.accounts a WHERE a.id = p_account_id;
    RETURN COALESCE(v_value, 0);
  END IF;

  UPDATE public.accounts
  SET current_balance = v_value,
      updated_at = now()
  WHERE id = p_account_id
    AND household_id = v_household_id;

  RETURN v_value;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recompute_investment_account_balance(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recompute_investment_account_balance(UUID) TO authenticated;

-- =========================================
-- SUMMARY
-- =========================================
-- What changed and why:
--
-- 1. public.holdings gained the metadata the Investments page needs - asset_class, isin,
--    folio_number, currency, units_label ('units' | 'shares' | 'grams'), sector,
--    target_allocation_pct (target-vs-actual drift), notes, is_active, created_at,
--    price_updated_at (NAV staleness) - plus a denormalised household_id so portfolio reads no
--    longer join through accounts. household_id is backfilled, kept authoritative by
--    trg_holdings_household_id, and the "holdings access" policy now reads via EITHER the account
--    join OR household_id while still requiring the account join on write, so a spoofed
--    household_id cannot be used to plant a row in another household's account.
--
-- 2. public.holding_transactions gained fees (capitalised into cost basis), amount (the cash leg,
--    which is the whole event for dividend/interest rows where quantity is 0), notes and created_by,
--    plus a named CHECK restricting kind to the nine supported events.
--
-- 3. public.price_history became writable by authenticated users and household-scoped. The old
--    global UNIQUE(symbol, price_date) is replaced by a NULLS NOT DISTINCT unique index on
--    (household_id, symbol, price_date) so global rows and per-household manual NAVs coexist and
--    upserts work. Write policies require a non-NULL household the caller belongs to, so global
--    rows remain service_role-only.
--
-- 4/5. Two SECURITY DEFINER RPCs, both of which resolve the row's household and refuse with
--    'Forbidden' unless has_household_access() passes - the tenant check the existing performance
--    RPCs in this repo omit. recompute_holding replays the ledger through FIFO lots (fees in cost,
--    bonus at zero cost, split scaling quantity up and cost per unit down, dividend/interest
--    quantity-neutral) and writes back quantity + avg_price of the OPEN lots only.
--    recompute_investment_account_balance pushes market value into accounts.current_balance so net
--    worth stays correct after a manual NAV update.
