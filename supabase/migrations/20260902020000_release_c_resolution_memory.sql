-- Release C: structured resolutions, verified embedding retrieval and household feedback.
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TYPE public.merchant_entity_kind AS ENUM ('business', 'person', 'self', 'employer', 'bank');
CREATE TYPE public.merchant_alias_relation AS ENUM ('positive', 'negative');

CREATE TABLE public.merchant_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid REFERENCES public.households(id) ON DELETE CASCADE,
  canonical_name text NOT NULL CHECK (length(canonical_name) BETWEEN 1 AND 120),
  kind public.merchant_entity_kind NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  category_key text,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (household_id IS NOT NULL OR (kind = 'business' AND verified))
);

CREATE TABLE public.merchant_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.merchant_entities(id) ON DELETE CASCADE,
  household_id uuid REFERENCES public.households(id) ON DELETE CASCADE,
  alias_text text NOT NULL CHECK (length(alias_text) BETWEEN 1 AND 180),
  normalized_fingerprint text NOT NULL,
  relation public.merchant_alias_relation NOT NULL DEFAULT 'positive',
  source text NOT NULL,
  resolver_version text NOT NULL,
  confidence numeric(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  recurring boolean NOT NULL DEFAULT false,
  embedding extensions.vector,
  embedding_model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (household_id, normalized_fingerprint, entity_id, relation)
);

CREATE TABLE public.statement_pattern_resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid NOT NULL REFERENCES public.statement_uploads(id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  normalized_pattern text NOT NULL,
  entity_id uuid REFERENCES public.merchant_entities(id) ON DELETE SET NULL,
  identity_name text,
  category_key text,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  transaction_type text,
  event_type text,
  confidence numeric(4,3) NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  blocking_reason text,
  resolver_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (upload_id, normalized_pattern)
);

CREATE INDEX merchant_aliases_fingerprint_idx
  ON public.merchant_aliases(household_id, normalized_fingerprint);
CREATE INDEX statement_pattern_resolutions_upload_idx
  ON public.statement_pattern_resolutions(upload_id);

ALTER TABLE public.merchant_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.statement_pattern_resolutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY merchant_entities_household_read ON public.merchant_entities FOR SELECT TO authenticated
  USING (household_id IS NULL OR public.has_household_access(household_id));
CREATE POLICY merchant_entities_household_write ON public.merchant_entities FOR ALL TO authenticated
  USING (household_id IS NOT NULL AND public.has_household_access(household_id))
  WITH CHECK (household_id IS NOT NULL AND public.has_household_access(household_id));
CREATE POLICY merchant_aliases_household_read ON public.merchant_aliases FOR SELECT TO authenticated
  USING (household_id IS NULL OR public.has_household_access(household_id));
CREATE POLICY merchant_aliases_household_write ON public.merchant_aliases FOR ALL TO authenticated
  USING (household_id IS NOT NULL AND public.has_household_access(household_id))
  WITH CHECK (household_id IS NOT NULL AND public.has_household_access(household_id));
CREATE POLICY statement_resolutions_household ON public.statement_pattern_resolutions FOR ALL TO authenticated
  USING (public.has_household_access(household_id))
  WITH CHECK (public.has_household_access(household_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.merchant_entities, public.merchant_aliases,
  public.statement_pattern_resolutions TO authenticated;
GRANT ALL ON public.merchant_entities, public.merchant_aliases,
  public.statement_pattern_resolutions TO service_role;

CREATE OR REPLACE FUNCTION public.match_verified_merchant_aliases(
  query_embedding extensions.vector,
  match_household_id uuid,
  match_count integer DEFAULT 3
)
RETURNS TABLE (
  entity_id uuid, canonical_name text, category_key text, category_id uuid,
  alias_text text, relation public.merchant_alias_relation, similarity double precision
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT e.id, e.canonical_name, e.category_key, e.category_id,
    a.alias_text, a.relation, 1 - (a.embedding <=> query_embedding) AS similarity
  FROM public.merchant_aliases a
  JOIN public.merchant_entities e ON e.id = a.entity_id
  WHERE a.embedding IS NOT NULL
    AND e.verified
    AND (auth.role() = 'service_role' OR public.has_household_access(match_household_id))
    AND (a.household_id = match_household_id OR a.household_id IS NULL)
    AND NOT EXISTS (
      SELECT 1 FROM public.merchant_aliases blocked
      WHERE blocked.household_id = match_household_id
        AND blocked.normalized_fingerprint = a.normalized_fingerprint
        AND blocked.entity_id = a.entity_id
        AND blocked.relation = 'negative'
    )
  ORDER BY a.embedding <=> query_embedding
  LIMIT LEAST(GREATEST(match_count, 1), 10);
$$;

REVOKE ALL ON FUNCTION public.match_verified_merchant_aliases(extensions.vector, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_verified_merchant_aliases(extensions.vector, uuid, integer)
  TO authenticated, service_role;
