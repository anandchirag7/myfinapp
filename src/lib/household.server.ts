import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Retrieves the user's default household ID.
 * If the user does not have a household yet (e.g. newly signed up or Google OAuth),
 * it automatically provisions a default household, links the profile, and seeds categories.
 */
export async function getHouseholdId(ctx: { supabase: any; userId: string }): Promise<string> {
  const { supabase, userId } = ctx;
  if (!userId) throw new Error("Unauthorized: No user ID");

  // 1. Check user profile for default_household_id
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, default_household_id, display_name")
      .eq("id", userId)
      .maybeSingle();

    if (profile?.default_household_id) {
      return profile.default_household_id;
    }
  } catch (err) {
    console.warn("[getHouseholdId] Error reading profile:", err);
  }

  // 2. Check household_members if user is a member of any household
  try {
    const { data: memberRows } = await supabase
      .from("household_members")
      .select("household_id")
      .eq("user_id", userId)
      .limit(1);

    if (memberRows && memberRows.length > 0 && memberRows[0].household_id) {
      const existingHhId = memberRows[0].household_id;
      // Update profile with this default household id
      try {
        await (supabaseAdmin as any)
          .from("profiles")
          .upsert({ id: userId, default_household_id: existingHhId }, { onConflict: "id" });
      } catch (upsertErr) {
        console.warn("[getHouseholdId] Error linking existing household to profile:", upsertErr);
      }
      return existingHhId;
    }
  } catch (err) {
    console.warn("[getHouseholdId] Error reading household_members:", err);
  }

  // 3. If no household exists for this user, auto-provision one using supabaseAdmin
  try {
    let displayName = "My Household";
    try {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (userData?.user) {
        const u = userData.user;
        const metaName =
          u.user_metadata?.display_name ||
          u.user_metadata?.full_name ||
          u.user_metadata?.name;
        const emailPrefix = u.email ? u.email.split("@")[0] : "User";
        displayName = metaName || `${emailPrefix}'s Household`;
      }
    } catch {}

    const householdName = displayName.endsWith("Household")
      ? displayName
      : `${displayName}'s Household`;

    // Create household
    const { data: newHh, error: hhErr } = await (supabaseAdmin as any)
      .from("households")
      .insert({
        name: householdName,
        created_by: userId,
        base_currency: "INR",
      })
      .select("id")
      .single();

    if (hhErr || !newHh?.id) {
      console.error("[getHouseholdId] Failed to create household:", hhErr);
      throw new Error(hhErr?.message || "Failed to create household");
    }

    const householdId = newHh.id;

    // Add user as admin member
    await (supabaseAdmin as any)
      .from("household_members")
      .insert({
        household_id: householdId,
        user_id: userId,
        role: "admin",
      });

    // Update/upsert profile
    await (supabaseAdmin as any)
      .from("profiles")
      .upsert(
        {
          id: userId,
          default_household_id: householdId,
          display_name: displayName.replace(/'s Household$/, ""),
        },
        { onConflict: "id" }
      );

    // Seed default categories
    try {
      await (supabaseAdmin as any).rpc("seed_default_categories", { _household_id: householdId });
    } catch (seedErr) {
      console.warn("[getHouseholdId] seed_default_categories RPC notice:", seedErr);
    }

    return householdId;
  } catch (err) {
    console.error("[getHouseholdId] Error auto-provisioning household:", err);
    throw new Error("Could not initialize household for user.");
  }
}
