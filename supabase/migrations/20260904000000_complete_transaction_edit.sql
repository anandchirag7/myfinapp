-- Complete transaction editing with an atomic memorized-payee decision.
-- The function derives household/user identity from auth context and allowlists every writable field.

CREATE INDEX IF NOT EXISTS idx_memorized_payees_household_merchant_lower
  ON public.memorized_payees (household_id, lower(merchant));

CREATE OR REPLACE FUNCTION public.update_transaction_complete(
  p_transaction_id uuid,
  p_expected_updated_at timestamptz,
  p_patch jsonb,
  p_memory_action text DEFAULT 'transaction_only',
  p_payee_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_old public.transactions%ROWTYPE;
  v_saved public.transactions%ROWTYPE;
  v_household uuid;
  v_new_account uuid;
  v_new_transfer uuid;
  v_new_category uuid;
  v_new_type public.txn_type;
  v_new_amount numeric;
  v_new_merchant text;
  v_category_kind text;
  v_category_name text;
  v_payee public.memorized_payees%ROWTYPE;
  v_result_payee uuid;
  v_merchant_changed boolean;
  v_financial_change boolean;
  v_account uuid;
  v_allowed_keys text[] := ARRAY[
    'account_id','transfer_account_id','category_id','type','amount','txn_date',
    'merchant','memo','note','payment_method','check_number','tags','tax_code',
    'cleared_status','is_flagged','is_favorite','is_reviewed'
  ];
  v_changed_keys text[];
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'invalid_patch' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_patch) key
    WHERE NOT (key = ANY(v_allowed_keys))
  ) THEN
    RAISE EXCEPTION 'forbidden_transaction_field' USING ERRCODE = '22023';
  END IF;
  IF p_memory_action NOT IN ('transaction_only','update_payee','create_payee','use_existing_payee') THEN
    RAISE EXCEPTION 'invalid_memory_action' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_old
  FROM public.transactions
  WHERE id = p_transaction_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public.has_household_access(v_old.household_id) THEN
    RAISE EXCEPTION 'transaction_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_old.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'transaction_edit_conflict' USING ERRCODE = '40001';
  END IF;

  v_household := v_old.household_id;
  v_new_account := CASE WHEN p_patch ? 'account_id' THEN (p_patch->>'account_id')::uuid ELSE v_old.account_id END;
  v_new_transfer := CASE WHEN p_patch ? 'transfer_account_id' AND p_patch->>'transfer_account_id' IS NOT NULL
    THEN (p_patch->>'transfer_account_id')::uuid
    WHEN p_patch ? 'transfer_account_id' THEN NULL ELSE v_old.transfer_account_id END;
  v_new_category := CASE WHEN p_patch ? 'category_id' AND p_patch->>'category_id' IS NOT NULL
    THEN (p_patch->>'category_id')::uuid
    WHEN p_patch ? 'category_id' THEN NULL ELSE v_old.category_id END;
  v_new_type := CASE WHEN p_patch ? 'type' THEN (p_patch->>'type')::public.txn_type ELSE v_old.type END;
  v_new_amount := CASE WHEN p_patch ? 'amount' THEN (p_patch->>'amount')::numeric ELSE v_old.amount END;
  v_new_merchant := CASE WHEN p_patch ? 'merchant' THEN NULLIF(btrim(p_patch->>'merchant'), '') ELSE v_old.merchant END;

  IF v_new_amount IS NULL OR v_new_amount <= 0 OR v_new_amount > 9999999999999999.99 THEN
    RAISE EXCEPTION 'invalid_transaction_amount' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = v_new_account AND household_id = v_household) THEN
    RAISE EXCEPTION 'invalid_source_account' USING ERRCODE = '23503';
  END IF;
  IF v_new_type = 'transfer' THEN
    IF v_new_transfer IS NULL OR v_new_transfer = v_new_account THEN
      RAISE EXCEPTION 'invalid_transfer_accounts' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = v_new_transfer AND household_id = v_household) THEN
      RAISE EXCEPTION 'invalid_destination_account' USING ERRCODE = '23503';
    END IF;
    v_new_category := NULL;
  ELSE
    v_new_transfer := NULL;
  END IF;

  IF v_new_category IS NOT NULL THEN
    SELECT kind, name INTO v_category_kind, v_category_name
    FROM public.categories
    WHERE id = v_new_category AND household_id = v_household;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid_category' USING ERRCODE = '23503';
    END IF;
    IF (v_new_type = 'income' AND v_category_kind <> 'income') OR
       (v_new_type = 'expense' AND v_category_kind NOT IN ('expense','investment')) THEN
      RAISE EXCEPTION 'incompatible_category_type' USING ERRCODE = '22023';
    END IF;
  END IF;

  v_financial_change := p_patch ?| ARRAY['amount','type','account_id','transfer_account_id'];
  IF (v_old.split_parent_id IS NOT NULL OR EXISTS (
      SELECT 1 FROM public.transactions child WHERE child.split_parent_id = v_old.id
    )) AND v_financial_change THEN
    RAISE EXCEPTION 'split_financial_fields_locked' USING ERRCODE = '22023';
  END IF;

  v_merchant_changed := lower(btrim(coalesce(v_old.merchant, ''))) IS DISTINCT FROM lower(btrim(coalesce(v_new_merchant, '')));
  IF NOT v_merchant_changed AND p_memory_action <> 'transaction_only' THEN
    RAISE EXCEPTION 'merchant_unchanged' USING ERRCODE = '22023';
  END IF;
  IF v_merchant_changed AND p_memory_action IN ('update_payee','create_payee','use_existing_payee') AND v_new_merchant IS NULL THEN
    RAISE EXCEPTION 'merchant_required_for_memory' USING ERRCODE = '22023';
  END IF;

  IF v_merchant_changed AND p_memory_action IN ('update_payee','use_existing_payee') THEN
    IF p_payee_id IS NULL THEN
      RAISE EXCEPTION 'payee_required' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_payee FROM public.memorized_payees
    WHERE id = p_payee_id AND household_id = v_household
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'payee_not_found' USING ERRCODE = 'P0002'; END IF;
    IF p_memory_action = 'update_payee' AND v_payee.locked THEN
      RAISE EXCEPTION 'payee_locked' USING ERRCODE = '55000';
    END IF;
    IF p_memory_action = 'use_existing_payee' AND lower(btrim(v_payee.merchant)) <> lower(btrim(v_new_merchant)) THEN
      RAISE EXCEPTION 'payee_name_mismatch' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.memorized_payees
      WHERE household_id = v_household AND lower(btrim(merchant)) = lower(btrim(v_new_merchant)) AND id <> v_payee.id
    ) THEN
      RAISE EXCEPTION 'payee_name_conflict' USING ERRCODE = '23505';
    END IF;

    UPDATE public.memorized_payees
    SET merchant = CASE WHEN p_memory_action = 'update_payee' THEN v_new_merchant ELSE merchant END,
        aliases = ARRAY(
          SELECT DISTINCT btrim(alias)
          FROM unnest(coalesce(v_payee.aliases, '{}'::text[]) ||
            ARRAY[CASE WHEN nullif(btrim(coalesce(v_old.merchant, '')), '') IS NOT NULL THEN btrim(v_old.merchant) ELSE NULL END]) alias
          WHERE alias IS NOT NULL AND btrim(alias) <> ''
        ),
        modified_by = v_actor,
        updated_at = now()
    WHERE id = v_payee.id;
    v_result_payee := v_payee.id;
  ELSIF v_merchant_changed AND p_memory_action = 'create_payee' THEN
    IF EXISTS (
      SELECT 1 FROM public.memorized_payees
      WHERE household_id = v_household AND lower(btrim(merchant)) = lower(btrim(v_new_merchant))
    ) THEN
      RAISE EXCEPTION 'payee_name_conflict' USING ERRCODE = '23505';
    END IF;
    INSERT INTO public.memorized_payees (
      household_id, merchant, txn_type, category_id, aliases, created_by, modified_by
    ) VALUES (
      v_household, v_new_merchant, v_new_type::text, v_new_category,
      CASE WHEN nullif(btrim(coalesce(v_old.merchant, '')), '') IS NULL THEN '{}'::text[] ELSE ARRAY[btrim(v_old.merchant)] END,
      v_actor, v_actor
    ) RETURNING id INTO v_result_payee;
  END IF;

  UPDATE public.transactions
  SET account_id = v_new_account,
      transfer_account_id = v_new_transfer,
      category_id = v_new_category,
      type = v_new_type,
      amount = v_new_amount,
      txn_date = CASE WHEN p_patch ? 'txn_date' THEN (p_patch->>'txn_date')::date ELSE v_old.txn_date END,
      merchant = v_new_merchant,
      memo = CASE WHEN p_patch ? 'memo' THEN NULLIF(btrim(p_patch->>'memo'), '') ELSE v_old.memo END,
      note = CASE WHEN p_patch ? 'note' THEN NULLIF(btrim(p_patch->>'note'), '') ELSE v_old.note END,
      payment_method = CASE WHEN p_patch ? 'payment_method' THEN NULLIF(btrim(p_patch->>'payment_method'), '') ELSE v_old.payment_method END,
      check_number = CASE WHEN p_patch ? 'check_number' THEN NULLIF(btrim(p_patch->>'check_number'), '') ELSE v_old.check_number END,
      tags = CASE WHEN p_patch ? 'tags' THEN ARRAY(SELECT DISTINCT btrim(value) FROM jsonb_array_elements_text(p_patch->'tags') WHERE btrim(value) <> '') ELSE v_old.tags END,
      tax_code = CASE WHEN p_patch ? 'tax_code' THEN NULLIF(btrim(p_patch->>'tax_code'), '') ELSE v_old.tax_code END,
      cleared_status = CASE WHEN p_patch ? 'cleared_status' THEN p_patch->>'cleared_status' ELSE v_old.cleared_status END,
      is_flagged = CASE WHEN p_patch ? 'is_flagged' THEN (p_patch->>'is_flagged')::boolean ELSE v_old.is_flagged END,
      is_favorite = CASE WHEN p_patch ? 'is_favorite' THEN (p_patch->>'is_favorite')::boolean ELSE v_old.is_favorite END,
      is_reviewed = CASE WHEN p_patch ? 'is_reviewed' THEN (p_patch->>'is_reviewed')::boolean ELSE v_old.is_reviewed END
  WHERE id = v_old.id
  RETURNING * INTO v_saved;

  IF v_merchant_changed AND p_memory_action <> 'transaction_only' AND nullif(btrim(coalesce(v_old.normalized_pattern, '')), '') IS NOT NULL THEN
    INSERT INTO public.user_payee_overrides (user_id, normalized_pattern, payee_name, category)
    VALUES (v_actor, upper(btrim(v_old.normalized_pattern)), v_new_merchant, v_category_name)
    ON CONFLICT (user_id, normalized_pattern) DO UPDATE
      SET payee_name = excluded.payee_name, category = excluded.category, updated_at = now();
  END IF;

  SELECT array_agg(key ORDER BY key) INTO v_changed_keys FROM jsonb_object_keys(p_patch) key;
  INSERT INTO public.transaction_activity (household_id, transaction_id, actor_id, action, details)
  VALUES (
    v_household, v_old.id, v_actor, 'complete_update',
    jsonb_build_object(
      'changed_fields', coalesce(to_jsonb(v_changed_keys), '[]'::jsonb),
      'merchant_memory_action', p_memory_action,
      'payee_id', v_result_payee,
      'before', jsonb_build_object('account_id',v_old.account_id,'transfer_account_id',v_old.transfer_account_id,'category_id',v_old.category_id,'type',v_old.type,'amount',v_old.amount,'txn_date',v_old.txn_date,'merchant',v_old.merchant),
      'after', jsonb_build_object('account_id',v_saved.account_id,'transfer_account_id',v_saved.transfer_account_id,'category_id',v_saved.category_id,'type',v_saved.type,'amount',v_saved.amount,'txn_date',v_saved.txn_date,'merchant',v_saved.merchant)
    )
  );

  IF v_financial_change THEN
    FOR v_account IN
      SELECT DISTINCT affected.account_id
      FROM unnest(ARRAY[v_old.account_id, v_old.transfer_account_id, v_new_account, v_new_transfer]) AS affected(account_id)
      WHERE affected.account_id IS NOT NULL
    LOOP
      PERFORM public.recompute_account_balance(v_household, v_account);
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'transaction', to_jsonb(v_saved),
    'merchant_memory_action', p_memory_action,
    'payee_id', v_result_payee
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_transaction_complete(uuid,timestamptz,jsonb,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_transaction_complete(uuid,timestamptz,jsonb,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_transaction_complete(uuid,timestamptz,jsonb,text,uuid) TO service_role;

COMMENT ON FUNCTION public.update_transaction_complete(uuid,timestamptz,jsonb,text,uuid)
IS 'Atomically updates an authorized transaction, optional memorized-payee memory, activity log, and all affected account balances.';
