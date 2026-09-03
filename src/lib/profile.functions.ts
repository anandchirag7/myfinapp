import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getHouseholdId } from "@/lib/household.server";

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await getHouseholdId(context);
    const { data, error } = await context.supabase
      .from("profiles")
      .select(
        "id, display_name, whatsapp_number, whatsapp_reminders_enabled, default_household_id, auto_approve_threshold, statement_web_enrichment_consent_at, statement_web_enrichment_provider, statement_web_enrichment_notice_version",
      )
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw error;
    const claims = context.claims as Record<string, unknown> | undefined;
    return {
      ...(data ?? {}),
      email: typeof claims?.email === "string" ? claims.email : null,
    };
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        display_name: z.string().max(120).optional(),
        whatsapp_number: z.string().max(30).nullable().optional(),
        whatsapp_reminders_enabled: z.boolean().optional(),
        auto_approve_threshold: z.number().min(0).max(1).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("profiles")
      .update(data)
      .eq("id", context.userId)
      .select(
        "id, display_name, whatsapp_number, whatsapp_reminders_enabled, auto_approve_threshold",
      )
      .maybeSingle();
    if (error) throw error;
    return row;
  });
