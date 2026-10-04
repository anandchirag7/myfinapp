-- Household-scoped context used to improve statement normalization and categorization.
CREATE TABLE IF NOT EXISTS public.household_ai_spending_profiles (
  household_id uuid PRIMARY KEY REFERENCES public.households(id) ON DELETE CASCADE,
  schema_version integer NOT NULL DEFAULT 1,
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT household_ai_spending_profile_object CHECK (jsonb_typeof(profile) = 'object'),
  CONSTRAINT household_ai_spending_profile_size CHECK (octet_length(profile::text) <= 65536)
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_spending_onboarding_status text NOT NULL DEFAULT 'pending'
    CHECK (ai_spending_onboarding_status IN ('pending', 'completed', 'dismissed')),
  ADD COLUMN IF NOT EXISTS ai_spending_onboarding_seen_at timestamptz;

ALTER TABLE public.household_ai_spending_profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY household_ai_spending_profiles_access
    ON public.household_ai_spending_profiles
    FOR ALL TO authenticated
    USING (public.has_household_access(household_id))
    WITH CHECK (public.has_household_access(household_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.household_ai_spending_profiles TO authenticated;
GRANT ALL ON public.household_ai_spending_profiles TO service_role;
