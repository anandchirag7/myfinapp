// ---------------------------------------------------------------------------
// Investments — add / edit a ledger entry for one holding
//
// The ledger is the source of truth: quantity, average cost, realised gain and
// XIRR are all replayed from these rows (FIFO). The nine kinds behave very
// differently, so this dialog reshapes itself per kind rather than showing one
// generic quantity/price form:
//
//   buy / sip / contribution   units in,  cost = qty x price + fees
//   sell / withdrawal          units out, matched FIFO against the oldest lots
//   dividend / interest        cash only, no unit change  -> Amount field
//   bonus                      free units at zero cost    -> Quantity only
//   split                      restates units by a ratio  -> Ratio only
//
// The server re-validates all of this (buildTxnRow in investments.functions.ts);
// the checks here exist so the user finds out before a round trip.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatINR } from "@/lib/format";
import {
  TXN_KINDS,
  TXN_KIND_HINTS,
  TXN_KIND_LABELS,
  addsUnits,
  isCashOnlyKind,
  removesUnits,
  unitsLabelFor,
  type TxnKind,
} from "@/lib/investments-types";
import { upsertHoldingTransaction } from "@/lib/investments.functions";

function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function HoldingTxnDialog({
  open,
  onOpenChange,
  holdingId,
  holdingLabel,
  assetClass,
  unitsLabel,
  initial,
  defaultKind = "buy",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  holdingId: string;
  holdingLabel?: string;
  assetClass?: string;
  /** Overrides the asset-class default ("units" / "shares" / "grams"). */
  unitsLabel?: string | null;
  /** A HoldingTxn when editing. */
  initial?: any;
  defaultKind?: TxnKind;
}) {
  const isEdit = !!initial?.id;

  const [kind, setKind] = useState<TxnKind>((initial?.kind as TxnKind) ?? defaultKind);
  const [txnDate, setTxnDate] = useState<string>(initial?.txn_date?.slice(0, 10) ?? todayISO());
  const [quantity, setQuantity] = useState<string>(
    initial?.quantity == null ? "" : String(initial.quantity),
  );
  const [price, setPrice] = useState<string>(initial?.price == null ? "" : String(initial.price));
  const [fees, setFees] = useState<string>(initial?.fees ? String(initial.fees) : "");
  const [amount, setAmount] = useState<string>(initial?.amount == null ? "" : String(initial.amount));
  const [notes, setNotes] = useState(initial?.notes ?? "");

  useEffect(() => {
    if (!open) return;
    setKind((initial?.kind as TxnKind) ?? defaultKind);
    setTxnDate(initial?.txn_date?.slice(0, 10) ?? todayISO());
    setQuantity(initial?.quantity == null ? "" : String(initial.quantity));
    setPrice(initial?.price == null ? "" : String(initial.price));
    setFees(initial?.fees ? String(initial.fees) : "");
    setAmount(initial?.amount == null ? "" : String(initial.amount));
    setNotes(initial?.notes ?? "");
  }, [open, initial, defaultKind]);

  const units = unitsLabel?.trim() || unitsLabelFor(assetClass);
  const cashOnly = isCashOnlyKind(kind);
  const isSplit = kind === "split";
  const isBonus = kind === "bonus";
  /** Only unit-moving kinds have a per-unit price worth capturing. */
  const showPrice = !cashOnly && !isSplit && !isBonus;
  const showFees = addsUnits(kind) || removesUnits(kind);

  const qc = useQueryClient();
  const save = useServerFn(upsertHoldingTransaction);

  const mut = useMutation({
    mutationFn: (data: any) => save({ data }),
    onSuccess: () => {
      toast.success(isEdit ? "Transaction updated" : "Transaction added");
      qc.invalidateQueries();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save the transaction"),
  });

  /** Live preview of what this row will do to cost basis. */
  const preview = useMemo(() => {
    const q = Number(quantity) || 0;
    const p = Number(price) || 0;
    const f = Number(fees) || 0;
    const a = Number(amount) || 0;

    if (cashOnly) return a > 0 ? `${formatINR(a)} credited as income` : null;
    if (isBonus) return q > 0 ? `${q} free ${units} at zero cost` : null;
    if (isSplit) return q > 0 ? `Every 1 unit becomes ${q} — units x${q}, price ÷${q}` : null;
    if (q <= 0) return null;
    if (removesUnits(kind)) {
      const net = q * p - f;
      return `${formatINR(net)} out (${q} ${units} x ${formatINR(p)}${f ? ` less ${formatINR(f)} fees` : ""})`;
    }
    const cost = q * p + f;
    return `${formatINR(cost)} in (${q} ${units} x ${formatINR(p)}${f ? ` plus ${formatINR(f)} fees` : ""})`;
  }, [quantity, price, fees, amount, cashOnly, isBonus, isSplit, kind, units]);

  const submit = () => {
    if (!holdingId) return toast.error("No holding selected");
    if (!/^\d{4}-\d{2}-\d{2}/.test(txnDate)) return toast.error("Pick a valid date");

    const q = Number(quantity) || 0;
    const p = Number(price) || 0;
    const a = amount.trim() === "" ? null : Number(amount);

    // Mirror the server's per-kind rules so errors surface instantly.
    if (cashOnly) {
      if (!a || a <= 0) return toast.error(`Enter the ${TXN_KIND_LABELS[kind].toLowerCase()} amount`);
    } else if (isSplit) {
      if (q <= 0) return toast.error("Enter the split ratio (1:2 split → 2)");
    } else if (isBonus) {
      if (q <= 0) return toast.error("Enter how many free units you received");
    } else {
      if (q <= 0) return toast.error("Quantity must be greater than zero");
      if (p < 0) return toast.error("Price cannot be negative");
    }

    mut.mutate({
      id: initial?.id,
      holding_id: holdingId,
      txn_date: txnDate,
      kind,
      // Cash-only rows carry no units; the server zeroes these anyway, we just
      // avoid sending contradictory data.
      quantity: cashOnly ? 0 : q,
      price: cashOnly || isSplit || isBonus ? 0 : p,
      fees: showFees ? Number(fees) || 0 : 0,
      amount: cashOnly ? a : null,
      notes: notes.trim() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit transaction" : "Add transaction"}</DialogTitle>
          <DialogDescription>
            {holdingLabel ? `Ledger entry for ${holdingLabel}.` : "Ledger entry for this holding."}{" "}
            Quantity and average cost are recomputed from the full ledger after every save.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Kind</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as TxnKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {TXN_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {TXN_KIND_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} />
            </div>
          </div>

          <p className="flex gap-1.5 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {TXN_KIND_HINTS[kind]}
          </p>

          {cashOnly ? (
            <div>
              <Label>Amount received</Label>
              <Input
                type="number"
                step="any"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Counted as income in your returns. Units stay unchanged.
              </p>
            </div>
          ) : (
            <div className={showPrice ? "grid grid-cols-2 gap-2" : ""}>
              <div>
                <Label>{isSplit ? "Ratio multiplier" : `Quantity (${units})`}</Label>
                <Input
                  type="number"
                  step="any"
                  min={0}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder={isSplit ? "2" : "0"}
                />
                {isSplit && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    A 1:2 split is 2. A 3-for-1 bonus is 4 (1 held + 3 free).
                  </p>
                )}
              </div>
              {showPrice && (
                <div>
                  <Label>Price per {units}</Label>
                  <Input
                    type="number"
                    step="any"
                    min={0}
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0"
                  />
                </div>
              )}
            </div>
          )}

          {showFees && (
            <div>
              <Label>Fees, brokerage &amp; STT (optional)</Label>
              <Input
                type="number"
                step="any"
                min={0}
                value={fees}
                onChange={(e) => setFees(e.target.value)}
                placeholder="0"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {removesUnits(kind)
                  ? "Deducted from your sale proceeds, so realised gain drops."
                  : "Capitalised into cost, so your average cost rises."}
              </p>
            </div>
          )}

          {preview && (
            <p className="rounded-lg border border-dashed px-3 py-2 text-xs tabular-nums text-muted-foreground">
              {preview}
            </p>
          )}

          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={mut.isPending}>
            {mut.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
