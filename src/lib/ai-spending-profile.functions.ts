import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getHouseholdId } from "@/lib/household.server";
import {
  AI_SPENDING_PROFILE_VERSION,
  EMPTY_AI_SPENDING_PROFILE,
  normalizeAiSpendingProfile,
} from "@/lib/ai-spending-profile";

export const getAiSpendingProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const householdId = await getHouseholdId(context);
    const [
      { data, error },
      { data: onboarding, error: onboardingError },
      { data: categories, error: categoriesError },
    ] = await Promise.all([
      context.supabase
        .from("household_ai_spending_profiles")
        .select("profile, updated_at")
        .eq("household_id", householdId)
        .maybeSingle(),
      context.supabase
        .from("profiles")
        .select("ai_spending_onboarding_status, ai_spending_onboarding_seen_at")
        .eq("id", context.userId)
        .maybeSingle(),
      context.supabase
        .from("categories")
        .select("id,name,kind,parent_id")
        .eq("household_id", householdId)
        .order("name"),
    ]);
    if (error) throw error;
    if (onboardingError) throw onboardingError;
    if (categoriesError) throw categoriesError;
    return {
      householdId,
      status: onboarding?.ai_spending_onboarding_status ?? "pending",
      profile: data?.profile ? normalizeAiSpendingProfile(data.profile) : EMPTY_AI_SPENDING_PROFILE,
      seenAt: onboarding?.ai_spending_onboarding_seen_at ?? null,
      updatedAt: data?.updated_at ?? null,
      categories: categories ?? [],
    };
  });

export const saveAiSpendingProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value: unknown) => z.object({ profile: z.unknown() }).parse(value))
  .handler(async ({ context, data }) => {
    const householdId = await getHouseholdId(context);
    const profile = normalizeAiSpendingProfile(data.profile);
    const now = new Date().toISOString();
    const { data: row, error } = await context.supabase
      .from("household_ai_spending_profiles")
      .upsert(
        {
          household_id: householdId,
          schema_version: AI_SPENDING_PROFILE_VERSION,
          profile,
          updated_by: context.userId,
          updated_at: now,
        },
        { onConflict: "household_id" },
      )
      .select("profile, updated_at")
      .single();
    if (error) throw error;
    const { error: onboardingError } = await context.supabase
      .from("profiles")
      .update({
        ai_spending_onboarding_status: "completed",
        ai_spending_onboarding_seen_at: now,
      })
      .eq("id", context.userId);
    if (onboardingError) throw onboardingError;
    return { ...row, profile: normalizeAiSpendingProfile(row.profile) };
  });

export const dismissAiSpendingProfileOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await getHouseholdId(context);
    const now = new Date().toISOString();
    const { error } = await context.supabase
      .from("profiles")
      .update({
        ai_spending_onboarding_status: "dismissed",
        ai_spending_onboarding_seen_at: now,
      })
      .eq("id", context.userId);
    if (error) throw error;
    return { status: "dismissed" as const };
  });
