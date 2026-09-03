-- Release E: service-controlled canaries, metrics and emergency rollback.
CREATE TABLE public.statement_feature_rollouts (
  feature text PRIMARY KEY CHECK (feature IN ('resolver_v2', 'web_enrichment')),
  enabled boolean NOT NULL DEFAULT false,
  rollout_percent integer NOT NULL DEFAULT 0 CHECK (rollout_percent BETWEEN 0 AND 100),
  shadow boolean NOT NULL DEFAULT true,
  rollback boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.statement_feature_rollouts(feature, enabled, rollout_percent, shadow, rollback)
VALUES ('resolver_v2', true, 5, true, false), ('web_enrichment', true, 5, true, false)
ON CONFLICT (feature) DO NOTHING;

CREATE TABLE public.statement_rollout_metrics (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  upload_id uuid NOT NULL REFERENCES public.statement_uploads(id) ON DELETE CASCADE,
  feature text NOT NULL CHECK (feature IN ('resolver_v2', 'web_enrichment')),
  active boolean NOT NULL,
  shadow boolean NOT NULL,
  baseline_resolved integer NOT NULL DEFAULT 0,
  candidate_resolved integer NOT NULL DEFAULT 0,
  blocking_count integer NOT NULL DEFAULT 0,
  failure_count integer NOT NULL DEFAULT 0,
  resolver_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX statement_rollout_metrics_feature_created_idx
  ON public.statement_rollout_metrics(feature, created_at DESC);

ALTER TABLE public.statement_feature_rollouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.statement_rollout_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY statement_rollout_metrics_household_read ON public.statement_rollout_metrics
  FOR SELECT TO authenticated USING (public.has_household_access(household_id));
GRANT SELECT ON public.statement_rollout_metrics TO authenticated;
GRANT ALL ON public.statement_feature_rollouts, public.statement_rollout_metrics TO service_role;

CREATE OR REPLACE FUNCTION public.set_statement_feature_rollout(
  target_feature text,
  target_enabled boolean,
  target_percent integer,
  target_shadow boolean,
  target_rollback boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service role required'; END IF;
  IF target_feature NOT IN ('resolver_v2', 'web_enrichment') THEN RAISE EXCEPTION 'invalid feature'; END IF;
  IF target_percent NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'invalid rollout percent'; END IF;
  UPDATE public.statement_feature_rollouts SET
    enabled = target_enabled, rollout_percent = target_percent, shadow = target_shadow,
    rollback = target_rollback, updated_at = now(), updated_by = auth.uid()
  WHERE feature = target_feature;
END $$;

REVOKE ALL ON FUNCTION public.set_statement_feature_rollout(text, boolean, integer, boolean, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_statement_feature_rollout(text, boolean, integer, boolean, boolean)
  TO service_role;
