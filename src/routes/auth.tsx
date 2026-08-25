import { createFileRoute, useNavigate } from "@tanstack/react-router";
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { ensureDemoAccount } from "@/lib/demo.functions";
import { confirmUserAccount } from "@/lib/auth.functions";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { next?: string } =>
    typeof s.next === "string" && s.next.startsWith("/") && !s.next.startsWith("//")
      ? { next: s.next }
      : {},
  head: () => ({
    meta: [
      { title: "Sign in — Paisa" },
      { name: "description", content: "Sign in to your Paisa personal finance dashboard." },
    ],
  }),
  component: AuthPage,
});

const REMEMBER_KEY = "paisa_remembered_credentials";

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const next = search?.next;
  const goNext = () => {
    if (next) window.location.href = next;
    else navigate({ to: "/", replace: true });
  };
  const returnUrl = () => (next ? `${window.location.origin}${next}` : window.location.origin);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Check existing session
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) goNext();
    });

    // Pre-populate remembered credentials if saved
    try {
      const saved = localStorage.getItem(REMEMBER_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.email) setEmail(parsed.email);
        if (parsed.password) setPassword(parsed.password);
        if (typeof parsed.remember === "boolean") setRememberMe(parsed.remember);
      }
    } catch (err) {
      console.warn("Could not load remembered credentials:", err);
    }
  }, []);

  const saveOrClearRemembered = (emailVal: string, passVal: string) => {
    try {
      if (rememberMe) {
        localStorage.setItem(
          REMEMBER_KEY,
          JSON.stringify({ email: emailVal, password: passVal, remember: true })
        );
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }
    } catch (err) {
      console.warn("Could not persist remember me preference:", err);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const cleanEmail = email.trim();
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            emailRedirectTo: returnUrl(),
            data: { display_name: name.trim() || cleanEmail.split("@")[0] },
          },
        });
        if (error) throw error;
        
        // Auto-confirm the newly created account for instant access
        try {
          await confirmUserAccount({ data: { email: cleanEmail } });
        } catch (confirmErr) {
          console.warn("Auto-confirm notice:", confirmErr);
        }

        // Save remembered credentials if enabled
        saveOrClearRemembered(cleanEmail, password);

        // Immediately sign in
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (signInErr) {
          toast.success("Account created! Please sign in with your email and password.");
          setMode("signin");
        } else {
          toast.success("Account created successfully!");
          goNext();
        }
      } else {
        let { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        // Handle case where account email confirmation is pending
        if (error && error.message?.toLowerCase().includes("email not confirmed")) {
          try {
            const res = await confirmUserAccount({ data: { email: cleanEmail } });
            if (res?.confirmed) {
              const retry = await supabase.auth.signInWithPassword({
                email: cleanEmail,
                password,
              });
              if (!retry.error) {
                saveOrClearRemembered(cleanEmail, password);
                toast.success("Signed in successfully");
                goNext();
                return;
              }
              error = retry.error;
            }
          } catch (confirmErr) {
            console.warn("Email confirmation fallback:", confirmErr);
          }
        }

        if (error) {
          if (error.message?.toLowerCase().includes("invalid login credentials")) {
            toast.error("Invalid email or password. If you don't have an account yet, switch to 'Create account'.");
          } else {
            toast.error(error.message);
          }
          return;
        }

        saveOrClearRemembered(cleanEmail, password);
        toast.success("Signed in successfully");
        goNext();
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: returnUrl(),
        },
      });
      if (error) {
        toast.error(error.message ?? "Google sign-in failed");
        setBusy(false);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Google sign-in failed");
      setBusy(false);
    }
  };

  const tryDemo = async () => {
    setBusy(true);
    try {
      const creds = await ensureDemoAccount();
      const { error } = await supabase.auth.signInWithPassword({
        email: creds.email,
        password: creds.password,
      });
      if (error) throw error;

      toast.success("Signed in to demo account");
      goNext();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load demo");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-display text-2xl font-semibold">
            ₹
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Paisa</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your money, in one place.</p>
        </div>

        <Card suppressHydrationWarning>
          <CardHeader>
            <CardTitle>Welcome</CardTitle>
            <CardDescription>Sign in or create an account to get started.</CardDescription>
          </CardHeader>
          <CardContent suppressHydrationWarning>
            <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Create account</TabsTrigger>
              </TabsList>

              <TabsContent value="signin" className="mt-4">
                <form onSubmit={submit} className="space-y-3" suppressHydrationWarning>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      autoComplete="username"
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      suppressHydrationWarning
                    />
                  </div>
                  <div>
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      required
                      autoComplete="current-password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      suppressHydrationWarning
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="remember-me"
                        checked={rememberMe}
                        onCheckedChange={(checked) => setRememberMe(!!checked)}
                        suppressHydrationWarning
                      />
                      <Label
                        htmlFor="remember-me"
                        className="text-xs font-normal text-muted-foreground cursor-pointer select-none"
                      >
                        Remember me
                      </Label>
                    </div>

                    {(email || password) && (
                      <button
                        type="button"
                        onClick={() => {
                          setEmail("");
                          setPassword("");
                          setRememberMe(false);
                          try {
                            localStorage.removeItem(REMEMBER_KEY);
                          } catch {}
                          toast.info("Cleared saved credentials");
                        }}
                        className="text-[11px] text-muted-foreground hover:text-foreground transition underline-offset-2 hover:underline"
                      >
                        Clear saved
                      </button>
                    )}
                  </div>

                  <Button className="w-full mt-2" type="submit" disabled={busy} suppressHydrationWarning>
                    {busy ? "Signing in..." : "Sign in"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="mt-4">
                <form onSubmit={submit} className="space-y-3" suppressHydrationWarning>
                  <div>
                    <Label htmlFor="name">Your name</Label>
                    <Input
                      id="name"
                      placeholder="Chirag Anand"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      suppressHydrationWarning
                    />
                  </div>
                  <div>
                    <Label htmlFor="email2">Email</Label>
                    <Input
                      id="email2"
                      type="email"
                      required
                      autoComplete="username"
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      suppressHydrationWarning
                    />
                  </div>
                  <div>
                    <Label htmlFor="password2">Password</Label>
                    <Input
                      id="password2"
                      type="password"
                      required
                      minLength={6}
                      autoComplete="new-password"
                      placeholder="At least 6 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      suppressHydrationWarning
                    />
                  </div>

                  <div className="flex items-center space-x-2 pt-1">
                    <Checkbox
                      id="remember-me-signup"
                      checked={rememberMe}
                      onCheckedChange={(checked) => setRememberMe(!!checked)}
                      suppressHydrationWarning
                    />
                    <Label
                      htmlFor="remember-me-signup"
                      className="text-xs font-normal text-muted-foreground cursor-pointer select-none"
                    >
                      Remember me on this device
                    </Label>
                  </div>

                  <Button className="w-full mt-2" type="submit" disabled={busy} suppressHydrationWarning>
                    {busy ? "Creating account..." : "Create account"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">or</span>
              </div>
            </div>

            <Button variant="outline" className="w-full" onClick={google} disabled={busy} suppressHydrationWarning>
              Continue with Google
            </Button>

            <Button variant="secondary" className="mt-2 w-full" onClick={tryDemo} disabled={busy} suppressHydrationWarning>
              <Sparkles className="mr-2 h-4 w-4" />
              Try demo account
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Explore Paisa with pre-loaded Indian accounts, transactions & bills
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
