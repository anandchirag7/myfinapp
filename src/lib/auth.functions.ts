import { createServerFn } from "@tanstack/react-start";

export const confirmUserAccount = createServerFn({ method: "POST" })
  .validator((data: { email: string }) => data)
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: usersData, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
      if (!listErr && usersData?.users) {
        const user = usersData.users.find(
          (u) => u.email?.toLowerCase() === data.email.toLowerCase().trim()
        );
        if (user) {
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
