-- Lossless statement evidence and economic-event model. Legacy transactions.type
-- remains intact for backward-compatible balance calculations.

CREATE TABLE IF NOT EXISTS public.statement_raw_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  upload_id uuid NOT NULL REFERENCES public.statement_uploads(id) ON DELETE CASCADE,
  import_batch_id uuid,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  source_row_number integer NOT NULL CHECK (source_row_number > 0),
  transaction_date date NOT NULL,
  value_date date,
  narration text NOT NULL CHECK (char_length(narration) BETWEEN 1 AND 4000),
  bank_reference text CHECK (bank_reference IS NULL OR char_length(bank_reference) <= 300),
  direction text NOT NULL CHECK (direction IN ('debit', 'credit')),
  debit numeric(18,2) CHECK (debit IS NULL OR debit > 0),
  credit numeric(18,2) CHECK (credit IS NULL OR credit > 0),
  closing_balance numeric(18,2),
  raw_cells jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(raw_cells) = 'array'),
  source_fingerprint text NOT NULL CHECK (char_length(source_fingerprint) = 64),
  parser_version text NOT NULL CHECK (char_length(parser_version) BETWEEN 1 AND 40),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((direction = 'debit' AND debit IS NOT NULL) OR (direction = 'credit' AND credit IS NOT NULL)),
  UNIQUE (household_id, upload_id, source_fingerprint)
);

CREATE TABLE IF NOT EXISTS public.financial_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'EXPENSE','INCOME','INTERNAL_TRANSFER','CREDIT_CARD_PAYMENT','INVESTMENT',
    'INVESTMENT_REDEMPTION','BROKERAGE_SETTLEMENT','LOAN_PAYMENT','INSURANCE_PAYMENT',
    'REFUND','REVERSAL','INVESTMENT_INCOME','INTEREST_INCOME','CASH_WITHDRAWAL',
    'CASH_DEPOSIT','FEE_OR_CHARGE','TAX','VERIFICATION_TRANSACTION','UNKNOWN'
  )),
  event_date date NOT NULL,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'INR' CHECK (char_length(currency) = 3),
  confidence numeric(5,4) NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
  resolution_status text NOT NULL DEFAULT 'resolved' CHECK (resolution_status IN ('resolved','needs_review','confirmed')),
  classification_source text,
  classification_reasons jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(classification_reasons) = 'array'),
  related_event_id uuid REFERENCES public.financial_events(id) ON DELETE SET NULL,
  interpretation_version text NOT NULL DEFAULT 'financial-events-v1',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.account_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  normalized_alias text NOT NULL CHECK (char_length(normalized_alias) BETWEEN 2 AND 240),
  alias_type text NOT NULL DEFAULT 'narration' CHECK (alias_type IN ('narration','account_hint','vpa','holder_name','bank_reference')),
  confidence numeric(5,4) NOT NULL DEFAULT 1 CHECK (confidence BETWEEN 0 AND 1),
  verified boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, normalized_alias, alias_type)
);

CREATE TABLE IF NOT EXISTS public.financial_entity_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid REFERENCES public.households(id) ON DELETE CASCADE,
  parent_entity_id uuid NOT NULL REFERENCES public.merchant_entities(id) ON DELETE CASCADE,
  child_entity_id uuid NOT NULL REFERENCES public.merchant_entities(id) ON DELETE CASCADE,
  relationship_type text NOT NULL CHECK (relationship_type IN ('family_member','payment_processor','servicer')),
  confidence numeric(5,4) NOT NULL DEFAULT 1 CHECK (confidence BETWEEN 0 AND 1),
  verified boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (parent_entity_id <> child_entity_id),
  UNIQUE NULLS NOT DISTINCT (household_id, parent_entity_id, child_entity_id, relationship_type)
);

CREATE TABLE IF NOT EXISTS public.statement_economic_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  normalized_pattern text NOT NULL CHECK (char_length(normalized_pattern) BETWEEN 1 AND 240),
  direction text NOT NULL CHECK (direction IN ('debit','credit')),
  economic_type text NOT NULL CHECK (economic_type IN (
    'EXPENSE','INCOME','INTERNAL_TRANSFER','CREDIT_CARD_PAYMENT','INVESTMENT',
    'INVESTMENT_REDEMPTION','BROKERAGE_SETTLEMENT','LOAN_PAYMENT','INSURANCE_PAYMENT',
    'REFUND','REVERSAL','INVESTMENT_INCOME','INTEREST_INCOME','CASH_WITHDRAWAL',
    'CASH_DEPOSIT','FEE_OR_CHARGE','TAX','VERIFICATION_TRANSACTION','UNKNOWN'
  )),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, normalized_pattern, direction)
);

CREATE TABLE IF NOT EXISTS public.statement_correction_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  import_batch_id uuid,
  normalized_pattern text NOT NULL CHECK (char_length(normalized_pattern) BETWEEN 1 AND 240),
  direction text NOT NULL CHECK (direction IN ('debit','credit')),
  economic_type text NOT NULL,
  apply_scope text NOT NULL CHECK (apply_scope IN ('transaction','future','existing_future')),
  affected_count integer NOT NULL DEFAULT 0 CHECK (affected_count >= 0),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recurring_mandates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  candidate_key text NOT NULL CHECK (char_length(candidate_key) BETWEEN 3 AND 500),
  entity_id uuid REFERENCES public.merchant_entities(id) ON DELETE SET NULL,
  provider_key text NOT NULL CHECK (char_length(provider_key) BETWEEN 1 AND 240),
  mandate_reference text CHECK (mandate_reference IS NULL OR char_length(mandate_reference) <= 300),
  expected_amount numeric(18,2) NOT NULL CHECK (expected_amount > 0),
  amount_tolerance numeric(18,2) NOT NULL DEFAULT 0 CHECK (amount_tolerance >= 0),
  cadence text NOT NULL DEFAULT 'monthly' CHECK (cadence IN ('weekly','monthly','quarterly','half_yearly','yearly','irregular')),
  expected_day smallint CHECK (expected_day IS NULL OR expected_day BETWEEN 1 AND 31),
  window_days smallint NOT NULL DEFAULT 3 CHECK (window_days BETWEEN 0 AND 15),
  economic_type text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('candidate','active','paused','ended')),
  observation_count integer NOT NULL DEFAULT 1 CHECK (observation_count > 0),
  first_observed_on date,
  last_observed_on date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, account_id, candidate_key),
  UNIQUE NULLS NOT DISTINCT (household_id, account_id, provider_key, mandate_reference, expected_amount)
);

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS raw_transaction_id uuid REFERENCES public.statement_raw_transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS economic_type text NOT NULL DEFAULT 'UNKNOWN' CHECK (economic_type IN (
    'EXPENSE','INCOME','INTERNAL_TRANSFER','CREDIT_CARD_PAYMENT','INVESTMENT',
    'INVESTMENT_REDEMPTION','BROKERAGE_SETTLEMENT','LOAN_PAYMENT','INSURANCE_PAYMENT',
    'REFUND','REVERSAL','INVESTMENT_INCOME','INTEREST_INCOME','CASH_WITHDRAWAL',
    'CASH_DEPOSIT','FEE_OR_CHARGE','TAX','VERIFICATION_TRANSACTION','UNKNOWN'
  )),
  ADD COLUMN IF NOT EXISTS statement_direction text CHECK (statement_direction IN ('debit','credit')),
  ADD COLUMN IF NOT EXISTS value_date date,
  ADD COLUMN IF NOT EXISTS original_reference text,
  ADD COLUMN IF NOT EXISTS payment_rail text,
  ADD COLUMN IF NOT EXISTS canonical_entity_id uuid REFERENCES public.merchant_entities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS processor_entity_id uuid REFERENCES public.merchant_entities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recurring_mandate_id uuid REFERENCES public.recurring_mandates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS classification_confidence numeric(5,4) CHECK (classification_confidence IS NULL OR classification_confidence BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS classification_source text,
  ADD COLUMN IF NOT EXISTS classification_reasons jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(classification_reasons) = 'array'),
  ADD COLUMN IF NOT EXISTS source_fingerprint text,
  ADD COLUMN IF NOT EXISTS interpretation_version text NOT NULL DEFAULT 'legacy';

CREATE TABLE IF NOT EXISTS public.financial_event_transactions (
  event_id uuid NOT NULL REFERENCES public.financial_events(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('posting','source','target','original','reversal','refund','settlement','payment')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, transaction_id, role)
);

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS financial_event_id uuid REFERENCES public.financial_events(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.transaction_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  match_type text NOT NULL CHECK (match_type IN ('duplicate','reversal','refund','internal_transfer')),
  source_raw_transaction_id uuid REFERENCES public.statement_raw_transactions(id) ON DELETE CASCADE,
  source_transaction_id uuid REFERENCES public.transactions(id) ON DELETE CASCADE,
  target_transaction_id uuid REFERENCES public.transactions(id) ON DELETE CASCADE,
  score numeric(5,4) NOT NULL CHECK (score BETWEEN 0 AND 1),
  signals jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(signals) = 'object'),
  decision text NOT NULL DEFAULT 'candidate' CHECK (decision IN ('candidate','accepted','rejected','ambiguous')),
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_raw_transaction_id IS NOT NULL OR source_transaction_id IS NOT NULL),
  CHECK (target_transaction_id IS NULL OR source_transaction_id IS NULL OR target_transaction_id <> source_transaction_id)
);

CREATE TABLE IF NOT EXISTS public.statement_review_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  upload_id uuid NOT NULL REFERENCES public.statement_uploads(id) ON DELETE CASCADE,
  review_type text NOT NULL CHECK (review_type IN ('economic_type','internal_transfer','destination_card','income_kind','entity','duplicate','ledger_balance')),
  group_key text NOT NULL CHECK (char_length(group_key) BETWEEN 1 AND 300),
  priority smallint NOT NULL DEFAULT 50 CHECK (priority BETWEEN 0 AND 100),
  affected_raw_transaction_ids uuid[] NOT NULL DEFAULT '{}',
  prompt text NOT NULL CHECK (char_length(prompt) BETWEEN 1 AND 1000),
  options jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(options) = 'array'),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','dismissed')),
  answer jsonb,
  answered_by uuid,
  answered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, upload_id, review_type, group_key)
);

ALTER TABLE public.statement_raw_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_event_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.statement_economic_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.statement_correction_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_entity_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_mandates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.statement_review_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY statement_raw_transactions_access ON public.statement_raw_transactions
    FOR ALL TO authenticated USING (public.has_household_access(household_id))
    WITH CHECK (public.has_household_access(household_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY financial_events_access ON public.financial_events
    FOR ALL TO authenticated USING (public.has_household_access(household_id))
    WITH CHECK (public.has_household_access(household_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY financial_event_transactions_access ON public.financial_event_transactions
    FOR ALL TO authenticated USING (public.has_household_access(household_id))
    WITH CHECK (public.has_household_access(household_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY account_aliases_access ON public.account_aliases
    FOR ALL TO authenticated USING (public.has_household_access(household_id))
    WITH CHECK (public.has_household_access(household_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY statement_economic_rules_access ON public.statement_economic_rules
    FOR ALL TO authenticated USING (public.has_household_access(household_id))
    WITH CHECK (public.has_household_access(household_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY statement_correction_audit_access ON public.statement_correction_audit
    FOR ALL TO authenticated USING (public.has_household_access(household_id))
    WITH CHECK (public.has_household_access(household_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY financial_entity_relationships_read ON public.financial_entity_relationships
    FOR SELECT TO authenticated
    USING (household_id IS NULL OR public.has_household_access(household_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY financial_entity_relationships_write ON public.financial_entity_relationships
    FOR ALL TO authenticated
    USING (household_id IS NOT NULL AND public.has_household_access(household_id))
    WITH CHECK (household_id IS NOT NULL AND public.has_household_access(household_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY recurring_mandates_access ON public.recurring_mandates
    FOR ALL TO authenticated USING (public.has_household_access(household_id))
    WITH CHECK (public.has_household_access(household_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY transaction_matches_access ON public.transaction_matches
    FOR ALL TO authenticated USING (public.has_household_access(household_id))
    WITH CHECK (public.has_household_access(household_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY statement_review_items_access ON public.statement_review_items
    FOR ALL TO authenticated USING (public.has_household_access(household_id))
    WITH CHECK (public.has_household_access(household_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT SELECT, INSERT, DELETE ON public.statement_raw_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_events, public.financial_event_transactions,
  public.account_aliases, public.statement_economic_rules, public.statement_correction_audit,
  public.recurring_mandates, public.transaction_matches, public.statement_review_items TO authenticated;
GRANT ALL ON public.statement_raw_transactions, public.financial_events, public.financial_event_transactions,
  public.account_aliases, public.statement_economic_rules, public.statement_correction_audit,
  public.financial_entity_relationships, public.recurring_mandates, public.transaction_matches,
  public.statement_review_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_entity_relationships TO authenticated;

CREATE INDEX IF NOT EXISTS idx_statement_raw_upload_row ON public.statement_raw_transactions(upload_id, source_row_number);
CREATE INDEX IF NOT EXISTS idx_statement_raw_account_date ON public.statement_raw_transactions(household_id, account_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_statement_raw_reference ON public.statement_raw_transactions(household_id, bank_reference) WHERE bank_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_financial_events_household_date ON public.financial_events(household_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_financial_events_type_date ON public.financial_events(household_id, event_type, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_event_transactions_transaction ON public.financial_event_transactions(transaction_id);
CREATE INDEX IF NOT EXISTS idx_account_alias_lookup ON public.account_aliases(household_id, normalized_alias, alias_type);
CREATE INDEX IF NOT EXISTS idx_statement_economic_rule_lookup ON public.statement_economic_rules(household_id, normalized_pattern, direction);
CREATE INDEX IF NOT EXISTS idx_statement_correction_audit_household ON public.statement_correction_audit(household_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_entity_relationship_child ON public.financial_entity_relationships(child_entity_id, relationship_type);
CREATE INDEX IF NOT EXISTS idx_recurring_mandate_lookup ON public.recurring_mandates(household_id, account_id, provider_key, expected_amount);
CREATE INDEX IF NOT EXISTS idx_transaction_matches_source ON public.transaction_matches(household_id, source_raw_transaction_id, match_type);
CREATE INDEX IF NOT EXISTS idx_statement_review_open ON public.statement_review_items(household_id, upload_id, priority DESC) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_transactions_economic_date ON public.transactions(household_id, economic_type, txn_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_source_fingerprint ON public.transactions(household_id, source_fingerprint) WHERE source_fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_raw ON public.transactions(raw_transaction_id) WHERE raw_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_event ON public.transactions(financial_event_id) WHERE financial_event_id IS NOT NULL;

-- Seed only durable, high-confidence global financial identities. Purpose and
-- category are intentionally not encoded in these entity rows.
INSERT INTO public.merchant_entities (canonical_name, kind, verified)
SELECT seed.name, 'business'::public.merchant_entity_kind, true
FROM (VALUES
  ('ZERODHA'), ('INDIAN CLEARING CORPORATION'), ('INDMONEY'),
  ('FINZOOMERS SERVICES'), ('CRED'), ('RAZORPAY'), ('PAYU'),
  ('HDFC BANK'), ('HDFC BANK RACPC'), ('TATA AIA LIFE')
) AS seed(name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.merchant_entities existing
  WHERE existing.household_id IS NULL AND existing.canonical_name = seed.name
);

INSERT INTO public.financial_entity_relationships (
  household_id, parent_entity_id, child_entity_id, relationship_type, confidence, verified
)
SELECT NULL, parent.id, child.id, seed.relationship_type, 1, true
FROM (VALUES
  ('ZERODHA', 'INDIAN CLEARING CORPORATION', 'family_member'),
  ('INDMONEY', 'FINZOOMERS SERVICES', 'family_member'),
  ('HDFC BANK', 'HDFC BANK RACPC', 'servicer')
) AS seed(parent_name, child_name, relationship_type)
JOIN public.merchant_entities parent
  ON parent.household_id IS NULL AND parent.canonical_name = seed.parent_name
JOIN public.merchant_entities child
  ON child.household_id IS NULL AND child.canonical_name = seed.child_name
ON CONFLICT DO NOTHING;

-- Existing rows receive a conservative, backward-compatible initial meaning.
UPDATE public.transactions
SET economic_type = CASE
  WHEN type = 'transfer' THEN 'INTERNAL_TRANSFER'
  WHEN type = 'income' THEN 'INCOME'
  WHEN type = 'expense' THEN 'EXPENSE'
  ELSE 'UNKNOWN'
END,
statement_direction = CASE
  WHEN type = 'income' THEN 'credit'
  WHEN type = 'expense' THEN 'debit'
  ELSE statement_direction
END,
interpretation_version = 'legacy-backfill-v1'
WHERE interpretation_version = 'legacy';

-- Every new normalized posting immediately receives an economic event. Later
-- matchers may merge members into a shared transfer/refund/reversal event.
CREATE OR REPLACE FUNCTION public.sync_transaction_financial_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
  v_event_type text;
  v_direction text;
BEGIN
  v_event_type := COALESCE(NEW.economic_type, 'UNKNOWN');
  v_direction := COALESCE(
    NEW.statement_direction,
    CASE WHEN NEW.type = 'income' THEN 'credit' WHEN NEW.type = 'expense' THEN 'debit' ELSE NULL END
  );

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.financial_events (
      household_id, event_type, event_date, amount, currency, confidence,
      resolution_status, classification_source, classification_reasons,
      interpretation_version, created_by
    ) VALUES (
      NEW.household_id, v_event_type, NEW.txn_date, abs(NEW.amount), 'INR',
      COALESCE(NEW.classification_confidence, 0),
      CASE WHEN v_event_type = 'UNKNOWN' THEN 'needs_review' ELSE 'resolved' END,
      NEW.classification_source, COALESCE(NEW.classification_reasons, '[]'::jsonb),
      COALESCE(NEW.interpretation_version, 'financial-events-v1'), NEW.created_by
    ) RETURNING id INTO v_event_id;

    INSERT INTO public.financial_event_transactions (event_id, transaction_id, household_id, role)
    VALUES (v_event_id, NEW.id, NEW.household_id, 'posting');

    UPDATE public.transactions SET financial_event_id = v_event_id WHERE id = NEW.id;
    NEW.financial_event_id := v_event_id;
    RETURN NEW;
  END IF;

  IF NEW.financial_event_id IS NOT NULL THEN
    UPDATE public.financial_events
    SET event_type = v_event_type,
        event_date = NEW.txn_date,
        amount = abs(NEW.amount),
        confidence = COALESCE(NEW.classification_confidence, 0),
        resolution_status = CASE WHEN v_event_type = 'UNKNOWN' THEN 'needs_review' ELSE 'resolved' END,
        classification_source = NEW.classification_source,
        classification_reasons = COALESCE(NEW.classification_reasons, '[]'::jsonb),
        interpretation_version = COALESCE(NEW.interpretation_version, 'financial-events-v1'),
        updated_at = now()
    WHERE id = NEW.financial_event_id AND household_id = NEW.household_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_transaction_financial_event_insert ON public.transactions;
CREATE TRIGGER trg_transaction_financial_event_insert
AFTER INSERT ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.sync_transaction_financial_event();

DROP TRIGGER IF EXISTS trg_transaction_financial_event_update ON public.transactions;
CREATE TRIGGER trg_transaction_financial_event_update
AFTER UPDATE OF economic_type, txn_date, amount, classification_confidence,
  classification_source, classification_reasons, interpretation_version
ON public.transactions
FOR EACH ROW
WHEN (OLD.financial_event_id IS NOT NULL)
EXECUTE FUNCTION public.sync_transaction_financial_event();

-- Replace legacy direction-based dashboard aggregates with economic meaning.
CREATE OR REPLACE FUNCTION public.get_dashboard_cashflow(
  p_household_id uuid,
  p_start_date date
)
RETURNS TABLE (month_str text, total_income numeric, total_expense numeric)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_household_access(p_household_id) THEN
    RAISE EXCEPTION 'household_access_denied' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    to_char(t.txn_date, 'YYYY-MM'),
    COALESCE(SUM(CASE WHEN t.economic_type IN ('INCOME','INVESTMENT_INCOME','INTEREST_INCOME') THEN t.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE
      WHEN t.economic_type IN ('EXPENSE','INSURANCE_PAYMENT','FEE_OR_CHARGE','TAX') THEN t.amount
      WHEN t.economic_type = 'REFUND' THEN -t.amount
      ELSE 0
    END), 0)
  FROM public.transactions t
  WHERE t.household_id = p_household_id AND t.txn_date >= p_start_date
  GROUP BY to_char(t.txn_date, 'YYYY-MM')
  ORDER BY 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_top_spend(
  p_household_id uuid,
  p_start_date date,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (category_name text, total_amount numeric)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_household_access(p_household_id) THEN
    RAISE EXCEPTION 'household_access_denied' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    COALESCE(c.name, 'Uncategorized'),
    SUM(CASE WHEN t.economic_type = 'REFUND' THEN -t.amount ELSE t.amount END)
  FROM public.transactions t
  LEFT JOIN public.categories c ON c.id = t.category_id
  WHERE t.household_id = p_household_id
    AND t.economic_type IN ('EXPENSE','INSURANCE_PAYMENT','FEE_OR_CHARGE','TAX','REFUND')
    AND t.txn_date >= p_start_date
  GROUP BY COALESCE(c.name, 'Uncategorized')
  HAVING SUM(CASE WHEN t.economic_type = 'REFUND' THEN -t.amount ELSE t.amount END) <> 0
  ORDER BY 2 DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_cashflow(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_dashboard_top_spend(uuid, date, integer) TO authenticated, service_role;

-- Refresh PostgREST immediately after adding transaction columns and tables.
-- This avoids transient "column not found in schema cache" import failures.
NOTIFY pgrst, 'reload schema';
