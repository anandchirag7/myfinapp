/**
 * Lovable auth bridge has been removed for independent deployment.
 * All OAuth flows go directly through Supabase Auth.
 *
 * This file is kept as a stub so existing imports don't break.
 * The `lovable.auth.signInWithOAuth` function now delegates directly
 * to `supabase.auth.signInWithOAuth`.
 */

import { supabase } from "../supabase/client";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

export const lovable = {
  auth: {
    signInWithOAuth: async (
      provider: "google" | "apple" | "microsoft",
      opts?: SignInOptions,
    ) => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: opts?.redirect_uri ?? window.location.origin,
        },
      });

      if (error) {
        return { error };
      }

      // Supabase handles the redirect automatically
      return { redirected: true };
    },
  },
};
