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
import { AlertTriangle, Trash2 } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { FactoryResetDialog } from "@/components/data-reset-dialog";
import { StatementArchiveCard } from "@/components/statement-archive-card";

import { getMyProfile, updateMyProfile } from "@/lib/profile.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Paisa" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const getFn = useServerFn(getMyProfile);
  const updFn = useServerFn(updateMyProfile);
  const { data } = useQuery({ queryKey: ["me-profile"], queryFn: () => getFn() });
  const { theme, toggle } = useTheme();

  const [waNumber, setWaNumber] = useState("");
  const [waEnabled, setWaEnabled] = useState(false);
  const [autoApprovePercent, setAutoApprovePercent] = useState(80);
  const [resetOpen, setResetOpen] = useState(false);

  useEffect(() => {
    if (data) {
      setWaNumber((data as any).whatsapp_number ?? "");
      setWaEnabled(!!(data as any).whatsapp_reminders_enabled);
      setAutoApprovePercent(Math.round(Number((data as any).auto_approve_threshold ?? 0.8) * 100));
    }
  }, [data]);

  const save = useMutation({
    mutationFn: async () =>
      updFn({
        data: {
          whatsapp_number: waNumber.trim() || null,
          whatsapp_reminders_enabled: waEnabled,
          auto_approve_threshold: autoApprovePercent / 100,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me-profile"] });
      toast.success("Settings saved");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as {(data as any)?.display_name ?? "you"}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Switch between light and dark.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <Label htmlFor="dark">Dark mode</Label>
          <Switch id="dark" checked={theme === "dark"} onCheckedChange={toggle} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Statement import</CardTitle>
          <CardDescription>
            Choose how confident the categorization pipeline must be before it skips payee
            confirmation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="auto-approve-threshold">Auto-approve threshold</Label>
              <p className="text-xs text-muted-foreground">
                Higher values show the confirmation screen more often. The recommended default is
                80%.
              </p>
            </div>
            <span className="min-w-12 rounded-md border bg-muted/40 px-2 py-1 text-center text-sm font-semibold tabular-nums">
              {autoApprovePercent}%
            </span>
          </div>
          <Slider
            id="auto-approve-threshold"
            min={0}
            max={100}
            step={5}
            value={[autoApprovePercent]}
            onValueChange={(value) => setAutoApprovePercent(value[0] ?? 80)}
            aria-label="Statement import auto-approve threshold"
          />
          <div className="flex justify-end">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Savingâ€¦" : "Save import setting"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>WhatsApp reminders</CardTitle>
          <CardDescription>
            Get a WhatsApp message on each configured reminder day for your bills. Individual bills
            can override this number.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="wa-enabled">Enable WhatsApp reminders</Label>
              <p className="text-xs text-muted-foreground">Master switch for all your bills.</p>
            </div>
            <Switch id="wa-enabled" checked={waEnabled} onCheckedChange={setWaEnabled} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wa-number">WhatsApp number</Label>
            <Input
              id="wa-number"
              value={waNumber}
              onChange={(e) => setWaNumber(e.target.value)}
              placeholder="+91 98xxxxxxxx"
            />
            <p className="text-xs text-muted-foreground">
              Include the country code. This is the default recipient.
            </p>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <StatementArchiveCard />

      <Card>
        <CardHeader>
          <CardTitle>Privacy</CardTitle>
          <CardDescription>App-lock and biometric protection.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            App-lock PIN and biometric unlock arrive with the mobile-polish pass.
          </p>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" /> Danger zone
          </CardTitle>
          <CardDescription>
            Delete your data — accounts, transactions, bills, reminders, budgets and more. You
            choose exactly what gets erased. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Factory reset removes everything and gives you a clean slate.
          </p>
          <Button variant="destructive" onClick={() => setResetOpen(true)}>
            <Trash2 className="mr-1.5 h-4 w-4" /> Delete data
          </Button>
        </CardContent>
      </Card>

      <FactoryResetDialog open={resetOpen} onOpenChange={setResetOpen} />
    </div>
  );
}
