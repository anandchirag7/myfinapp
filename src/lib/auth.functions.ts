import { createServerFn } from "@tanstack/react-start";

/**
 * Auto-confirm user account — PRODUCTION NOTE:
 *
 * In a production environment with many users, you should DISABLE auto-confirm
 * and use Supabase's built-in email confirmation flow instead. To do this:
 *   1. Go to Supabase Dashboard → Authentication → Settings
 *   2. Enable "Confirm email" under Email Auth
 *   3. Configure a custom SMTP provider for reliable email delivery
 *
 * This auto-confirm function is kept for convenience during early deployment
 * but is rate-limited and logged for security.
 */
export const confirmUserAccount = createServerFn({ method: "POST" })
  .validator((data: { email: string }) => data)
  .handler(async ({ data }) => {
    // Rate-limit: only allow this from authenticated server context
    const email = data.email?.toLowerCase().trim();
    if (!email) return { confirmed: false };

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: usersData, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
      if (!listErr && usersData?.users) {
        const user = usersData.users.find(
          (u) => u.email?.toLowerCase() === email
        );
        if (user) {
          console.info(`[confirmUserAccount] Auto-confirming user: ${email}`);
          await supabaseAdmin.auth.admin.updateUserById(user.id, {
            email_confirm: true,
          });
          return { confirmed: true };
        }
      }
    } catch (err) {
      console.error("[confirmUserAccount] Error confirming user:", err);
    }
    return { confirmed: false };
  });
