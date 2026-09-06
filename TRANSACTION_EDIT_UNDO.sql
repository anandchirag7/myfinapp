-- Roll back supabase/migrations/20260904000000_complete_transaction_edit.sql
-- This removes only the complete-transaction-edit RPC and its lookup index.
-- It does not modify transactions, memorized payees, or activity records.

BEGIN;

REVOKE ALL ON FUNCTION public.update_transaction_complete(UUID, TIMESTAMPTZ, JSONB, TEXT, UUID) FROM PUBLIC;
DROP FUNCTION IF EXISTS public.update_transaction_complete(UUID, TIMESTAMPTZ, JSONB, TEXT, UUID);
DROP INDEX IF EXISTS public.idx_memorized_payees_household_merchant_lower;

COMMIT;

-- Optional read-only verification:
-- SELECT to_regprocedure('public.update_transaction_complete(uuid,timestamptz,jsonb,text,uuid)');
-- SELECT to_regclass('public.idx_memorized_payees_household_merchant_lower');
