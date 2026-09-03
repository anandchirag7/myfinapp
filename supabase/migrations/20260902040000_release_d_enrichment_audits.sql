-- Release D: immutable aggregate shadow audits. No raw query or narration fields.
CREATE TABLE public.merchant_enrichment_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid REFERENCES public.households(id) ON DELETE CASCADE,
  provider text NOT NULL,
  mode text NOT NULL CHECK (mode = 'shadow'),
  sample_size integer NOT NULL CHECK (sample_size >= 0),
  eligible_count integer NOT NULL CHECK (eligible_count >= 0),
  correct_count integer NOT NULL CHECK (correct_count >= 0),
  precision numeric(5,4) NOT NULL CHECK (precision BETWEEN 0 AND 1),
  pii_query_count integer NOT NULL DEFAULT 0 CHECK (pii_query_count >= 0),
  person_query_count integer NOT NULL DEFAULT 0 CHECK (person_query_count >= 0),
  passed boolean NOT NULL,
  resolver_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.merchant_enrichment_audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY merchant_enrichment_audits_household ON public.merchant_enrichment_audits
  FOR SELECT TO authenticated
  USING (household_id IS NOT NULL AND public.has_household_access(household_id));
GRANT SELECT ON public.merchant_enrichment_audits TO authenticated;
GRANT ALL ON public.merchant_enrichment_audits TO service_role;

