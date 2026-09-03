-- Release D foundation: explicit consent and terms-conscious shadow cache.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS statement_web_enrichment_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS statement_web_enrichment_provider text,
  ADD COLUMN IF NOT EXISTS statement_web_enrichment_notice_version text;

CREATE TABLE public.merchant_enrichment_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  query_hash text NOT NULL CHECK (query_hash ~ '^[0-9a-f]{64}$'),
  provider text NOT NULL CHECK (provider IN ('ollama')),
  status text NOT NULL CHECK (status IN ('hit', 'miss', 'rejected')),
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, query_hash, provider)
);

ALTER TABLE public.merchant_enrichment_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY merchant_enrichment_cache_household ON public.merchant_enrichment_cache
  FOR SELECT TO authenticated USING (public.has_household_access(household_id));
GRANT SELECT ON public.merchant_enrichment_cache TO authenticated;
GRANT ALL ON public.merchant_enrichment_cache TO service_role;

COMMENT ON COLUMN public.merchant_enrichment_cache.query_hash IS
  'SHA-256 of the sanitized query; raw descriptions and raw queries are never stored.';

