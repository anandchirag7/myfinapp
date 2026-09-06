import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Loader2, Pencil, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CategorySelectPopover } from "@/components/category-select-popover";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getTransactionDetail, findMerchantMemoryCandidates, updateTransactionComplete } from "@/lib/transactions.functions";
import { listAccounts, listCategories } from "@/lib/finance.functions";
import { queryKeys } from "@/lib/query-keys";
import {
  buildTransactionEditPatch,
  isMeaningfulMerchantChange,
  normalizeTags,
  transactionToEditValues,
  validateTransactionEdit,
  type MerchantMemoryAction,
  type TransactionEditValues,
} from "@/lib/transaction-edit";
import { cn } from "@/lib/utils";

type Candidate = {
  id: string;
  merchant: string;
  aliases?: string[];
  locked?: boolean;
  match: "new_exact" | "old_exact" | "alias" | "pattern";
};

export function TransactionEditDialog({
  open,
  onOpenChange,
  transactionId,
  onSuccess,
  onEditSplit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactionId: string | null;
  onSuccess?: (result: any) => void;
  onEditSplit?: () => void;
}) {
  const qc = useQueryClient();
  const detailFn = useServerFn(getTransactionDetail);
  const accountsFn = useServerFn(listAccounts);
  const categoriesFn = useServerFn(listCategories);
  const candidatesFn = useServerFn(findMerchantMemoryCandidates);
  const updateFn = useServerFn(updateTransactionComplete);

  const detailQuery = useQuery({
    queryKey: transactionId ? queryKeys.transactions.detail(transactionId) : ["transactions", "detail", "closed"],
    queryFn: () => detailFn({ data: { id: transactionId! } }),
    enabled: open && !!transactionId,
  });
  const accountsQuery = useQuery({ queryKey: queryKeys.accounts.all, queryFn: () => accountsFn(), enabled: open });
  const categoriesQuery = useQuery({ queryKey: queryKeys.categories.all, queryFn: () => categoriesFn(), enabled: open });

  const txn = (detailQuery.data as any)?.txn ?? null;
  const splitChildren = ((detailQuery.data as any)?.children ?? []) as any[];
  const [original, setOriginal] = useState<TransactionEditValues | null>(null);
  const [values, setValues] = useState<TransactionEditValues | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState("");
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [candidateData, setCandidateData] = useState<any>(null);
  const [memoryAction, setMemoryAction] = useState<MerchantMemoryAction>("transaction_only");
  const [payeeId, setPayeeId] = useState<string | null>(null);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [saveAttempted, setSaveAttempted] = useState(false);

  useEffect(() => {
    if (!txn) return;
    const next = transactionToEditValues(txn);
    setOriginal(next);
    setValues(next);
    setErrors({});
    setSaveError("");
    setDecisionOpen(false);
    setCandidateData(null);
    setSaveAttempted(false);
  }, [txn?.id, txn?.updated_at]);

  const accounts = (accountsQuery.data ?? []) as any[];
  const categories = (categoriesQuery.data ?? []) as any[];
  const selectedCategory = categories.find((category) => category.id === values?.category_id);
  const relevantCategories = useMemo(() => {
    if (!values) return [];
    return categories.filter((category) => {
      if (category.id === values.category_id) return true;
      return values.type === "income" ? category.kind === "income" : category.kind === "expense" || category.kind === "investment";
    });
  }, [categories, values?.type, values?.category_id]);
  const financialLocked = !!txn?.split_parent_id || splitChildren.length > 0;

  const setField = <K extends keyof TransactionEditValues>(key: K, value: TransactionEditValues[K]) => {
    setValues((current) => current ? { ...current, [key]: value } : current);
    setErrors((current) => ({ ...current, [key]: "" }));
    setSaveError("");
  };

  const invalidate = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.transactions.all }),
      qc.invalidateQueries({ queryKey: queryKeys.accounts.all }),
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.all }),
      qc.invalidateQueries({ queryKey: queryKeys.reports.all }),
      qc.invalidateQueries({ queryKey: ["acct-txns"] }),
      qc.invalidateQueries({ queryKey: ["payees"] }),
      qc.invalidateQueries({ queryKey: ["payee-transactions"] }),
      transactionId ? qc.invalidateQueries({ queryKey: queryKeys.transactions.detail(transactionId) }) : Promise.resolve(),
      transactionId ? qc.invalidateQueries({ queryKey: ["txn-detail", transactionId] }) : Promise.resolve(),
    ]);
  };

  const updateMutation = useMutation({
    onMutate: () => {
      setSaveAttempted(true);
      setSaveError("");
    },
    mutationFn: (memory: { action: MerchantMemoryAction; payee_id?: string }) => {
      if (!txn || !original || !values) throw new Error("Transaction details are not ready.");
      return updateFn({
        data: {
          id: txn.id,
          expected_updated_at: txn.updated_at,
          patch: buildTransactionEditPatch(original, values),
          merchant_memory: memory,
        },
      });
    },
    onSuccess: async (result: any) => {
      await invalidate();
      const action = result?.merchant_memory_action;
      toast.success(action === "create_payee" ? "Transaction updated and memorized payee created"
        : action === "update_payee" ? "Transaction and memorized payee updated"
        : action === "use_existing_payee" ? "Transaction updated and linked to existing payee memory"
        : "Transaction updated");
      setDecisionOpen(false);
      onOpenChange(false);
      onSuccess?.(result);
    },
    onError: (error: any) => {
      const message = error?.message ?? "Transaction update failed.";
      setSaveError(message);
      toast.error(message);
    },
  });

  const submitWithMemory = (action: MerchantMemoryAction, selectedPayeeId?: string | null) => {
    setSaveError("");
    if ((action === "update_payee" || action === "use_existing_payee") && !selectedPayeeId) {
      setSaveError("Select a memorized payee.");
      return;
    }
    updateMutation.mutate({ action, payee_id: selectedPayeeId ?? undefined });
  };

  const beginSave = async () => {
    if (!txn || !original || !values) return;
    const nextErrors = validateTransactionEdit(values, selectedCategory?.kind);
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      toast.error("Please correct the highlighted fields before saving.");
      return;
    }
    const patch = buildTransactionEditPatch(original, values);
    if (Object.keys(patch).length === 0) {
      toast.info("No changes to save");
      onOpenChange(false);
      return;
    }
    if (!isMeaningfulMerchantChange(original.merchant, values.merchant)) {
      submitWithMemory("transaction_only");
      return;
    }

    setCandidateLoading(true);
    setSaveError("");
    try {
      const result = await candidatesFn({ data: { transactionId: txn.id, newMerchant: values.merchant.trim() } });
      setCandidateData(result);
      const exactNew = (result as any)?.exactNewPayeeId as string | null;
      const exactOld = (result as any)?.exactOldPayeeId as string | null;
      if (exactNew) { setMemoryAction("use_existing_payee"); setPayeeId(exactNew); }
      else if (exactOld) { setMemoryAction("update_payee"); setPayeeId(exactOld); }
      else { setMemoryAction("create_payee"); setPayeeId(null); }
      setDecisionOpen(true);
    } catch (error: any) {
      const message = error?.message ?? "Could not check memorized payees.";
      setSaveError(message);
      toast.error(message);
    } finally {
      setCandidateLoading(false);
    }
  };

  const candidates = ((candidateData?.candidates ?? []) as Candidate[]);
  const selectedCandidate = candidates.find((candidate) => candidate.id === payeeId);
  const busy = updateMutation.isPending || candidateLoading;

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
        <DialogContent className="flex max-h-[94vh] w-[96vw] max-w-3xl flex-col overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle className="flex items-center gap-2"><Pencil className="h-4 w-4" /> Edit transaction</DialogTitle>
            <DialogDescription>Update transaction details. Financial changes recalculate every affected account.</DialogDescription>
          </DialogHeader>

          {detailQuery.isLoading || !values ? (
            <div className="grid min-h-72 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : detailQuery.isError || !txn ? (
            <div className="p-6 text-sm text-destructive">Unable to load this transaction.</div>
          ) : (
            <ScrollArea className="flex-1 px-6">
              <div className="space-y-6 py-5">
                {financialLocked && (
                  <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium">Split transaction financial fields are locked</p>
                      <p className="text-xs opacity-80">Use the split editor for amount, type, account, or category allocation. Descriptions and status fields remain editable.</p>
                      {onEditSplit && <Button type="button" size="sm" variant="outline" className="mt-2" onClick={onEditSplit}>Edit split</Button>}
                    </div>
                  </div>
                )}

                <section className="space-y-3">
                  <h3 className="text-sm font-semibold">Type and amount</h3>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Transaction type" error={errors.type}>
                      <Select value={values.type} disabled={financialLocked} onValueChange={(type: any) => setField("type", type)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="expense">Expense</SelectItem><SelectItem value="income">Income</SelectItem><SelectItem value="transfer">Transfer</SelectItem></SelectContent>
                      </Select>
                    </Field>
                    <Field label="Amount" error={errors.amount}>
                      <Input type="number" min="0.01" step="0.01" disabled={financialLocked} value={values.amount} onChange={(event) => setField("amount", event.target.value)} />
                    </Field>
                    <Field label="Date" error={errors.txn_date}>
                      <Input type="date" value={values.txn_date} onChange={(event) => setField("txn_date", event.target.value)} />
                    </Field>
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-sm font-semibold">Accounts and category</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={values.type === "transfer" ? "From account" : "Account"} error={errors.account_id}>
                      <Select value={values.account_id} disabled={financialLocked} onValueChange={(value) => setField("account_id", value)}>
                        <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                        <SelectContent>{accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </Field>
                    {values.type === "transfer" ? (
                      <Field label="To account" error={errors.transfer_account_id}>
                        <Select value={values.transfer_account_id ?? "none"} disabled={financialLocked} onValueChange={(value) => setField("transfer_account_id", value === "none" ? null : value)}>
                          <SelectTrigger><SelectValue placeholder="Select destination" /></SelectTrigger>
                          <SelectContent><SelectItem value="none">Select destination</SelectItem>{accounts.filter((account) => account.id !== values.account_id).map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </Field>
                    ) : (
                      <Field label="Category" error={errors.category_id}>
                        <CategorySelectPopover
                          categories={relevantCategories}
                          value={values.category_id}
                          onChange={(value) => setField("category_id", value)}
                          allowedCreateKinds={values.type === "income" ? ["income"] : ["expense", "investment"]}
                          defaultCreateKind={values.type === "income" ? "income" : "expense"}
                          className="h-8"
                          disabled={financialLocked}
                        />
                      </Field>
                    )}
                  </div>
                  {values.type !== original?.type && (
                    <p className="text-xs text-amber-700 dark:text-amber-300">Changing transaction type will clear fields that do not apply: transfers clear Category; income/expense clears To account.</p>
                  )}
                </section>

                <section className="space-y-3">
                  <h3 className="text-sm font-semibold">Merchant and description</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Merchant / payee" error={errors.merchant}><Input value={values.merchant} maxLength={200} onChange={(event) => setField("merchant", event.target.value)} /></Field>
                    <Field label="Memo" error={errors.memo}><Input value={values.memo} maxLength={500} onChange={(event) => setField("memo", event.target.value)} /></Field>
                    <Field label="Note" error={errors.note} className="sm:col-span-2"><Textarea rows={3} value={values.note} maxLength={1000} onChange={(event) => setField("note", event.target.value)} /></Field>
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-sm font-semibold">Payment metadata</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Payment method"><Input value={values.payment_method} maxLength={80} onChange={(event) => setField("payment_method", event.target.value)} /></Field>
                    <Field label="Check / reference number"><Input value={values.check_number} maxLength={40} onChange={(event) => setField("check_number", event.target.value)} /></Field>
                    <Field label="Tags (comma separated)"><Input value={values.tags.join(", ")} onChange={(event) => setField("tags", normalizeTags(event.target.value.split(",")))} /></Field>
                    <Field label="Tax code"><Input value={values.tax_code} maxLength={80} onChange={(event) => setField("tax_code", event.target.value)} /></Field>
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-sm font-semibold">Status</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Cleared status">
                      <Select value={values.cleared_status} onValueChange={(value: any) => setField("cleared_status", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">Pending</SelectItem><SelectItem value="cleared">Cleared</SelectItem><SelectItem value="reconciled">Reconciled</SelectItem></SelectContent></Select>
                    </Field>
                    <div className="grid grid-cols-3 gap-2 pt-6">
                      <CheckField label="Reviewed" checked={values.is_reviewed} onChange={(checked) => setField("is_reviewed", checked)} />
                      <CheckField label="Flagged" checked={values.is_flagged} onChange={(checked) => setField("is_flagged", checked)} />
                      <CheckField label="Favorite" checked={values.is_favorite} onChange={(checked) => setField("is_favorite", checked)} />
                    </div>
                  </div>
                </section>

                <section className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                  <div className="grid gap-1 sm:grid-cols-2">
                    <span>Transaction ID: <span className="font-mono">{txn.id}</span></span>
                    <span>Created: {txn.created_at ? new Date(txn.created_at).toLocaleString() : "—"}</span>
                    <span>Last updated: {txn.updated_at ? new Date(txn.updated_at).toLocaleString() : "—"}</span>
                    <span>Source: {txn.import_batch_id ? "Statement import" : "Manual / other"}</span>
                  </div>
                </section>
                {saveError && <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{saveError}</div>}
              </div>
            </ScrollArea>
          )}

          <DialogFooter className="border-t bg-background px-6 py-4">
            <div className="mr-auto min-h-5 text-xs" aria-live="polite">
              {candidateLoading && <span className="text-muted-foreground">Checking memorized payees…</span>}
              {updateMutation.isPending && <span className="text-muted-foreground">Saving transaction and refreshing balances…</span>}
              {saveAttempted && saveError && <span className="text-destructive">Save failed — see the error above.</span>}
            </div>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            {saveError.includes("changed after you opened") && <Button variant="outline" onClick={() => detailQuery.refetch()}>Reload latest</Button>}
            <Button onClick={beginSave} disabled={busy || !values || !txn}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {candidateLoading ? "Checking…" : updateMutation.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={decisionOpen} onOpenChange={(next) => !updateMutation.isPending && setDecisionOpen(next)}>
        <DialogContent className="max-h-[90vh] w-[94vw] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Remember this merchant change?</DialogTitle>
            <DialogDescription>
              This transaction will change from <strong>{original?.merchant || "no merchant"}</strong> to <strong>{values?.merchant.trim()}</strong>. Choose how future matching should behave.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <MemoryOption selected={memoryAction === "transaction_only"} onSelect={() => { setMemoryAction("transaction_only"); setPayeeId(null); }} title="Update this transaction only" detail="Do not change memorized payees or future matching." />
            {candidateData?.exactNewPayeeId && (
              <MemoryOption selected={memoryAction === "use_existing_payee"} onSelect={() => { setMemoryAction("use_existing_payee"); setPayeeId(candidateData.exactNewPayeeId); }} title="Use the existing payee with this name" detail="Add this transaction pattern to the existing payee without replacing its defaults." />
            )}
            {candidates.filter((candidate) => candidate.id !== candidateData?.exactNewPayeeId).map((candidate) => (
              <MemoryOption key={candidate.id} selected={memoryAction === "update_payee" && payeeId === candidate.id} disabled={candidate.locked} onSelect={() => { setMemoryAction("update_payee"); setPayeeId(candidate.id); }} title={`Update memorized payee: ${candidate.merchant}`} detail={candidate.locked ? "This payee is locked." : "Rename it and preserve the old name as an alias. Existing settings and rules remain unchanged."} />
            ))}
            {!candidateData?.exactNewPayeeId && (
              <MemoryOption selected={memoryAction === "create_payee"} onSelect={() => { setMemoryAction("create_payee"); setPayeeId(null); }} title="Add as a new memorized payee" detail="Use this transaction's type and category as conservative defaults for future matches." />
            )}
          </div>
          {selectedCandidate && <p className="text-xs text-muted-foreground">Selected payee: {selectedCandidate.merchant}</p>}
          {saveError && <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{saveError}</div>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDecisionOpen(false)} disabled={updateMutation.isPending}>Back to edit</Button>
            <Button onClick={() => submitWithMemory(memoryAction, payeeId)} disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Confirm and save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, error, className, children }: { label: string; error?: string; className?: string; children: React.ReactNode }) {
  return <div className={cn("space-y-1.5", className)}><Label>{label}</Label>{children}{error && <p className="text-xs text-destructive">{error}</p>}</div>;
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex cursor-pointer items-center gap-2 text-xs"><Checkbox checked={checked} onCheckedChange={(value) => onChange(!!value)} />{label}</label>;
}

function MemoryOption({ selected, disabled, onSelect, title, detail }: { selected: boolean; disabled?: boolean; onSelect: () => void; title: string; detail: string }) {
  return (
    <button type="button" disabled={disabled} onClick={onSelect} className={cn("w-full rounded-lg border p-3 text-left transition", selected && "border-primary bg-primary/5 ring-1 ring-primary", disabled && "cursor-not-allowed opacity-50")}>
      <span className="flex items-start gap-3"><span className={cn("mt-0.5 h-4 w-4 shrink-0 rounded-full border", selected && "border-[5px] border-primary")} /><span><span className="block text-sm font-medium">{title}</span><span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span></span></span>
    </button>
  );
}
