-- Release C: durable PGMQ-backed statement classification.
CREATE EXTENSION IF NOT EXISTS pgmq;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pgmq.list_queues() WHERE queue_name = 'statement_classification') THEN
    PERFORM pgmq.create('statement_classification');
  END IF;
END $$;

ALTER TABLE public.statement_uploads
  ADD COLUMN IF NOT EXISTS resolver_version text,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS current_batch integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_attempt integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_patterns integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_progress_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS statement_uploads_idempotency_key_idx
  ON public.statement_uploads(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enqueue_statement_classification(payload jsonb)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
  SELECT pgmq.send('statement_classification', payload);
$$;

CREATE OR REPLACE FUNCTION public.claim_statement_classification(visibility_seconds integer DEFAULT 300)
RETURNS TABLE(msg_id bigint, read_ct integer, enqueued_at timestamptz, vt timestamptz, message jsonb)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
  SELECT r.msg_id, r.read_ct, r.enqueued_at, r.vt, r.message
  FROM pgmq.read('statement_classification', GREATEST(30, visibility_seconds), 1) AS r;
$$;

CREATE OR REPLACE FUNCTION public.complete_statement_classification(message_id bigint)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
  SELECT pgmq.delete('statement_classification', message_id);
$$;

REVOKE ALL ON FUNCTION public.enqueue_statement_classification(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_statement_classification(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_statement_classification(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_statement_classification(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_statement_classification(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_statement_classification(bigint) TO service_role;
