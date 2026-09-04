-- Unified deterministic and LLM-context rules. Existing rule tables are retained.
DO $$ BEGIN
  CREATE TYPE public.rule_trigger_moment AS ENUM ('create', 'update', 'create_and_update', 'manual_only', 'scheduled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.rule_kind AS ENUM ('deterministic', 'llm_context');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.rule_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  title text NOT NULL, description text, sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true, stop_processing boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  rule_group_id uuid NOT NULL REFERENCES public.rule_groups(id) ON DELETE CASCADE,
  title text NOT NULL, description text, kind public.rule_kind NOT NULL DEFAULT 'deterministic',
  natural_language_instruction text, trigger_moment public.rule_trigger_moment NOT NULL DEFAULT 'create',
  schedule_cron text, strict_mode boolean NOT NULL DEFAULT true, stop_processing boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0, is_active boolean NOT NULL DEFAULT true,
  legacy_payee_rule_id uuid UNIQUE REFERENCES public.payee_rules(id) ON DELETE SET NULL,
  last_run_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rules_kind_payload CHECK ((kind = 'llm_context') = (natural_language_instruction IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS public.rule_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), rule_id uuid NOT NULL REFERENCES public.rules(id) ON DELETE CASCADE,
  field text NOT NULL, operator text NOT NULL, value text NOT NULL DEFAULT '', value_secondary text,
  is_inverted boolean NOT NULL DEFAULT false, stop_processing boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0, is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.rule_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), rule_id uuid NOT NULL REFERENCES public.rules(id) ON DELETE CASCADE,
  action_type text NOT NULL, action_value text NOT NULL DEFAULT '', stop_processing boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0, is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.rule_execution_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  rule_id uuid REFERENCES public.rules(id) ON DELETE SET NULL, transaction_id uuid REFERENCES public.transactions(id) ON DELETE CASCADE,
  statement_upload_id uuid REFERENCES public.statement_uploads(id) ON DELETE CASCADE,
  trigger_moment public.rule_trigger_moment NOT NULL, actions_applied jsonb NOT NULL DEFAULT '[]'::jsonb,
  executed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rule_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rule_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rule_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rule_execution_logs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY rule_groups_household_policy ON public.rule_groups FOR ALL TO authenticated USING (public.has_household_access(household_id)) WITH CHECK (public.has_household_access(household_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY rules_household_policy ON public.rules FOR ALL TO authenticated USING (public.has_household_access(household_id)) WITH CHECK (public.has_household_access(household_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY rule_triggers_household_policy ON public.rule_triggers FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.rules r WHERE r.id=rule_id AND public.has_household_access(r.household_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.rules r WHERE r.id=rule_id AND public.has_household_access(r.household_id))); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY rule_actions_household_policy ON public.rule_actions FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.rules r WHERE r.id=rule_id AND public.has_household_access(r.household_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.rules r WHERE r.id=rule_id AND public.has_household_access(r.household_id))); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY rule_execution_logs_policy ON public.rule_execution_logs FOR ALL TO authenticated USING (public.has_household_access(household_id)) WITH CHECK (public.has_household_access(household_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rule_groups, public.rules, public.rule_triggers, public.rule_actions, public.rule_execution_logs TO authenticated;
GRANT ALL ON public.rule_groups, public.rules, public.rule_triggers, public.rule_actions, public.rule_execution_logs TO service_role;
CREATE INDEX IF NOT EXISTS idx_rule_groups_household_order ON public.rule_groups(household_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_rules_group_order ON public.rules(rule_group_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_rule_triggers_rule_order ON public.rule_triggers(rule_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_rule_actions_rule_order ON public.rule_actions(rule_id, sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS idx_migrated_payee_group_once ON public.rule_groups(household_id, title) WHERE title='Migrated Payee Rules';
CREATE UNIQUE INDEX IF NOT EXISTS idx_rule_triggers_migration_once ON public.rule_triggers(rule_id, field, sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rule_actions_migration_once ON public.rule_actions(rule_id, action_type, sort_order);

-- Automatic, idempotent one-time conversion of current payee rules.
INSERT INTO public.rule_groups (household_id, title, description, sort_order)
SELECT DISTINCT household_id, 'Migrated Payee Rules', 'Automatically imported from existing payee rules.', -100
FROM public.payee_rules
ON CONFLICT DO NOTHING;
WITH source AS (
  SELECT pr.*, mp.merchant, rg.id AS group_id
  FROM public.payee_rules pr JOIN public.memorized_payees mp ON mp.id=pr.payee_id
  JOIN public.rule_groups rg ON rg.household_id=pr.household_id AND rg.title='Migrated Payee Rules'
)
INSERT INTO public.rules (household_id, rule_group_id, title, description, trigger_moment, strict_mode, sort_order, is_active, legacy_payee_rule_id)
SELECT household_id, group_id, 'Payee: ' || merchant, 'Migrated automatically; the original payee rule remains intact.', 'create', true, priority, is_active, id
FROM source ON CONFLICT (legacy_payee_rule_id) DO NOTHING;
INSERT INTO public.rule_triggers (rule_id, field, operator, value, sort_order)
SELECT r.id, 'merchant', 'equals', mp.merchant, 0 FROM public.rules r
JOIN public.payee_rules pr ON pr.id=r.legacy_payee_rule_id JOIN public.memorized_payees mp ON mp.id=pr.payee_id
ON CONFLICT DO NOTHING;
INSERT INTO public.rule_triggers (rule_id, field, operator, value, sort_order)
SELECT r.id, 'type', 'equals', pr.txn_type, 1 FROM public.rules r JOIN public.payee_rules pr ON pr.id=r.legacy_payee_rule_id ON CONFLICT DO NOTHING;
INSERT INTO public.rule_triggers (rule_id, field, operator, value, sort_order)
SELECT r.id, 'amount', 'greater_than_or_equal', pr.min_amount::text, 2 FROM public.rules r JOIN public.payee_rules pr ON pr.id=r.legacy_payee_rule_id WHERE pr.min_amount IS NOT NULL ON CONFLICT DO NOTHING;
INSERT INTO public.rule_triggers (rule_id, field, operator, value, sort_order)
SELECT r.id, 'amount', 'less_than_or_equal', pr.max_amount::text, 3 FROM public.rules r JOIN public.payee_rules pr ON pr.id=r.legacy_payee_rule_id WHERE pr.max_amount IS NOT NULL ON CONFLICT DO NOTHING;
INSERT INTO public.rule_actions (rule_id, action_type, action_value, sort_order)
SELECT r.id, 'set_category', pr.category_id::text, 0 FROM public.rules r JOIN public.payee_rules pr ON pr.id=r.legacy_payee_rule_id WHERE pr.category_id IS NOT NULL ON CONFLICT DO NOTHING;
INSERT INTO public.rule_actions (rule_id, action_type, action_value, sort_order)
SELECT r.id, 'set_memo', pr.memo, 1 FROM public.rules r JOIN public.payee_rules pr ON pr.id=r.legacy_payee_rule_id WHERE pr.memo IS NOT NULL ON CONFLICT DO NOTHING;
INSERT INTO public.rule_actions (rule_id, action_type, action_value, sort_order)
SELECT r.id, 'add_tag', tag, 10 + ord::int FROM public.rules r JOIN public.payee_rules pr ON pr.id=r.legacy_payee_rule_id CROSS JOIN LATERAL unnest(pr.tags) WITH ORDINALITY AS x(tag,ord) ON CONFLICT DO NOTHING;
