import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  User,
  Sparkles,
  Bell,
  Archive,
  ShieldAlert,
  Sun,
  Moon,
  CheckCircle2,
  Globe2,
  Trash2,
  AlertTriangle,
  MessageSquare,
  ShieldCheck,
  Save,
  Check,
  RefreshCw,
  SlidersHorizontal,
  Home,
  Mail,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { FactoryResetDialog } from "@/components/data-reset-dialog";
import { StatementArchiveCard } from "@/components/statement-archive-card";
import { cn } from "@/lib/utils";
import { AiSpendingProfileSettingsCard } from "@/components/ai-spending-profile";

import { getMyProfile, updateMyProfile } from "@/lib/profile.functions";
import {
  getStatementWebEnrichmentCapability,
  setStatementWebEnrichmentConsent,
} from "@/lib/statement-pipeline.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Paisa" }] }),
  component: SettingsPage,
});

interface UserProfile {
  id?: string;
  display_name?: string | null;
  whatsapp_number?: string | null;
  whatsapp_reminders_enabled?: boolean | null;
  auto_approve_threshold?: number | null;
  statement_web_enrichment_consent_at?: string | null;
  email?: string | null;
}

function SettingsPage() {
  const qc = useQueryClient();
  const getFn = useServerFn(getMyProfile);
  const updFn = useServerFn(updateMyProfile);
  const capabilityFn = useServerFn(getStatementWebEnrichmentCapability);
  const consentFn = useServerFn(setStatementWebEnrichmentConsent);

  const { data } = useQuery({
    queryKey: ["me-profile"],
    queryFn: () => getFn(),
  });

  const profile = data as UserProfile | undefined;

  const { data: webCapability } = useQuery({
    queryKey: ["statement-web-enrichment-capability"],
    queryFn: () => capabilityFn(),
  });

  const { theme, setTheme } = useTheme();

  const [displayName, setDisplayName] = useState("");
  const [waNumber, setWaNumber] = useState("");
  const [waEnabled, setWaEnabled] = useState(false);
  const [autoApprovePercent, setAutoApprovePercent] = useState(80);
  const [resetOpen, setResetOpen] = useState(false);
  const [webConsent, setWebConsent] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? "");
      setWaNumber(profile.whatsapp_number ?? "");
      setWaEnabled(!!profile.whatsapp_reminders_enabled);
      setAutoApprovePercent(Math.round(Number(profile.auto_approve_threshold ?? 0.8) * 100));
      setWebConsent(!!profile.statement_web_enrichment_consent_at);
    }
  }, [profile]);

  const save = useMutation({
    mutationFn: async (
      customPatch?: {
        displayName?: string;
        waNumber?: string;
        waEnabled?: boolean;
        autoApprovePercent?: number;
      } | void,
    ) => {
      const nameToSave = customPatch?.displayName ?? displayName;
      const waNumToSave = customPatch?.waNumber ?? waNumber;
      const waEnabledToSave = customPatch?.waEnabled ?? waEnabled;
      const autoApproveToSave = customPatch?.autoApprovePercent ?? autoApprovePercent;

      return updFn({
        data: {
          display_name: nameToSave.trim() || undefined,
          whatsapp_number: waNumToSave.trim() || null,
          whatsapp_reminders_enabled: waEnabledToSave,
          auto_approve_threshold: autoApproveToSave / 100,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me-profile"] });
      toast.success("Settings saved successfully");
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Failed to save settings";
      toast.error(msg);
    },
  });

  const saveWebConsent = useMutation({
    mutationFn: (enabled: boolean) => consentFn({ data: { enabled } }),
    onSuccess: ({ enabled }) => {
      setWebConsent(enabled);
      qc.invalidateQueries({ queryKey: ["me-profile"] });
      toast.success(
        enabled ? "Merchant web-search consent enabled" : "Merchant web-search disabled",
      );
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Failed to update web-search consent";
      toast.error(msg);
    },
  });

  const initials = displayName
    ? displayName
        .split(" ")
        .map((p) => p[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "P";

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Hero Banner - Full Screen Width */}
      <div className="w-full relative overflow-hidden rounded-2xl border bg-gradient-to-br from-card via-card to-muted/40 p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary to-primary/70 text-primary-foreground font-display text-2xl font-bold shadow-md ring-4 ring-primary/10">
              {initials}
            </div>
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight truncate">
                  {displayName || "Your Account"}
                </h1>
                <Badge variant="secondary" className="font-normal text-xs gap-1 py-0.5">
                  <Home className="h-3 w-3 text-muted-foreground" />
                  Active Household
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground flex items-center gap-2 truncate">
                <Mail className="h-3.5 w-3.5" />
                {profile?.email ?? "Signed in user"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <Button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="gap-2 shadow-xs cursor-pointer min-w-32"
            >
              {save.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Modern Tabbed Settings - Full Screen Width */}
      <Tabs defaultValue="general" className="w-full space-y-6">
        <div className="w-full overflow-x-auto pb-1">
          <TabsList className="h-11 w-full justify-start p-1 bg-muted/60 border">
            <TabsTrigger
              value="general"
              className="gap-2 px-5 py-2 text-xs sm:text-sm cursor-pointer data-[state=active]:shadow-xs"
            >
              <User className="h-4 w-4" />
              General & Preferences
            </TabsTrigger>
            <TabsTrigger
              value="imports"
              className="gap-2 px-5 py-2 text-xs sm:text-sm cursor-pointer data-[state=active]:shadow-xs"
            >
              <Sparkles className="h-4 w-4" />
              Statement & AI
            </TabsTrigger>
            <TabsTrigger
              value="notifications"
              className="gap-2 px-5 py-2 text-xs sm:text-sm cursor-pointer data-[state=active]:shadow-xs"
            >
              <Bell className="h-4 w-4" />
              Notifications
            </TabsTrigger>
            <TabsTrigger
              value="archive"
              className="gap-2 px-5 py-2 text-xs sm:text-sm cursor-pointer data-[state=active]:shadow-xs"
            >
              <Archive className="h-4 w-4" />
              Statement Archive
            </TabsTrigger>
            <TabsTrigger
              value="data"
              className="gap-2 px-5 py-2 text-xs sm:text-sm cursor-pointer data-[state=active]:shadow-xs text-rose-600 dark:text-rose-400 data-[state=active]:text-rose-600"
            >
              <ShieldAlert className="h-4 w-4" />
              Data & Reset
            </TabsTrigger>
          </TabsList>
        </div>

        {/* 1. General Tab - 2 Column Grid on Desktop */}
        <TabsContent value="general" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
            {/* Column 1: Profile & Regional */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <User className="h-5 w-5 text-primary" />
                    Profile Information
                  </CardTitle>
                  <CardDescription>
                    Customize your display name and how your account appears across reports and
                    transactions.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="display-name" className="text-sm font-medium">
                      Display Name
                    </Label>
                    <Input
                      id="display-name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g. Anand Sharma"
                      className="w-full"
                    />
                    <p className="text-xs text-muted-foreground">
                      Visible on receipts, reports, and household sharing views.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Regional & Currency Defaults</CardTitle>
                  <CardDescription>
                    Default currency formatting applied to accounts and transactions.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between p-4 rounded-xl border bg-muted/20">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">Base Currency</p>
                      <p className="text-xs text-muted-foreground">Indian Rupee (INR) · Symbol ₹</p>
                    </div>
                    <Badge variant="outline" className="font-semibold text-xs px-3 py-1">
                      ₹ INR
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Column 2: Appearance & Theme */}
            <div className="space-y-6">
              <Card className="h-full flex flex-col justify-between">
                <div>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Sun className="h-5 w-5 text-amber-500" />
                      Appearance & Theme
                    </CardTitle>
                    <CardDescription>
                      Select your preferred color theme. The interface adjusts instantly.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                      {/* Light Theme Card */}
                      <button
                        type="button"
                        onClick={() => setTheme("light")}
                        className={cn(
                          "relative flex flex-col items-start rounded-xl border-2 p-4 text-left transition-all cursor-pointer hover:border-primary/50",
                          theme === "light"
                            ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-xs"
                            : "border-border bg-card hover:bg-muted/30",
                        )}
                      >
                        <div className="flex items-center justify-between w-full mb-3">
                          <div className="flex items-center gap-2 font-medium text-sm">
                            <Sun className="h-4 w-4 text-amber-500" />
                            <span>Light Theme</span>
                          </div>
                          {theme === "light" && (
                            <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                          )}
                        </div>
                        {/* Mock UI Preview */}
                        <div className="w-full rounded-lg border border-slate-200 bg-white p-3 space-y-2 shadow-xs">
                          <div className="h-2.5 w-16 rounded bg-slate-300" />
                          <div className="h-1.5 w-full rounded bg-slate-100" />
                          <div className="flex gap-2 pt-1">
                            <div className="h-3.5 w-10 rounded bg-emerald-100" />
                            <div className="h-3.5 w-10 rounded bg-blue-100" />
                          </div>
                        </div>
                      </button>

                      {/* Dark Theme Card */}
                      <button
                        type="button"
                        onClick={() => setTheme("dark")}
                        className={cn(
                          "relative flex flex-col items-start rounded-xl border-2 p-4 text-left transition-all cursor-pointer hover:border-primary/50",
                          theme === "dark"
                            ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-xs"
                            : "border-border bg-card hover:bg-muted/30",
                        )}
                      >
                        <div className="flex items-center justify-between w-full mb-3">
                          <div className="flex items-center gap-2 font-medium text-sm">
                            <Moon className="h-4 w-4 text-indigo-400" />
                            <span>Dark Theme</span>
                          </div>
                          {theme === "dark" && (
                            <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                          )}
                        </div>
                        {/* Mock UI Preview */}
                        <div className="w-full rounded-lg border border-slate-700 bg-slate-900 p-3 space-y-2 shadow-xs">
                          <div className="h-2.5 w-16 rounded bg-slate-700" />
                          <div className="h-1.5 w-full rounded bg-slate-800" />
                          <div className="flex gap-2 pt-1">
                            <div className="h-3.5 w-10 rounded bg-emerald-950" />
                            <div className="h-3.5 w-10 rounded bg-blue-950" />
                          </div>
                        </div>
                      </button>
                    </div>
                  </CardContent>
                </div>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* 2. Statement & AI Tab - 2 Column Grid on Desktop */}
        <TabsContent value="imports" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
            <AiSpendingProfileSettingsCard />
            {/* Categorization Confidence Threshold */}
            <Card className="flex flex-col justify-between">
              <div>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <SlidersHorizontal className="h-5 w-5 text-primary" />
                    Categorization Auto-Approve Threshold
                  </CardTitle>
                  <CardDescription>
                    Controls how confident the pattern and AI classifier must be before
                    automatically accepting categories during statement imports.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border bg-muted/20">
                    <div>
                      <p className="font-medium text-sm">Confidence Level Required</p>
                      <p className="text-xs text-muted-foreground">
                        Transactions scoring at or above this threshold skip manual payee review.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex min-w-16 items-center justify-center rounded-lg border bg-background px-3 py-1.5 text-base font-bold tabular-nums text-primary shadow-2xs">
                        {autoApprovePercent}%
                      </span>
                      <Badge variant={autoApprovePercent >= 85 ? "default" : "secondary"}>
                        {autoApprovePercent >= 90
                          ? "Conservative"
                          : autoApprovePercent >= 80
                            ? "Balanced"
                            : "Relaxed"}
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-4 w-full">
                    <Slider
                      id="auto-approve-threshold"
                      min={50}
                      max={100}
                      step={5}
                      value={[autoApprovePercent]}
                      onValueChange={(value) => setAutoApprovePercent(value[0] ?? 80)}
                      aria-label="Statement import auto-approve threshold"
                      className="cursor-pointer"
                    />

                    {/* Preset quick pills */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="text-xs text-muted-foreground mr-1">Quick Presets:</span>
                      <Button
                        type="button"
                        variant={autoApprovePercent === 70 ? "secondary" : "outline"}
                        size="sm"
                        className="h-7 text-xs rounded-full cursor-pointer"
                        onClick={() => setAutoApprovePercent(70)}
                      >
                        Relaxed (70%)
                      </Button>
                      <Button
                        type="button"
                        variant={autoApprovePercent === 80 ? "default" : "outline"}
                        size="sm"
                        className="h-7 text-xs rounded-full cursor-pointer"
                        onClick={() => setAutoApprovePercent(80)}
                      >
                        Recommended (80%)
                      </Button>
                      <Button
                        type="button"
                        variant={autoApprovePercent === 90 ? "secondary" : "outline"}
                        size="sm"
                        className="h-7 text-xs rounded-full cursor-pointer"
                        onClick={() => setAutoApprovePercent(90)}
                      >
                        Strict (90%)
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </div>
            </Card>

            {/* Merchant Web Identification */}
            <Card className="flex flex-col justify-between">
              <div>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Globe2 className="h-5 w-5 text-indigo-500" />
                    Merchant Web Identification
                  </CardTitle>
                  <CardDescription>
                    Optional Ollama Web Search for resolving ambiguous or cryptic merchant names
                    from bank statements into recognized brands.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border bg-card">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Label
                          htmlFor="merchant-web-consent"
                          className="text-sm font-semibold cursor-pointer"
                        >
                          Allow Sanitized Merchant Web Search
                        </Label>
                        <Badge
                          variant={webCapability?.enabled ? "outline" : "secondary"}
                          className="text-xs"
                        >
                          {webCapability?.enabled ? "Available (Shadow Mode)" : "API Key Not Found"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Queries are strictly sanitized: account numbers, cards, phone numbers, VPAs,
                        amounts, dates, and names are stripped before search.
                      </p>
                    </div>
                    <Switch
                      id="merchant-web-consent"
                      checked={webConsent}
                      disabled={
                        (!webCapability?.enabled && !webConsent) || saveWebConsent.isPending
                      }
                      onCheckedChange={(enabled) => saveWebConsent.mutate(enabled)}
                      className="cursor-pointer shrink-0"
                    />
                  </div>

                  {/* Privacy Guarantee Box */}
                  <div className="flex items-start gap-3 p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-950 dark:text-emerald-200">
                    <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div className="space-y-0.5 text-xs">
                      <p className="font-semibold text-emerald-800 dark:text-emerald-300">
                        Privacy Guarantee
                      </p>
                      <p className="text-emerald-700/90 dark:text-emerald-400">
                        Raw banking descriptions never leave your machine. Search queries contain
                        solely isolated merchant tokens (e.g. &quot;Swiggy Bangalore&quot; or
                        &quot;Zomato Media&quot;) to identify the category.
                      </p>
                    </div>
                  </div>

                  {!webCapability?.enabled && webConsent && (
                    <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
                      Consent is active, but live web queries are paused until{" "}
                      <code className="font-mono text-xs">OLLAMA_API_KEY</code> is configured in
                      your environment.
                    </p>
                  )}
                </CardContent>
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* 3. Notifications Tab - Full Width */}
        <TabsContent value="notifications" className="space-y-6">
          <Card className="w-full">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-emerald-600" />
                WhatsApp Bill Reminders
              </CardTitle>
              <CardDescription>
                Receive automated reminder alerts on WhatsApp before your upcoming utility, credit
                card, and recurring bill due dates.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border bg-muted/20">
                <div className="space-y-0.5">
                  <Label htmlFor="wa-enabled" className="text-sm font-semibold cursor-pointer">
                    Enable WhatsApp Reminders
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Master toggle for all household bill alerts.
                  </p>
                </div>
                <Switch
                  id="wa-enabled"
                  checked={waEnabled}
                  onCheckedChange={setWaEnabled}
                  className="cursor-pointer"
                />
              </div>

              <div className="space-y-2 max-w-xl">
                <Label htmlFor="wa-number" className="text-sm font-medium">
                  Recipient WhatsApp Number
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="wa-number"
                    value={waNumber}
                    onChange={(e) => setWaNumber(e.target.value)}
                    placeholder="+91 98765 43210"
                    disabled={!waEnabled}
                    className="font-mono max-w-md"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Always include the country code prefix (e.g.{" "}
                  <code className="font-mono text-xs">+91</code> for India). Individual bills can
                  also specify a custom recipient.
                </p>
              </div>

              {waEnabled && (
                <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 p-3.5 rounded-xl border border-emerald-500/20">
                  <Check className="h-4 w-4 shrink-0" />
                  <span>
                    Reminders are active. Paisa sends alerts on each configured reminder schedule
                    prior to bill due dates.
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 4. Statement Archive Tab - Full Screen Width */}
        <TabsContent value="archive" className="space-y-6 w-full">
          <div className="w-full">
            <StatementArchiveCard />
          </div>
        </TabsContent>

        {/* 5. Data & Danger Zone Tab - Full Width */}
        <TabsContent value="data" className="space-y-6 w-full">
          <Card className="w-full border-destructive/40 shadow-xs">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Danger Zone & Data Reset
              </CardTitle>
              <CardDescription>
                Permanently purge accounts, transactions, imported statements, and categories. This
                action cannot be reversed.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl border border-destructive/20 bg-destructive/5">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-destructive">
                    Factory Reset Household Data
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Selectively or completely clear all transactional data, memorized payees, and
                    statement uploads to start with a clean slate.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  onClick={() => setResetOpen(true)}
                  className="shrink-0 gap-2 cursor-pointer shadow-xs"
                >
                  <Trash2 className="h-4 w-4" />
                  Erase Data...
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Factory Reset Modal */}
      <FactoryResetDialog open={resetOpen} onOpenChange={setResetOpen} />
    </div>
  );
}
