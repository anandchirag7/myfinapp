-- Canonical internal-transfer reconciliation. One transaction is rendered as
-- a debit in the source account and a credit in the destination account.

CREATE TABLE IF NOT EXISTS public.transaction_statement_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  statement_upload_id uuid REFERENCES public.statement_uploads(id) ON DELETE SET NULL,
  import_batch_id uuid,
  statement_account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('debit', 'credit')),
  row_fingerprint text NOT NULL CHECK (char_length(row_fingerprint) BETWEEN 32 AND 128),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, statement_account_id, row_fingerprint)
);

CREATE TABLE IF NOT EXISTS public.household_transfer_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  statement_account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  counterparty_account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  normalized_pattern text NOT NULL CHECK (char_length(normalized_pattern) BETWEEN 1 AND 240),
  direction text NOT NULL CHECK (direction IN ('debit', 'credit')),
  confirmation_count integer NOT NULL DEFAULT 1 CHECK (confirmation_count > 0),
  confirmed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (statement_account_id <> counterparty_account_id),
  UNIQUE (household_id, statement_account_id, normalized_pattern, direction)
);

ALTER TABLE public.transaction_statement_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_transfer_memory ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY transaction_statement_evidence_access
    ON public.transaction_statement_evidence FOR ALL TO authenticated
    USING (public.has_household_access(household_id))
    WITH CHECK (public.has_household_access(household_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY household_transfer_memory_access
    ON public.household_transfer_memory FOR ALL TO authenticated
    USING (public.has_household_access(household_id))
    WITH CHECK (public.has_household_access(household_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transaction_statement_evidence TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.household_transfer_memory TO authenticated;
GRANT ALL ON public.transaction_statement_evidence, public.household_transfer_memory TO service_role;

CREATE INDEX IF NOT EXISTS idx_transfer_evidence_transaction
  ON public.transaction_statement_evidence(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transfer_evidence_upload
  ON public.transaction_statement_evidence(statement_upload_id);
CREATE INDEX IF NOT EXISTS idx_transfer_memory_lookup
  ON public.household_transfer_memory(household_id, statement_account_id, normalized_pattern, direction);
CREATE INDEX IF NOT EXISTS idx_internal_transfer_match
  ON public.transactions(household_id, account_id, transfer_account_id, amount, txn_date)
  WHERE type = 'transfer';

CREATE OR REPLACE FUNCTION public.resolve_statement_internal_transfer(
  p_household_id uuid,
  p_user_id uuid,
  p_statement_account_id uuid,
  p_counterparty_account_id uuid,
  p_direction text,
  p_amount numeric,
  p_txn_date date,
  p_merchant text,
  p_note text,
  p_normalized_pattern text,
  p_row_fingerprint text,
  p_statement_upload_id uuid DEFAULT NULL,
  p_import_batch_id uuid DEFAULT NULL
)
RETURNS TABLE(transaction_id uuid, created boolean, reconciled boolean)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_source uuid;
  v_target uuid;
  v_transaction_id uuid;
  v_existing_evidence uuid;
  v_candidates uuid[];
  v_candidate_count integer;
  v_created boolean := false;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'unauthorized_transfer_import' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_household_access(p_household_id) THEN
    RAISE EXCEPTION 'household_access_denied' USING ERRCODE = '42501';
  END IF;
  IF p_direction NOT IN ('debit', 'credit') OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_transfer_input' USING ERRCODE = '22023';
  END IF;
  IF p_statement_account_id = p_counterparty_account_id THEN
    RAISE EXCEPTION 'invalid_transfer_accounts' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.accounts
    WHERE id IN (p_statement_account_id, p_counterparty_account_id)
      AND household_id = p_household_id
    GROUP BY household_id HAVING count(*) = 2
  ) THEN
    RAISE EXCEPTION 'transfer_account_outside_household' USING ERRCODE = '42501';
  END IF;

  v_source := CASE WHEN p_direction = 'debit' THEN p_statement_account_id ELSE p_counterparty_account_id END;
  v_target := CASE WHEN p_direction = 'debit' THEN p_counterparty_account_id ELSE p_statement_account_id END;

  SELECT e.transaction_id INTO v_existing_evidence
  FROM public.transaction_statement_evidence e
  WHERE e.household_id = p_household_id
    AND e.statement_account_id = p_statement_account_id
    AND e.row_fingerprint = p_row_fingerprint;
  IF v_existing_evidence IS NOT NULL THEN
    RETURN QUERY SELECT v_existing_evidence, false, true;
    RETURN;
  END IF;

  -- Serialize the same account-pair/amount so simultaneous source and target
  -- imports cannot both create a canonical transfer.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    LEAST(v_source::text, v_target::text) || ':' ||
    GREATEST(v_source::text, v_target::text) || ':' ||
    round(p_amount, 2)::text,
    0
  ));

  -- Re-check after acquiring the lock so two simultaneous retries of the same
  -- statement row cannot race past the first idempotency lookup.
  SELECT e.transaction_id INTO v_existing_evidence
  FROM public.transaction_statement_evidence e
  WHERE e.household_id = p_household_id
    AND e.statement_account_id = p_statement_account_id
    AND e.row_fingerprint = p_row_fingerprint;
  IF v_existing_evidence IS NOT NULL THEN
    RETURN QUERY SELECT v_existing_evidence, false, true;
    RETURN;
  END IF;

  SELECT array_agg(t.id ORDER BY t.id) INTO v_candidates
  FROM public.transactions t
  WHERE t.household_id = p_household_id
    AND t.type = 'transfer'
    AND t.account_id = v_source
    AND t.transfer_account_id = v_target
    AND abs(t.amount - p_amount) < 0.005
    AND t.txn_date BETWEEN p_txn_date - 3 AND p_txn_date + 3
    -- A second identical row from the same statement account is a distinct
    -- transfer. Only the opposite account's statement may reconcile to a row
    -- already evidenced by this import side.
    AND NOT EXISTS (
      SELECT 1 FROM public.transaction_statement_evidence same_side
      WHERE same_side.transaction_id = t.id
        AND same_side.statement_account_id = p_statement_account_id
    );
  v_candidate_count := COALESCE(array_length(v_candidates, 1), 0);

  IF v_candidate_count > 1 THEN
    RAISE EXCEPTION 'ambiguous_internal_transfer_match' USING
      ERRCODE = 'P0001',
      DETAIL = array_to_string(v_candidates, ',');
  ELSIF v_candidate_count = 1 THEN
    v_transaction_id := v_candidates[1];
  ELSE
    INSERT INTO public.transactions (
      household_id, account_id, transfer_account_id, category_id, type,
      amount, txn_date, merchant, note, normalized_pattern, tags,
      import_batch_id, created_by
    ) VALUES (
      p_household_id, v_source, v_target, NULL, 'transfer',
      p_amount, p_txn_date, NULLIF(p_merchant, ''), NULLIF(p_note, ''),
      NULLIF(p_normalized_pattern, ''), '{}', p_import_batch_id, p_user_id
    ) RETURNING id INTO v_transaction_id;
    v_created := true;
  END IF;

  INSERT INTO public.transaction_statement_evidence (
    household_id, transaction_id, statement_upload_id, import_batch_id,
    statement_account_id, direction, row_fingerprint, created_by
  ) VALUES (
    p_household_id, v_transaction_id, p_statement_upload_id, p_import_batch_id,
    p_statement_account_id, p_direction, p_row_fingerprint, p_user_id
  );

  IF NULLIF(trim(p_normalized_pattern), '') IS NOT NULL THEN
    INSERT INTO public.household_transfer_memory (
      household_id, statement_account_id, counterparty_account_id,
      normalized_pattern, direction, confirmed_by
    ) VALUES (
      p_household_id, p_statement_account_id, p_counterparty_account_id,
      left(trim(p_normalized_pattern), 240), p_direction, p_user_id
    )
    ON CONFLICT (household_id, statement_account_id, normalized_pattern, direction)
    DO UPDATE SET
      counterparty_account_id = EXCLUDED.counterparty_account_id,
      confirmation_count = household_transfer_memory.confirmation_count + 1,
      confirmed_by = EXCLUDED.confirmed_by,
      updated_at = now();
  END IF;

  PERFORM public.recompute_account_balance(p_household_id, v_source);
  PERFORM public.recompute_account_balance(p_household_id, v_target);

  RETURN QUERY SELECT v_transaction_id, v_created, NOT v_created;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_statement_internal_transfer(
  uuid, uuid, uuid, uuid, text, numeric, date, text, text, text, text, uuid, uuid
) TO authenticated, service_role;
