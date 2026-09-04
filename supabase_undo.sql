-- Roll back supabase/migrations/20260903000000_rules_engine_system.sql
--
-- WARNING: This permanently deletes all unified Rules feature data, including
-- user-created rules, natural-language instructions, migrated rule copies,
-- schedules, and execution logs.
--
-- It intentionally DOES NOT delete or modify the original payee_rules,
-- memorized_payees, transactions, categories, accounts, or statement uploads.

BEGIN;

-- Drop dependent/child tables first so unrelated database objects do not need
-- CASCADE and cannot be removed accidentally.
DROP TABLE IF EXISTS public.rule_execution_logs;
DROP TABLE IF EXISTS public.rule_actions;
DROP TABLE IF EXISTS public.rule_triggers;
DROP TABLE IF EXISTS public.rules;
DROP TABLE IF EXISTS public.rule_groups;

-- These enum types were introduced exclusively for the unified Rules feature.
DROP TYPE IF EXISTS public.rule_kind;
DROP TYPE IF EXISTS public.rule_trigger_moment;

COMMIT;

-- Optional read-only verification query:
-- SELECT
--   to_regclass('public.rule_groups') AS rule_groups,
--   to_regclass('public.rules') AS rules,
--   to_regclass('public.rule_triggers') AS rule_triggers,
--   to_regclass('public.rule_actions') AS rule_actions,
--   to_regclass('public.rule_execution_logs') AS rule_execution_logs;
