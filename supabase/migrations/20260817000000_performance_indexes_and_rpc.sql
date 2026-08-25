-- Performance Indexes and Stored Procedures for Scalability (1M+ transactions, 5k+ categories)
-- Migration: 20260817000000_performance_indexes_and_rpc.sql

-- 1. High-Performance Composite & Partial Indexes
CREATE INDEX IF NOT EXISTS idx_transactions_household_category 
  ON public.transactions (household_id, category_id) 
  WHERE category_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_household_date_id 
  ON public.transactions (household_id, txn_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_categories_household_parent_sort 
  ON public.categories (household_id, parent_id, sort_order, name, id);

CREATE INDEX IF NOT EXISTS idx_transactions_account_date 
  ON public.transactions (account_id, txn_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_transfer_account_date 
  ON public.transactions (transfer_account_id, txn_date DESC, id DESC) 
  WHERE transfer_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_household_type_date 
  ON public.transactions (household_id, type, txn_date DESC);

-- 2. Fast Database-Side Account Balance Recomputation
CREATE OR REPLACE FUNCTION public.recompute_account_balance(
  p_household_id UUID,
  p_account_id UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opening NUMERIC;
  v_balance NUMERIC;
BEGIN
  SELECT COALESCE(opening_balance, 0) INTO v_opening
  FROM public.accounts
  WHERE id = p_account_id AND household_id = p_household_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  SELECT v_opening + COALESCE(SUM(
    CASE
      WHEN type = 'income' AND account_id = p_account_id THEN amount
      WHEN type = 'expense' AND account_id = p_account_id THEN -amount
      WHEN type = 'transfer' AND account_id = p_account_id THEN -amount
      WHEN type = 'transfer' AND transfer_account_id = p_account_id THEN amount
      ELSE 0
    END
  ), 0) INTO v_balance
  FROM public.transactions
  WHERE household_id = p_household_id
    AND (account_id = p_account_id OR transfer_account_id = p_account_id);

  UPDATE public.accounts
  SET current_balance = v_balance, updated_at = now()
  WHERE id = p_account_id AND household_id = p_household_id;

  RETURN v_balance;
END;
$$;

-- 3. Fast Database-Side Category Tree with Usage & Child Counts
CREATE OR REPLACE FUNCTION public.get_categories_with_usage(
  p_household_id UUID,
  p_parent_id UUID DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_scope TEXT DEFAULT NULL,
  p_kind TEXT DEFAULT NULL,
  p_include_hidden BOOLEAN DEFAULT TRUE
)
RETURNS TABLE (
  id UUID,
  household_id UUID,
  name TEXT,
  kind TEXT,
  scope TEXT,
  parent_id UUID,
  icon TEXT,
  color TEXT,
  description TEXT,
  group_label TEXT,
  tax_code TEXT,
  is_hidden BOOLEAN,
  is_system BOOLEAN,
  sort_order INT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  usage_count BIGINT,
  child_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH tx_counts AS (
    SELECT t.category_id, COUNT(*)::BIGINT AS count
    FROM public.transactions t
    WHERE t.household_id = p_household_id AND t.category_id IS NOT NULL
    GROUP BY t.category_id
  ),
  child_counts AS (
    SELECT c_sub.parent_id, COUNT(*)::BIGINT AS count
    FROM public.categories c_sub
    WHERE c_sub.household_id = p_household_id AND c_sub.parent_id IS NOT NULL
    GROUP BY c_sub.parent_id
  )
  SELECT
    c.id,
    c.household_id,
    c.name,
    c.kind,
    c.scope,
    c.parent_id,
    c.icon,
    c.color,
    c.description,
    c.group_label,
    c.tax_code,
    c.is_hidden,
    c.is_system,
    c.sort_order,
    c.created_at,
    c.updated_at,
    COALESCE(tc.count, 0)::BIGINT AS usage_count,
    COALESCE(cc.count, 0)::BIGINT AS child_count
  FROM public.categories c
  LEFT JOIN tx_counts tc ON tc.category_id = c.id
  LEFT JOIN child_counts cc ON cc.parent_id = c.id
  WHERE c.household_id = p_household_id
    AND (p_include_hidden OR NOT c.is_hidden)
    AND (p_scope IS NULL OR c.scope = p_scope)
    AND (p_kind IS NULL OR c.kind = p_kind)
    AND (p_parent_id IS NULL OR c.parent_id = p_parent_id)
    AND (
      p_search IS NULL 
      OR c.name ILIKE '%' || p_search || '%' 
      OR (c.description IS NOT NULL AND c.description ILIKE '%' || p_search || '%')
    )
  ORDER BY c.sort_order ASC, c.name ASC, c.id ASC;
END;
$$;

-- 4. Fast Dashboard Cash Flow & Spend Aggregations
CREATE OR REPLACE FUNCTION public.get_dashboard_cashflow(
  p_household_id UUID,
  p_start_date DATE
)
RETURNS TABLE (
  month_str TEXT,
  total_income NUMERIC,
  total_expense NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    TO_CHAR(txn_date, 'YYYY-MM') AS month_str,
    COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS total_income,
    COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS total_expense
  FROM public.transactions
  WHERE household_id = p_household_id
    AND txn_date >= p_start_date
  GROUP BY TO_CHAR(txn_date, 'YYYY-MM')
  ORDER BY month_str ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_top_spend(
  p_household_id UUID,
  p_start_date DATE,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  category_name TEXT,
  total_amount NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(c.name, 'Uncategorized') AS category_name,
    SUM(t.amount) AS total_amount
  FROM public.transactions t
  LEFT JOIN public.categories c ON c.id = t.category_id
  WHERE t.household_id = p_household_id
    AND t.type = 'expense'
    AND t.txn_date >= p_start_date
  GROUP BY COALESCE(c.name, 'Uncategorized')
  ORDER BY total_amount DESC
  LIMIT p_limit;
END;
$$;
