// ---------------------------------------------------------------------------
// Investments — one holding, in full
//
// A side sheet rather than a route, so the user never loses the portfolio view
// behind it. Everything here comes from getHoldingDetail, which re-runs the FIFO
// replay server-side; nothing is recomputed in the browser.
//
// NOTE: the Recharts import list here is deliberately narrow, and no Recharts
// component is ever passed as an `icon` prop — doing that has crashed this app
// with a null-useContext error before.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, formatINR, formatLakhCrore } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { TXN_KIND_LABELS, isTxnKind, type InvestmentAccountRef } from "@/lib/investments-types";
import { deleteHolding, deleteHoldingTransaction, getHoldingDetail } from "@/lib/investments.functions";
import { HoldingFormDialog } from "./holding-form-dialog";
import { HoldingTxnDialog } from "./holding-txn-dialog";
import {
  AssetClassPill,
  DeltaText,
  MiniStat,
  TermSplit,
  VALUE_COLOR,
  WarningList,
  XirrBadge,
  formatUnits,
  signClass,
  signedINR,
} from "./investment-bits";

export function HoldingDetailSheet({
  holdingId,
  onOpenChange,
  accounts,
}: {
  /** null closes the sheet. */
  holdingId: string | null;
  onOpenChange: (open: boolean) => void;
  accounts: InvestmentAccountRef[];
}) {
  const open = !!holdingId;
  const [editOpen, setEditOpen] = useState(false);
  const [txnOpen, setTxnOpen] = useState(false);
  const [editingTxn, setEditingTxn] = useState<any>(null);

  const fetchDetail = useServerFn(getHoldingDetail);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: queryKeys.investments.holding(holdingId ?? "none"),
    queryFn: () => fetchDetail({ data: { holdingId: holdingId! } }),
    enabled: open,
    staleTime: 30_000,
  });

  const d: any = q.data;
  const holding = d?.holding;
  const metrics = d?.metrics;
  const fifo = d?.fifo;
  const termSplit = d?.termSplit;
  const units: string = d?.assetClass?.unitsLabel ?? "units";

  const removeHolding = useServerFn(deleteHolding);
  const delHolding = useMutation({
    mutationFn: (id: string) => removeHolding({ data: { id } }),
    onSuccess: () => {
      toast.success("Holding deleted");
      qc.invalidateQueries();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not delete the holding"),
  });

  const removeTxn = useServerFn(deleteHoldingTransaction);
  const delTxn = useMutation({
    mutationFn: (id: string) => removeTxn({ data: { id } }),
    onSuccess: () => {
      toast.success("Transaction deleted");
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not delete the transaction"),
  });

  /** Price history plus a synthetic point for today's price, so the line reaches "now". */
  const priceChart = useMemo(() => {
    const series: Array<{ price_date: string; price: number }> = Array.isArray(d?.priceSeries)
      ? d.priceSeries
      : [];
    const points = series.map((p) => ({ date: p.price_date, price: Number(p.price) || 0 }));
    const last = points[points.length - 1];
    const currentPrice = Number(metrics?.currentPrice) || 0;
    if (currentPrice > 0 && (!last || last.price !== currentPrice)) {
      const today = d?.metrics ? String(d?.suggestedPriceDate ?? "") : "";
      if (today && (!last || today > last.date)) points.push({ date: today, price: currentPrice });
    }
    return points;
  }, [d, metrics]);

  const holdingLabel = holding ? holding.name || holding.symbol : "";

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl"
        >
          {q.isPending ? (
            <div className="space-y-4 p-6">
              <Skeleton className="h-6 w-52" />
              <Skeleton className="h-4 w-32" />
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
              <Skeleton className="h-48" />
            </div>
          ) : q.isError ? (
            <div className="space-y-3 p-6">
              <SheetHeader>
                <SheetTitle>Could not load this holding</SheetTitle>
                <SheetDescription>{(q.error as any)?.message ?? "Something went wrong."}</SheetDescription>
              </SheetHeader>
              <Button variant="outline" onClick={() => q.refetch()}>
                Try again
              </Button>
            </div>
          ) : !holding ? null : (
            <>
              {/* ---------------- header ---------------- */}
              <SheetHeader className="space-y-2 border-b p-6 pb-4 text-left">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <SheetTitle className="truncate font-display text-xl">{holding.symbol}</SheetTitle>
                    <SheetDescription className="truncate">
                      {holding.name && holding.name !== holding.symbol ? holding.name : null}
                      {holding.name && holding.name !== holding.symbol && d?.account?.name ? " · " : null}
                      {d?.account?.name ?? ""}
                    </SheetDescription>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setEditOpen(true)}
                      aria-label="Edit holding"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      aria-label="Delete holding"
                      disabled={delHolding.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Delete ${holding.symbol} and its entire transaction history? This cannot be undone.`,
                          )
                        ) {
                          delHolding.mutate(holding.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <AssetClassPill assetClass={holding.asset_class} />
                  <XirrBadge value={metrics?.xirr} />
                  {metrics?.sip?.isSip && (
                    <Badge variant="outline" className="font-normal">
                      {metrics.sip.cadence === "monthly" ? "Monthly SIP" : "SIP"} ·{" "}
                      {formatINR(metrics.sip.averageAmount)}
                    </Badge>
                  )}
                  {metrics?.priceStale && (
                    <Badge
                      variant="outline"
                      className="border-amber-500/40 bg-amber-500/10 font-normal text-amber-700 dark:text-amber-300"
                    >
                      Stale price
                    </Badge>
                  )}
                  {!holding.is_active && (
                    <Badge variant="secondary" className="font-normal">
                      Closed
                    </Badge>
                  )}
                </div>

                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pt-1">
                  <span className="font-display text-2xl font-semibold tabular-nums">
                    {formatINR(metrics?.currentValue ?? 0)}
                  </span>
                  <DeltaText
                    value={metrics?.unrealized ?? 0}
                    pct={metrics?.unrealizedPct}
                    className="text-sm"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatUnits(metrics?.quantity ?? 0, units)} @ {formatINR(metrics?.currentPrice ?? 0)}
                  {metrics?.avgCost ? ` · avg cost ${formatINR(metrics.avgCost)}` : ""}
                  {holding.price_updated_at
                    ? ` · priced ${formatDate(holding.price_updated_at)}`
                    : " · never priced"}
                </p>

                {Array.isArray(d?.warnings) && d.warnings.length > 0 && (
                  <WarningList warnings={d.warnings} className="pt-1" />
                )}
              </SheetHeader>

              {/* ---------------- body ---------------- */}
              <Tabs defaultValue="summary" className="flex-1 p-6 pt-4">
                <TabsList className="w-full">
                  <TabsTrigger value="summary" className="flex-1">
                    Summary
                  </TabsTrigger>
                  <TabsTrigger value="ledger" className="flex-1">
                    Ledger{metrics?.txnCount ? ` (${metrics.txnCount})` : ""}
                  </TabsTrigger>
                  <TabsTrigger value="lots" className="flex-1">
                    Lots &amp; tax
                  </TabsTrigger>
                </TabsList>

                {/* ---- Summary ---- */}
                <TabsContent value="summary" className="mt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <MiniStat label="Invested" value={formatINR(metrics?.invested ?? 0)} />
                    <MiniStat label="Market value" value={formatINR(metrics?.currentValue ?? 0)} />
                    <MiniStat
                      label="Unrealised"
                      value={
                        <span className={signClass(metrics?.unrealized ?? 0)}>
                          {signedINR(metrics?.unrealized ?? 0)}
                        </span>
                      }
                    />
                    <MiniStat
                      label="Realised"
                      value={
                        <span className={signClass(metrics?.realized ?? 0)}>
                          {signedINR(metrics?.realized ?? 0)}
                        </span>
                      }
                    />
                    <MiniStat label="Income" value={formatINR(metrics?.income ?? 0)} />
                    <MiniStat label="Fees paid" value={formatINR(metrics?.totalFees ?? 0)} />
                    <MiniStat
                      label="Total return"
                      value={
                        <span className={signClass(metrics?.totalReturn ?? 0)}>
                          {signedINR(metrics?.totalReturn ?? 0)}
                        </span>
                      }
                    />
                    <MiniStat
                      label="Held for"
                      value={
                        metrics?.holdingDays
                          ? metrics.holdingDays >= 365
                            ? `${(metrics.holdingDays / 365).toFixed(1)} yr`
                            : `${metrics.holdingDays} d`
                          : "—"
                      }
                    />
                    <MiniStat
                      label="Units sold"
                      value={metrics?.soldQty ? formatUnits(metrics.soldQty, units) : "—"}
                    />
                  </div>

                  {termSplit && (
                    <TermSplit
                      assetClass={holding.asset_class}
                      shortTerm={termSplit.unrealizedShortTerm}
                      longTerm={termSplit.unrealizedLongTerm}
                    />
                  )}

                  {/* Price history */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-medium">Price history</h3>
                      {d?.lastPriceDate && (
                        <span className="text-xs text-muted-foreground">
                          last {formatDate(d.lastPriceDate)}
                        </span>
                      )}
                    </div>
                    {priceChart.length < 2 ? (
                      <p className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                        Two or more priced dates are needed to draw a line. Update the price a few times
                        and this fills in.
                      </p>
                    ) : (
                      <div className="h-44">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={priceChart} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
                            <defs>
                              <linearGradient id="holdingPriceFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={VALUE_COLOR} stopOpacity={0.28} />
                                <stop offset="100%" stopColor={VALUE_COLOR} stopOpacity={0.02} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
                            <XAxis
                              dataKey="date"
                              tick={{ fontSize: 10 }}
                              tickFormatter={(v: string) => String(v).slice(5)}
                              stroke="currentColor"
                              className="text-muted-foreground"
                            />
                            <YAxis
                              tick={{ fontSize: 10 }}
                              tickFormatter={(v: number) => formatLakhCrore(v)}
                              stroke="currentColor"
                              className="text-muted-foreground"
                              width={56}
                            />
                            <RTooltip
                              formatter={(v: any) => formatINR(Number(v))}
                              labelFormatter={(l: any) => formatDate(String(l))}
                              contentStyle={{ fontSize: 12, borderRadius: 8 }}
                            />
                            <Area
                              type="monotone"
                              dataKey="price"
                              name="Price"
                              stroke={VALUE_COLOR}
                              strokeWidth={2}
                              fill="url(#holdingPriceFill)"
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>

                  {(holding.isin || holding.folio_number || holding.sector || holding.notes) && (
                    <div className="space-y-1 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                      {holding.folio_number && <p>Folio {holding.folio_number}</p>}
                      {holding.isin && <p>ISIN {holding.isin}</p>}
                      {holding.sector && <p>Sector {holding.sector}</p>}
                      {holding.notes && <p className="text-foreground/80">{holding.notes}</p>}
                    </div>
                  )}
                </TabsContent>

                {/* ---- Ledger ---- */}
                <TabsContent value="ledger" className="mt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">Transactions</h3>
                    <Button
                      size="sm"
                      onClick={() => {
                        setEditingTxn(null);
                        setTxnOpen(true);
                      }}
                    >
                      <Plus className="mr-1 h-4 w-4" /> Add
                    </Button>
                  </div>

                  {!Array.isArray(d?.txns) || d.txns.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                      No transactions yet. Add a buy or a SIP instalment and this holding starts
                      tracking cost basis, realised gains and XIRR on its own.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Kind</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Price</TableHead>
                          <TableHead className="text-right">Value</TableHead>
                          <TableHead className="w-16" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {d.txns.map((t: any) => {
                          const qty = Number(t.quantity) || 0;
                          const price = Number(t.price) || 0;
                          const fees = Number(t.fees) || 0;
                          const explicit = t.amount == null ? null : Number(t.amount);
                          const value = explicit != null ? explicit : qty * price;
                          // t is `any`, so narrow through a typed local — isTxnKind
                          // cannot refine an `any` property access.
                          const rawKind: unknown = t.kind;
                          const kindLabel = isTxnKind(rawKind)
                            ? TXN_KIND_LABELS[rawKind]
                            : String(rawKind ?? "");
                          return (
                            <TableRow key={t.id}>
                              <TableCell className="whitespace-nowrap text-xs">
                                {formatDate(t.txn_date)}
                              </TableCell>
                              <TableCell className="text-xs">
                                {kindLabel}
                                {fees > 0 && (
                                  <span className="block text-[10px] text-muted-foreground">
                                    {formatINR(fees)} fees
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-right text-xs tabular-nums">
                                {qty ? Number(qty.toFixed(4)) : "—"}
                              </TableCell>
                              <TableCell className="text-right text-xs tabular-nums">
                                {price ? formatINR(price) : "—"}
                              </TableCell>
                              <TableCell className="text-right text-xs tabular-nums">
                                {value ? formatINR(value) : "—"}
                              </TableCell>
                              <TableCell>
                                <div className="flex justify-end gap-0.5">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    aria-label="Edit transaction"
                                    onClick={() => {
                                      setEditingTxn(t);
                                      setTxnOpen(true);
                                    }}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-destructive hover:text-destructive"
                                    aria-label="Delete transaction"
                                    disabled={delTxn.isPending}
                                    onClick={() => {
                                      if (window.confirm("Delete this transaction?")) {
                                        delTxn.mutate(t.id);
                                      }
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>

                {/* ---- Lots & tax ---- */}
                <TabsContent value="lots" className="mt-4 space-y-5">
                  <div>
                    <h3 className="mb-1 text-sm font-medium">Open lots (FIFO)</h3>
                    <p className="mb-2 text-xs text-muted-foreground">
                      The oldest lot is consumed first when you sell, so this is the order your gains
                      will be realised in.
                    </p>
                    {!fifo?.openLots?.length ? (
                      <p className="rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">
                        No open lots — this position is fully closed.
                      </p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Bought</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Cost / unit</TableHead>
                            <TableHead className="text-right">Unrealised</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {fifo.openLots.map((lot: any, i: number) => {
                            const gain =
                              (Number(metrics?.currentPrice) || 0) * Number(lot.qty) -
                              Number(lot.costPerUnit) * Number(lot.qty);
                            return (
                              <TableRow key={`${lot.date}-${i}`}>
                                <TableCell className="whitespace-nowrap text-xs">
                                  {formatDate(lot.date)}
                                </TableCell>
                                <TableCell className="text-right text-xs tabular-nums">
                                  {Number(Number(lot.qty).toFixed(4))}
                                </TableCell>
                                <TableCell className="text-right text-xs tabular-nums">
                                  {formatINR(lot.costPerUnit)}
                                </TableCell>
                                <TableCell
                                  className={cn("text-right text-xs tabular-nums", signClass(gain))}
                                >
                                  {signedINR(gain)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </div>

                  <div>
                    <h3 className="mb-2 text-sm font-medium">Realised sales</h3>
                    {!fifo?.sales?.length ? (
                      <p className="rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">
                        Nothing sold yet, so there is no realised gain to report.
                      </p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Sold</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Gain</TableHead>
                            <TableHead className="text-right">Term</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {fifo.sales.map((s: any, i: number) => (
                            <TableRow key={`${s.date}-${i}`}>
                              <TableCell className="whitespace-nowrap text-xs">
                                {formatDate(s.date)}
                              </TableCell>
                              <TableCell className="text-right text-xs tabular-nums">
                                {Number(Number(s.qty).toFixed(4))}
                              </TableCell>
                              <TableCell
                                className={cn("text-right text-xs tabular-nums", signClass(Number(s.gain)))}
                              >
                                {signedINR(Number(s.gain))}
                              </TableCell>
                              <TableCell className="text-right text-xs">
                                <Badge variant="secondary" className="font-normal">
                                  {s.term === "long" ? "LTCG" : "STCG"}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>

                  {termSplit && (
                    <div className="grid grid-cols-2 gap-2">
                      <MiniStat
                        label="Realised short term"
                        value={
                          <span className={signClass(termSplit.realizedShortTerm)}>
                            {signedINR(termSplit.realizedShortTerm)}
                          </span>
                        }
                      />
                      <MiniStat
                        label="Realised long term"
                        value={
                          <span className={signClass(termSplit.realizedLongTerm)}>
                            {signedINR(termSplit.realizedLongTerm)}
                          </span>
                        }
                      />
                      <MiniStat
                        label="Units held < LTCG"
                        value={formatUnits(termSplit.shortTermQty ?? 0, units)}
                      />
                      <MiniStat
                        label="Units qualifying LTCG"
                        value={formatUnits(termSplit.longTermQty ?? 0, units)}
                      />
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Terms follow the Income Tax Act holding periods for this asset class
                    {d?.assetClass?.ltcgMonths ? ` (${d.assetClass.ltcgMonths} months)` : ""}. This is a
                    planning aid, not tax advice — indexation, grandfathering and the ₹1.25L equity
                    exemption are not applied.
                  </p>
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>

      {holding && (
        <>
          <HoldingFormDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            accounts={accounts}
            initial={{ ...holding, txnCount: metrics?.txnCount ?? 0 }}
          />
          <HoldingTxnDialog
            open={txnOpen}
            onOpenChange={(o) => {
              setTxnOpen(o);
              if (!o) setEditingTxn(null);
            }}
            holdingId={holding.id}
            holdingLabel={holdingLabel}
            assetClass={holding.asset_class}
            unitsLabel={d?.assetClass?.unitsLabel}
            initial={editingTxn ?? undefined}
          />
        </>
      )}
    </>
  );
}
