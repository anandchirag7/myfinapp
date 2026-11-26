-- Generic multi-account card-payment reconciliation. A payment processor such
-- as CRED is evidence, never the destination account. The destination is an
-- owned credit-card account and every physical statement row remains evidence.

CREATE TABLE IF NOT EXISTS public.credit_card_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  source_account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  destination_card_account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  source_transaction_id uuid REFERENCES public.transactions(id) ON DELETE CASCADE,
  target_transaction_id uuid REFERENCES public.transactions(id) ON DELETE CASCADE,
  canonical_transaction_id uuid REFERENCES public.transactions(id) ON DELETE CASCADE,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'INR',
  payment_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('unresolved','provisional','matched','ambiguous','reversed')),
  match_method text NOT NULL DEFAULT 'unresolved' CHECK (match_method IN (
    'unresolved','user_selected','reference','account_amount_date','amount_date','split_amount'
  )),
  confidence numeric(5,4) NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
  processor_reference text,
  statement_upload_id uuid REFERENCES public.statement_uploads(id) ON DELETE SET NULL,
  import_batch_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_account_id IS NULL OR destination_card_account_id IS NULL OR source_account_id <> destination_card_account_id),
  CHECK (source_transaction_id IS NOT NULL OR target_transaction_id IS NOT NULL OR canonical_transaction_id IS NOT NULL)
);

ALTER TABLE public.credit_card_payment_allocations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY credit_card_payment_allocations_access
    ON public.credit_card_payment_allocations FOR ALL TO authenticated
    USING (public.has_household_access(household_id))
    WITH CHECK (public.has_household_access(household_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_card_payment_allocations TO authenticated;
GRANT ALL ON public.credit_card_payment_allocations TO service_role;

CREATE INDEX IF NOT EXISTS idx_card_payment_source
  ON public.credit_card_payment_allocations(household_id, source_account_id, payment_date, amount);
CREATE INDEX IF NOT EXISTS idx_card_payment_destination
  ON public.credit_card_payment_allocations(household_id, destination_card_account_id, payment_date, amount);
CREATE INDEX IF NOT EXISTS idx_card_payment_open
  ON public.credit_card_payment_allocations(household_id, status, payment_date)
  WHERE status IN ('unresolved','provisional','ambiguous');

CREATE OR REPLACE FUNCTION public.resolve_statement_card_payment(
  p_household_id uuid,
  p_user_id uuid,
  p_statement_account_id uuid,
  p_destination_card_account_id uuid,
  p_direction text,
  p_amount numeric,
  p_txn_date date,
  p_merchant text,
  p_note text,
  p_normalized_pattern text,
  p_processor_reference text,
  p_row_fingerprint text,
  p_statement_upload_id uuid DEFAULT NULL,
  p_import_batch_id uuid DEFAULT NULL
)
RETURNS TABLE(transaction_id uuid, created boolean, reconciled boolean, review_needed boolean)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_transaction_id uuid;
  v_allocation_id uuid;
  v_candidates uuid[];
  v_candidate_count integer;
  v_target_transaction_id uuid;
  v_status text;
  v_currency text;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id OR NOT public.has_household_access(p_household_id) THEN
    RAISE EXCEPTION 'card_payment_access_denied' USING ERRCODE = '42501';
  END IF;
  IF p_direction NOT IN ('debit','credit') OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_card_payment_input' USING ERRCODE = '22023';
  END IF;
  SELECT currency INTO v_currency FROM public.accounts
  WHERE id = p_statement_account_id AND household_id = p_household_id;
  IF v_currency IS NULL THEN
    RAISE EXCEPTION 'statement_account_outside_household' USING ERRCODE = '42501';
  END IF;
  IF p_destination_card_account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.accounts
    WHERE id = p_destination_card_account_id AND household_id = p_household_id AND category = 'credit_card'
  ) THEN
    RAISE EXCEPTION 'destination_is_not_owned_credit_card' USING ERRCODE = '22023';
  END IF;
  IF p_destination_card_account_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.accounts destination
    WHERE destination.id = p_destination_card_account_id
      AND COALESCE(destination.currency, 'INR') <> COALESCE(v_currency, 'INR')
  ) THEN
    RAISE EXCEPTION 'cross_currency_card_payment_requires_fx_amounts' USING ERRCODE = '22023';
  END IF;

  SELECT e.transaction_id INTO v_transaction_id
  FROM public.transaction_statement_evidence e
  WHERE e.household_id = p_household_id
    AND e.statement_account_id = p_statement_account_id
    AND e.row_fingerprint = p_row_fingerprint;
  IF v_transaction_id IS NOT NULL THEN
    RETURN QUERY SELECT v_transaction_id, false, true, false;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_household_id::text || ':card:' || round(p_amount, 2)::text || ':' || p_txn_date::text, 0
  ));

  IF p_direction = 'credit' THEN
    SELECT array_agg(a.id ORDER BY a.id) INTO v_candidates
    FROM public.credit_card_payment_allocations a
    WHERE a.household_id = p_household_id
      AND a.destination_card_account_id = p_statement_account_id
      AND a.status = 'provisional'
      AND a.currency = COALESCE(v_currency, 'INR')
      AND abs(a.amount - p_amount) < 0.005
      AND a.payment_date BETWEEN p_txn_date - 7 AND p_txn_date + 7;
    v_candidate_count := COALESCE(array_length(v_candidates, 1), 0);
    IF v_candidate_count = 1 THEN
      SELECT a.canonical_transaction_id INTO v_transaction_id
      FROM public.credit_card_payment_allocations a WHERE a.id = v_candidates[1];
      UPDATE public.credit_card_payment_allocations SET
        status = 'matched', match_method = 'account_amount_date', confidence = 0.97, updated_at = now()
      WHERE id = v_candidates[1];
      INSERT INTO public.transaction_statement_evidence (
        household_id, transaction_id, statement_upload_id, import_batch_id,
        statement_account_id, direction, row_fingerprint, created_by
      ) VALUES (
        p_household_id, v_transaction_id, p_statement_upload_id, p_import_batch_id,
        p_statement_account_id, p_direction, p_row_fingerprint, p_user_id
      );
      RETURN QUERY SELECT v_transaction_id, false, true, false;
      RETURN;
    END IF;
  ELSE
    IF p_destination_card_account_id IS NOT NULL THEN
      SELECT array_agg(a.id ORDER BY a.id) INTO v_candidates
      FROM public.credit_card_payment_allocations a
      WHERE a.household_id = p_household_id
        AND a.destination_card_account_id = p_destination_card_account_id
        AND a.status = 'unresolved'
        AND a.currency = COALESCE(v_currency, 'INR')
        AND a.target_transaction_id IS NOT NULL
        AND abs(a.amount - p_amount) < 0.005
        AND a.payment_date BETWEEN p_txn_date - 7 AND p_txn_date + 7;
      v_candidate_count := COALESCE(array_length(v_candidates, 1), 0);
      IF v_candidate_count = 1 THEN
        SELECT a.target_transaction_id INTO v_target_transaction_id
        FROM public.credit_card_payment_allocations a WHERE a.id = v_candidates[1];
      END IF;
    END IF;
  END IF;

  -- When both physical legs already exist, store both. Otherwise a selected
  -- destination creates one canonical transfer with a provisional card leg.
  IF p_direction = 'debit' AND p_destination_card_account_id IS NOT NULL AND v_target_transaction_id IS NULL THEN
    INSERT INTO public.transactions (
      household_id, account_id, transfer_account_id, type, amount, txn_date,
      merchant, note, normalized_pattern, tags, import_batch_id, created_by,
      statement_direction, economic_type, classification_confidence,
      classification_source, classification_reasons, interpretation_version
    ) VALUES (
      p_household_id, p_statement_account_id, p_destination_card_account_id, 'transfer', p_amount, p_txn_date,
      NULLIF(p_merchant,''), NULLIF(p_note,''), NULLIF(p_normalized_pattern,''), '{}', p_import_batch_id, p_user_id,
      'debit', 'CREDIT_CARD_PAYMENT', 1, 'user_confirmed_card',
      ARRAY['The user selected the owned destination card.'], 'financial-events-v1'
    ) RETURNING id INTO v_transaction_id;
    v_status := 'provisional';
  ELSE
    INSERT INTO public.transactions (
      household_id, account_id, type, amount, txn_date, merchant, note,
      normalized_pattern, tags, import_batch_id, created_by, statement_direction,
      economic_type, classification_confidence, classification_source,
      classification_reasons, interpretation_version
    ) VALUES (
      p_household_id, p_statement_account_id,
      CASE WHEN p_direction = 'debit' THEN 'expense' ELSE 'income' END,
      p_amount, p_txn_date, NULLIF(p_merchant,''), NULLIF(p_note,''),
      NULLIF(p_normalized_pattern,''), '{}', p_import_batch_id, p_user_id, p_direction,
      'CREDIT_CARD_PAYMENT', CASE WHEN p_destination_card_account_id IS NULL THEN 0.75 ELSE 1 END,
      CASE WHEN p_destination_card_account_id IS NULL THEN 'deferred_card_review' ELSE 'card_reconciled' END,
      ARRAY[CASE WHEN p_destination_card_account_id IS NULL
        THEN 'Destination card needs review.' ELSE 'Matched both physical statement legs.' END],
      'financial-events-v1'
    ) RETURNING id INTO v_transaction_id;
    v_status := CASE WHEN v_target_transaction_id IS NOT NULL THEN 'matched'
      WHEN v_candidate_count > 1 THEN 'ambiguous' ELSE 'unresolved' END;
  END IF;

  INSERT INTO public.transaction_statement_evidence (
    household_id, transaction_id, statement_upload_id, import_batch_id,
    statement_account_id, direction, row_fingerprint, created_by
  ) VALUES (
    p_household_id, v_transaction_id, p_statement_upload_id, p_import_batch_id,
    p_statement_account_id, p_direction, p_row_fingerprint, p_user_id
  );

  IF p_direction = 'debit' AND v_target_transaction_id IS NOT NULL THEN
    UPDATE public.credit_card_payment_allocations SET
      source_account_id = p_statement_account_id,
      source_transaction_id = v_transaction_id,
      status = 'matched', match_method = 'account_amount_date', confidence = 0.97, updated_at = now()
    WHERE id = v_candidates[1];
  ELSE
    INSERT INTO public.credit_card_payment_allocations (
      household_id, source_account_id, destination_card_account_id,
      source_transaction_id, target_transaction_id, canonical_transaction_id,
      amount, currency, payment_date, status, match_method, confidence,
      processor_reference, statement_upload_id, import_batch_id, created_by
    ) VALUES (
      p_household_id,
      CASE WHEN p_direction = 'debit' THEN p_statement_account_id ELSE NULL END,
      CASE WHEN p_direction = 'credit' THEN p_statement_account_id ELSE p_destination_card_account_id END,
      CASE WHEN p_direction = 'debit' AND v_status <> 'provisional' THEN v_transaction_id ELSE NULL END,
      CASE WHEN p_direction = 'credit' THEN v_transaction_id ELSE NULL END,
      CASE WHEN v_status = 'provisional' THEN v_transaction_id ELSE NULL END,
      p_amount, COALESCE(v_currency, 'INR'), p_txn_date, v_status,
      CASE WHEN v_status = 'provisional' THEN 'user_selected' ELSE 'unresolved' END,
      CASE WHEN v_status = 'provisional' THEN 1 ELSE 0 END,
      NULLIF(p_processor_reference,''), p_statement_upload_id, p_import_batch_id, p_user_id
    );
  END IF;

  PERFORM public.recompute_account_balance(p_household_id, p_statement_account_id);
  IF p_destination_card_account_id IS NOT NULL THEN
    PERFORM public.recompute_account_balance(p_household_id, p_destination_card_account_id);
  END IF;
  RETURN QUERY SELECT v_transaction_id, true, false, v_status IN ('unresolved','ambiguous');
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_statement_card_payment(
  uuid, uuid, uuid, uuid, text, numeric, date, text, text, text, text, text, uuid, uuid
) TO authenticated, service_role;
