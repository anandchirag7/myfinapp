import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BrainCircuit, ChevronLeft, ChevronRight, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  dismissAiSpendingProfileOnboarding,
  getAiSpendingProfile,
  saveAiSpendingProfile,
} from "@/lib/ai-spending-profile.functions";
import {
  EMPTY_AI_SPENDING_PROFILE,
  normalizeAiSpendingProfile,
  type AiSpendingCategoryMapping,
  type AiSpendingIncomeSource,
  type AiSpendingProfile,
  type SpendingUsageContext,
} from "@/lib/ai-spending-profile";

type Category = { id: string; name: string; kind: string; parent_id: string | null };
type ProfileResponse = {
  status: "pending" | "completed" | "dismissed";
  profile: AiSpendingProfile;
  categories: Category[];
};

const QUERY_KEY = ["ai-spending-profile"] as const;
const STEPS = ["About your spending", "Income", "Merchants", "Safety"];

function CategoryPicker({
  value,
  categories,
  onChange,
  kind,
}: {
  value: string;
  categories: Category[];
  onChange: (value: string) => void;
  kind?: "income" | "expense";
}) {
  const options = categories.filter((category) => !kind || category.kind === kind);
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 min-w-44 rounded-md border border-input bg-background px-3 text-sm"
      aria-label="Category"
    >
      <option value="">Choose category</option>
      {options.map((category) => (
        <option key={category.id} value={category.id}>
          {category.name}
        </option>
      ))}
    </select>
  );
}

function MappingRows({
  rows,
  categories,
  label,
  placeholder,
  kind,
  onChange,
}: {
  rows: AiSpendingCategoryMapping[];
  categories: Category[];
  label: string;
  placeholder: string;
  kind?: "income" | "expense";
  onChange: (rows: AiSpendingCategoryMapping[]) => void;
}) {
  const update = (index: number, patch: Partial<AiSpendingCategoryMapping>) =>
    onChange(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Label>{label}</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...rows, { merchant: "", categoryId: "" }])}
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Add
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Optional. Add only merchants you can categorize consistently.
        </p>
      ) : (
        rows.map((row, index) => (
          <div key={`${index}-${row.merchant}`} className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={row.merchant}
              onChange={(event) => update(index, { merchant: event.target.value })}
              placeholder={placeholder}
              maxLength={120}
            />
            <CategoryPicker
              value={row.categoryId}
              categories={categories}
              kind={kind}
              onChange={(categoryId) => update(index, { categoryId })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove ${row.merchant || "mapping"}`}
              onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))
      )}
    </div>
  );
}

function ProfileEditor({ data, onboarding }: { data: ProfileResponse; onboarding: boolean }) {
  const queryClient = useQueryClient();
  const saveFn = useServerFn(saveAiSpendingProfile);
  const dismissFn = useServerFn(dismissAiSpendingProfileOnboarding);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<AiSpendingProfile>(() =>
    normalizeAiSpendingProfile(data.profile),
  );
  const [members, setMembers] = useState(data.profile.householdMembers.join(", "));
  const [accounts, setAccounts] = useState(data.profile.ownAccountLabels.join(", "));

  useEffect(() => {
    const profile = normalizeAiSpendingProfile(data.profile);
    setDraft(profile);
    setMembers(profile.householdMembers.join(", "));
    setAccounts(profile.ownAccountLabels.join(", "));
  }, [data.profile]);

  const materializeDraft = () =>
    normalizeAiSpendingProfile({
      ...draft,
      householdMembers: members.split(","),
      ownAccountLabels: accounts.split(","),
    });

  const save = useMutation({
    mutationFn: () => saveFn({ data: { profile: materializeDraft() } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success("AI Spending Profile saved");
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not save AI Spending Profile"),
  });
  const dismiss = useMutation({
    mutationFn: () => dismissFn(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not dismiss onboarding"),
  });

  const incomeRows: AiSpendingCategoryMapping[] = draft.incomeSources.map((row) => ({
    merchant: row.name,
    categoryId: row.categoryId,
  }));
  const content = [
    <div key="context" className="space-y-5">
      <div className="space-y-2">
        <Label>How are these accounts mainly used?</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(["personal", "household", "business", "mixed"] as SpendingUsageContext[]).map(
            (usage) => (
              <Button
                key={usage}
                type="button"
                variant={draft.usageContext === usage ? "default" : "outline"}
                className="capitalize"
                onClick={() => setDraft({ ...draft, usageContext: usage })}
              >
                {usage}
              </Button>
            ),
          )}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="ai-household-members">Household member names</Label>
        <Textarea
          id="ai-household-members"
          value={members}
          onChange={(event) => setMembers(event.target.value)}
          placeholder="Anand Sharma, Priya Sharma"
        />
        <p className="text-xs text-muted-foreground">
          Comma-separated. Used only to recognize people and likely own-account transfers.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="ai-own-accounts">Your account labels</Label>
        <Textarea
          id="ai-own-accounts"
          value={accounts}
          onChange={(event) => setAccounts(event.target.value)}
          placeholder="HDFC Salary, SBI Savings"
        />
      </div>
    </div>,
    <MappingRows
      key="income"
      rows={incomeRows}
      categories={data.categories}
      kind="income"
      label="Known salary and income sources"
      placeholder="Acme Payroll"
      onChange={(rows) =>
        setDraft({
          ...draft,
          incomeSources: rows.map((row): AiSpendingIncomeSource => ({
            name: row.merchant,
            categoryId: row.categoryId,
          })),
        })
      }
    />,
    <div key="merchants" className="space-y-7">
      <MappingRows
        rows={draft.merchantMappings}
        categories={data.categories}
        kind="expense"
        label="Frequent merchants"
        placeholder="Swiggy"
        onChange={(merchantMappings) => setDraft({ ...draft, merchantMappings })}
      />
      <MappingRows
        rows={draft.recurringPayments}
        categories={data.categories}
        label="Recurring payments"
        placeholder="Netflix"
        onChange={(recurringPayments) => setDraft({ ...draft, recurringPayments })}
      />
    </div>,
    <div key="safety" className="space-y-6">
      <div className="flex items-start justify-between gap-5 rounded-xl border p-4">
        <div>
          <Label htmlFor="ai-p2p-review">Review person-to-person payments</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Recommended because a person’s name alone rarely reveals why money was sent.
          </p>
        </div>
        <Switch
          id="ai-p2p-review"
          checked={draft.requireP2PReview}
          onCheckedChange={(requireP2PReview) => setDraft({ ...draft, requireP2PReview })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ai-guarded-categories">Categories that always require review</Label>
        <select
          id="ai-guarded-categories"
          multiple
          value={draft.neverAutoAssignCategoryIds}
          onChange={(event) =>
            setDraft({
              ...draft,
              neverAutoAssignCategoryIds: Array.from(
                event.target.selectedOptions,
                (option) => option.value,
              ),
            })
          }
          className="min-h-36 w-full rounded-md border border-input bg-background p-2 text-sm"
        >
          {data.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Use Ctrl/Cmd to select more than one category.
        </p>
      </div>
      <div className="flex gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <p>
          Exact mappings become household rules. General context is sanitized and bounded before it
          reaches the local classifier.
        </p>
      </div>
    </div>,
  ];

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{STEPS[step]}</span>
          <span>
            {step + 1} of {STEPS.length}
          </span>
        </div>
        <Progress value={((step + 1) / STEPS.length) * 100} />
      </div>
      <div className="min-h-72">{content[step]}</div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <div>
          {onboarding && (
            <Button
              type="button"
              variant="ghost"
              disabled={dismiss.isPending}
              onClick={() => dismiss.mutate()}
            >
              Skip for now
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={step === 0}
            onClick={() => setStep((value) => value - 1)}
          >
            <ChevronLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={() => setStep((value) => value + 1)}>
              Next <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? "Saving…" : "Save profile"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function useProfileQuery() {
  const getFn = useServerFn(getAiSpendingProfile);
  return useQuery({ queryKey: QUERY_KEY, queryFn: () => getFn() as Promise<ProfileResponse> });
}

export function AiSpendingProfileOnboarding() {
  const { data } = useProfileQuery();
  const open = data?.status === "pending";
  return (
    <Dialog open={open} onOpenChange={() => undefined}>
      <DialogContent
        className="max-h-[92vh] overflow-y-auto sm:max-w-3xl"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BrainCircuit className="h-5 w-5 text-primary" /> Help Paisa understand your spending
          </DialogTitle>
          <DialogDescription>
            A few optional answers improve merchant normalization and category accuracy for this
            household.
          </DialogDescription>
        </DialogHeader>
        {data ? <ProfileEditor data={data} onboarding /> : null}
      </DialogContent>
    </Dialog>
  );
}

export function AiSpendingProfileSettingsCard() {
  const { data, isLoading } = useProfileQuery();
  const safeData: ProfileResponse = data ?? {
    status: "pending",
    profile: EMPTY_AI_SPENDING_PROFILE,
    categories: [],
  };
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <BrainCircuit className="h-5 w-5 text-primary" /> AI Spending Profile
        </CardTitle>
        <CardDescription>
          Teach the household classifier about your income sources, common merchants, recurring
          payments, and review preferences.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading profile…</p>
        ) : (
          <ProfileEditor data={safeData} onboarding={false} />
        )}
      </CardContent>
    </Card>
  );
}
