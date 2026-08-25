// ---------------------------------------------------------------------------
// Investments — bulk NAV / price update
//
// There is no price feed in this app: every valuation is a number the user typed.
// That makes this the single highest-traffic dialog on the page, so it is built
// for speed — one row per holding, stale ones first, Enter moves down the list,
// and only the rows you actually touched get sent.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { TriangleAlert } from "lucide-react";
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
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { HoldingMetrics } from "@/lib/investments-types";
import { updateHoldingPrices } from "@/lib/investments.functions";
import { signClass, signedINR } from "./investment-bits";

function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Server caps a single call at 500 rows. */
const MAX_PRICES = 500;

export function UpdatePricesDialog({
  open,
  onOpenChange,
  metrics,
  suggestedDate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Active holdings, in whatever order the page has them. */
  metrics: HoldingMetrics[];
  suggestedDate?: string;
}) {
  const [asOf, setAsOf] = useState<string>(suggestedDate ?? todayISO());
  /** Keyed by holdingId. Empty string means "not touched". */
  const [draft, setDraft] = useState<Record<string, string>>({});
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  // Stale prices float to the top — that is the work the user came here to do.
  const rows = useMemo(() => {
    const active = metrics.filter((m) => m.isActive && m.quantity > 0);
    return [...active].sort((a, b) => {
      if (a.priceStale !== b.priceStale) return a.priceStale ? -1 : 1;
      return b.currentValue - a.currentValue;
    });
  }, [metrics]);

  useEffect(() => {
    if (!open) return;
    setAsOf(suggestedDate ?? todayISO());
    setDraft({});
    inputs.current = {};
  }, [open, suggestedDate]);

  const qc = useQueryClient();
  const save = useServerFn(updateHoldingPrices);

  const mut = useMutation({
    mutationFn: (data: any) => save({ data }),
    onSuccess: (_res, vars: any) => {
      const n = vars?.prices?.length ?? 0;
      toast.success(n === 1 ? "1 price updated" : `${n} prices updated`);
      qc.invalidateQueries();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not update prices"),
  });

  /** Only rows with a parseable, changed value count as edits. */
  const edits = useMemo(
    () =>
      rows
        .map((m) => ({ m, raw: draft[m.holdingId] ?? "" }))
        .filter(({ m, raw }) => {
          if (raw.trim() === "") return false;
          const n = Number(raw);
          return Number.isFinite(n) && n >= 0 && n !== m.currentPrice;
        })
        .map(({ m, raw }) => ({ holding_id: m.holdingId, price: Number(raw), metric: m })),
    [rows, draft],
  );

  /** What the portfolio would be worth if the user saves right now. */
  const projected = useMemo(() => {
    const byId = new Map(edits.map((e) => [e.holding_id, e.price]));
    let before = 0;
    let after = 0;
    for (const m of rows) {
      before += m.currentValue;
      const price = byId.get(m.holdingId);
      after += price == null ? m.currentValue : m.quantity * price;
    }
    return { before, after, delta: after - before };
  }, [rows, edits]);

  const submit = () => {
    if (!/^\d{4}-\d{2}-\d{2}/.test(asOf)) return toast.error("Pick a valid date");
    if (edits.length === 0) return toast.error("Change at least one price first");
    if (edits.length > MAX_PRICES) {
      return toast.error(`Update at most ${MAX_PRICES} prices at a time`);
    }
    mut.mutate({
      asOf,
      prices: edits.map((e) => ({ holding_id: e.holding_id, price: e.price })),
    });
  };

  /** Enter jumps to the next input instead of submitting — this is a data-entry grid. */
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const next = rows[index + 1];
    if (next) inputs.current[next.holdingId]?.focus();
    else submit();
  };

  const staleCount = rows.filter((m) => m.priceStale).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Update prices</DialogTitle>
          <DialogDescription>
            Enter today&apos;s NAV or market price. Blank rows are left untouched, and each price is
            saved to history so your value chart stays honest.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="w-40">
            <Label>Price date</Label>
            <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          </div>
          {staleCount > 0 && (
            <p className="flex items-center gap-1.5 pb-2 text-xs text-amber-700 dark:text-amber-300">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {staleCount} stale — listed first
            </p>
          )}
        </div>

        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No open positions to price yet. Add a holding with some units first.
          </p>
        ) : (
          <div className="-mx-1 flex-1 overflow-y-auto px-1">
            <div className="space-y-1">
              {/* Header row — hidden on mobile where each row stacks instead. */}
              <div className="hidden grid-cols-[1fr_7rem_7rem_7rem] gap-2 px-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground sm:grid">
                <span>Holding</span>
                <span className="text-right">Units</span>
                <span className="text-right">Current</span>
                <span className="text-right">New price</span>
              </div>
              {rows.map((m, i) => {
                const raw = draft[m.holdingId] ?? "";
                const parsed = raw.trim() === "" ? null : Number(raw);
                const valid = parsed == null || (Number.isFinite(parsed) && parsed >= 0);
                const newValue = parsed != null && valid ? m.quantity * parsed : null;
                const delta = newValue == null ? null : newValue - m.currentValue;

                return (
                  <div
                    key={m.holdingId}
                    className={cn(
                      "grid grid-cols-2 items-center gap-2 rounded-lg px-2 py-2 sm:grid-cols-[1fr_7rem_7rem_7rem]",
                      i % 2 === 0 && "bg-muted/30",
                    )}
                  >
                    <div className="col-span-2 min-w-0 sm:col-span-1">
                      <p className="truncate text-sm font-medium" title={m.name || m.symbol}>
                        {m.symbol}
                        {m.priceStale && (
                          <span className="ml-1.5 text-[10px] font-normal text-amber-600 dark:text-amber-400">
                            stale
                          </span>
                        )}
                      </p>
                      {m.name && m.name !== m.symbol && (
                        <p className="truncate text-xs text-muted-foreground">{m.name}</p>
                      )}
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground sm:text-right">
                      {Number(m.quantity.toFixed(4))} {m.unitsLabel}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground sm:text-right">
                      {formatINR(m.currentPrice)}
                    </span>
                    <div className="col-span-2 sm:col-span-1">
                      <Input
                        ref={(el) => {
                          inputs.current[m.holdingId] = el;
                        }}
                        type="number"
                        step="any"
                        min={0}
                        inputMode="decimal"
                        value={raw}
                        onChange={(e) => setDraft((d) => ({ ...d, [m.holdingId]: e.target.value }))}
                        onKeyDown={(e) => onKeyDown(e, i)}
                        placeholder={String(m.currentPrice || 0)}
                        className={cn("h-8 text-right tabular-nums", !valid && "border-destructive")}
                        aria-label={`New price for ${m.symbol}`}
                      />
                      {delta != null && delta !== 0 && (
                        <p className={cn("mt-0.5 text-right text-[10px] tabular-nums", signClass(delta))}>
                          {signedINR(delta)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {edits.length === 0 ? (
              "No changes yet"
            ) : (
              <>
                {edits.length === 1 ? "1 price" : `${edits.length} prices`} ·{" "}
                <span className="tabular-nums">{formatINR(projected.after)}</span>{" "}
                <span className={cn("tabular-nums", signClass(projected.delta))}>
                  ({signedINR(projected.delta)})
                </span>
              </>
            )}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={mut.isPending || edits.length === 0}>
              {mut.isPending ? "Saving…" : "Save prices"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
