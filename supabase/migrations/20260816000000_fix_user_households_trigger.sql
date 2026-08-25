-- Migration: 20260816000000_fix_user_households_trigger.sql
-- Description: Ensures all users (existing and future signups/Google OAuth) have a default household, profile, and membership.

-- 1. Ensure the handle_new_user trigger function handles edge cases cleanly
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_household UUID;
  user_display_name TEXT;
BEGIN
  -- Determine display name
  user_display_name := COALESCE(
    NEW.raw_user_meta_data->>'display_name',
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1),
    'User'
  );

  -- Check if user already has a household membership
  SELECT household_id INTO new_household
  FROM public.household_members
  WHERE user_id = NEW.id
  LIMIT 1;

  -- If not, create a new household
  IF new_household IS NULL THEN
    INSERT INTO public.households(name, created_by, base_currency)
    VALUES (user_display_name || '''s Household', NEW.id, 'INR')
    RETURNING id INTO new_household;

    INSERT INTO public.household_members(household_id, user_id, role)
    VALUES (new_household, NEW.id, 'admin')
    ON CONFLICT DO NOTHING;

    -- Seed default categories for this household
    BEGIN
      PERFORM public.seed_default_categories(new_household);
    EXCEPTION WHEN OTHERS THEN
      -- Ignore if seed fails or already exists
      NULL;
    END;
  END IF;

  -- Upsert profile with default household
  INSERT INTO public.profiles(id, display_name, default_household_id)
  VALUES (NEW.id, user_display_name, new_household)
  ON CONFLICT (id) DO UPDATE
    SET default_household_id = COALESCE(public.profiles.default_household_id, EXCLUDED.default_household_id),
        display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name);

  RETURN NEW;
END $$;

-- 2. Ensure trigger is attached to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Backfill all existing users who do not have a default household or profile
DO $$
DECLARE
  usr RECORD;
  hh_id UUID;
  u_name TEXT;
BEGIN
  FOR usr IN SELECT id, email, raw_user_meta_data FROM auth.users LOOP
    -- Check if user already has a valid default_household_id
    SELECT default_household_id INTO hh_id FROM public.profiles WHERE id = usr.id;

    IF hh_id IS NULL THEN
      -- Check if they belong to any household
      SELECT household_id INTO hh_id FROM public.household_members WHERE user_id = usr.id LIMIT 1;

      -- If still null, create a household
      IF hh_id IS NULL THEN
        u_name := COALESCE(
          usr.raw_user_meta_data->>'display_name',
          usr.raw_user_meta_data->>'full_name',
          usr.raw_user_meta_data->>'name',
          split_part(usr.email, '@', 1),
          'User'
        );

        INSERT INTO public.households(name, created_by, base_currency)
        VALUES (u_name || '''s Household', usr.id, 'INR')
        RETURNING id INTO hh_id;

        INSERT INTO public.household_members(household_id, user_id, role)
        VALUES (hh_id, usr.id, 'admin')
        ON CONFLICT DO NOTHING;

        BEGIN
          PERFORM public.seed_default_categories(hh_id);
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      END IF;

      -- Create or update profile
      INSERT INTO public.profiles(id, display_name, default_household_id)
      VALUES (
        usr.id,
        COALESCE(
          usr.raw_user_meta_data->>'display_name',
          usr.raw_user_meta_data->>'full_name',
          usr.raw_user_meta_data->>'name',
          split_part(usr.email, '@', 1),
          'User'
        ),
        hh_id
      )
      ON CONFLICT (id) DO UPDATE
        SET default_household_id = COALESCE(public.profiles.default_household_id, EXCLUDED.default_household_id);
    END IF;
  END LOOP;
END $$;
