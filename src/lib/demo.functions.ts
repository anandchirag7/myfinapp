import { createServerFn } from "@tanstack/react-start";

const DEMO_EMAIL = "demo@paisa.app";
const DEMO_PASSWORD = "DemoPaisa!2026";

export const ensureDemoAccount = createServerFn({ method: "POST" }).handler(async () => {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: usersData, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
    
    if (!listErr && usersData?.users) {
      const existing = usersData.users.find((u) => u.email === DEMO_EMAIL);
      if (existing) {
        await supabaseAdmin.auth.admin.updateUserById(existing.id, {
          password: DEMO_PASSWORD,
          email_confirm: true,
          user_metadata: { display_name: "Demo User" },
        });
      } else {
        await supabaseAdmin.auth.admin.createUser({
          email: DEMO_EMAIL,
          password: DEMO_PASSWORD,
          email_confirm: true,
          user_metadata: { display_name: "Demo User" },
        });
      }
    }
  } catch (err) {
    console.error("[ensureDemoAccount] Error provisioning demo account:", err);
  }

  return { email: DEMO_EMAIL, password: DEMO_PASSWORD, seeded: true };
});
