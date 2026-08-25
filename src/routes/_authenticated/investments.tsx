// ---------------------------------------------------------------------------
// Investments — portfolio surface
//
// Everything on this page is derived server-side by getPortfolio, which replays
// each holding's ledger through FIFO cost-basis matching and solves XIRR per
// holding and for the portfolio as a whole. This file does presentation, sorting
// and filtering only — no financial maths lives here, so there is exactly one
// place where a number can be wrong.
//
// Two conventions this file must keep (both are past crash regressions):
//   1. Never pass a Recharts component as an `icon` prop. The pie icon in the
//      tabs is `PieChart as PieIcon` from lucide-react, NOT Recharts' PieChart.
//   2. No Route.useSearch() / Route.useParams(). Range lives in local state.
// ---------------------------------------------------------------------------

import { createFileRoute, Link } from "@tanstack/react-router";
import { useDeferredValue, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  Coins,
  IndianRupee,
  LineChart as LineIcon,
  PieChart as PieIcon,
  Plus,
  RefreshCw,
  Repeat,
  Scale,
  Search,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HoldingDetailSheet } from "@/components/investments/holding-detail-sheet";
import { HoldingFormDialog } from "@/components/investments/holding-form-dialog";
import { UpdatePricesDialog } from "@/components/investments/update-prices-dialog";
import {
  AllocationBar,
  DeltaText,
  GAIN_COLOR,
  INVESTED_COLOR,
  KpiCard,
  KpiSkeleton,
  LegendDot,
  LOSS_COLOR,
  StalePriceHint,
  VALUE_COLOR,
  WarningList,
  XirrBadge,
  chartColor,
  formatUnits,
  pctText,
  signClass,
  signedINR,
  xirrText,
} from "@/components/investments/investment-bits";
import { formatINR, formatLakhCrore } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { assetClassLabel, type AllocationSlice, type HoldingMetrics } from "@/lib/investments-types";
import { getPortfolio, type PortfolioResponse } from "@/lib/investments.functions";

export const Route = createFileRoute("/_authenticated/investments")({
  head: () => ({ meta: [{ title: "Investments — Paisa" }] }),
  component: InvestmentsPage,
});

/* ============================== constants ============================== */

type Range = "1y" | "3y" | "5y" | "all";
const RANGES: Range[] = ["1y", "3y", "5y", "all"];
const RANGE_LABEL: Record<Range, string> = { "1y": "1Y", "3y": "3Y", "5y": "5Y", all: "All" };

type SortKey = "value" | "gain" | "gainPct" | "xirr" | "invested" | "name";
const SORT_LABEL: Record<SortKey, string> = {
  value: "Market value",
  gain: "Unrealised gain",
  gainPct: "Gain %",
  xirr: "XIRR",
  invested: "Invested",
  name: "Name (A–Z)",
};

/** "2026-03" -> "Mar 26" for the contributions axis. */
function monthLabel(ym: string): string {
  const [y, m] = String(ym).split("-");
  const idx = Number(m) - 1;
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  if (!Number.isFinite(idx) || !names[idx]) return String(ym);
  return `${names[idx]} ${String(y).slice(2)}`;
}

/* ============================== page ============================== */

function InvestmentsPage() {
  const [range, setRange] = useState<Range>("all");
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [showClosed, setShowClosed] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editingHolding, setEditingHolding] = useState<any>(null);
  const [pricesOpen, setPricesOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const fetchPortfolio = useServerFn(getPortfolio);
  const q = useQuery({
    queryKey: queryKeys.investments.portfolio(range),
    queryFn: () => fetchPortfolio({ data: { range } }),
    staleTime: 60_000,
  });

  const p = q.data as PortfolioResponse | undefined;

  const metrics: HoldingMetrics[] = Array.isArray(p?.metrics) ? p!.metrics : [];
  const accounts = Array.isArray(p?.accounts) ? p!.accounts : [];
  const totals = p?.totals;

  // 220ms-ish deferred search — the list is client-side so this is enough to keep
  // typing smooth on a few hundred holdings.
  const deferredSearch = useDeferredValue(search);

  const assetClassOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const m of metrics) seen.add(m.assetClass);
    return [...seen].sort((a, b) => assetClassLabel(a).localeCompare(assetClassLabel(b)));
  }, [metrics]);

  const visible = useMemo(() => {
    const needle = deferredSearch.trim().toLowerCase();
    const rows = metrics.filter((m) => {
      if (!showClosed && !m.isActive && m.quantity === 0) return false;
      if (classFilter !== "all" && m.assetClass !== classFilter) return false;
      if (!needle) return true;
      return (
        m.symbol.toLowerCase().includes(needle) ||
        (m.name ?? "").toLowerCase().includes(needle) ||
        assetClassLabel(m.assetClass).toLowerCase().includes(needle)
      );
    });

    const sorted = [...rows];
    sorted.sort((a, b) => {
      switch (sortKey) {
        case "name":
          return (a.name || a.symbol).localeCompare(b.name || b.symbol);
        case "gain":
          return b.unrealized - a.unrealized;
        case "gainPct":
          return b.unrealizedPct - a.unrealizedPct;
        case "invested":
          return b.invested - a.invested;
        // A null XIRR is "not solvable", not "zero" — those rows sink to the bottom
        // instead of being ranked among genuine 0% returns.
        case "xirr": {
          const av = a.xirr == null ? -Infinity : a.xirr;
          const bv = b.xirr == null ? -Infinity : b.xirr;
          return bv - av;
        }
        case "value":
        default:
          return b.currentValue - a.currentValue;
      }
    });
    return sorted;
  }, [metrics, deferredSearch, classFilter, sortKey, showClosed]);

  const totalValue = totals?.currentValue ?? 0;
  const openHolding = (id: string) => setDetailId(id);
  const addHolding = () => {
    setEditingHolding(null);
    setFormOpen(true);
  };

  /* ---------------- loading ---------------- */
  if (q.isPending) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <KpiSkeleton key={i} />
          ))}
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  /* ---------------- error ---------------- */
  if (q.isError) {
    return (
      <div className="mx-auto max-w-2xl p-4 md:p-6">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <p className="font-medium">Could not load your portfolio</p>
              <p className="mx-auto max-w-md text-sm text-muted-foreground">
                {(q.error as any)?.message ?? "Something went wrong on the way to the server."}
              </p>
            </div>
            <Button onClick={() => q.refetch()} disabled={q.isFetching}>
              <RefreshCw className={cn("h-4 w-4", q.isFetching && "animate-spin")} />
              {q.isFetching ? "Retrying…" : "Try again"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ---------------- empty: no investment accounts at all ---------------- */
  if (accounts.length === 0) {
    return (
      <div className="mx-auto max-w-2xl p-4 md:p-6">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-accent">
              <Wallet className="h-6 w-6" />
            </div>
            <div>
              <p className="font-medium">No investment accounts yet</p>
              <p className="mx-auto max-w-md text-sm text-muted-foreground">
                This page reads from your mutual fund, stocks, gold, PPF, EPF, NPS, FD, RD,
                post-office and chit-fund accounts. Add one and your holdings can live inside it.
              </p>
            </div>
            <Button asChild>
              <Link to="/accounts">
                <Plus className="h-4 w-4" /> Add an investment account
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ---------------- empty: accounts but no holdings ---------------- */
  if (metrics.length === 0) {
    return (
      <>
        <div className="mx-auto max-w-2xl p-4 md:p-6">
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-accent">
                <TrendingUp className="h-6 w-6" />
              </div>
              <div>
                <p className="font-medium">Nothing tracked yet</p>
                <p className="mx-auto max-w-md text-sm text-muted-foreground">
                  Add your first holding — a scheme, a stock, a gold purchase — then log its buys and
                  SIP instalments. Cost basis, realised gains, tax terms and XIRR are all worked out
                  from that ledger for you.
                </p>
              </div>
              <Button onClick={addHolding}>
                <Plus className="h-4 w-4" /> Add first holding
              </Button>
            </CardContent>
          </Card>
        </div>
        <HoldingFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          accounts={accounts}
          initial={editingHolding}
        />
      </>
    );
  }

  /* ---------------- the page ---------------- */
  return (
    <TooltipProvider delayDuration={200}>
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
        {/* ============================== header ============================== */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold">Investments</h1>
            <p className="text-sm text-muted-foreground">
              {totals?.activeHoldingCount ?? 0} open{" "}
              {(totals?.activeHoldingCount ?? 0) === 1 ? "position" : "positions"} across{" "}
              {accounts.length} {accounts.length === 1 ? "account" : "accounts"}
              {p?.asOf ? ` · as of ${p.asOf}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border p-0.5">
              {RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    range === r
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {RANGE_LABEL[r]}
                </button>
              ))}
            </div>
            <Button variant="outline" onClick={() => setPricesOpen(true)}>
              <RefreshCw className={cn("h-4 w-4", q.isFetching && "animate-spin")} /> Update prices
            </Button>
            <Button onClick={addHolding}>
              <Plus className="h-4 w-4" /> Add holding
            </Button>
          </div>
        </div>

        {/* ============================== KPI strip ============================== */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <KpiCard
            label="Market value"
            value={formatINR(totals?.currentValue ?? 0)}
            hint={`${formatINR(totals?.invested ?? 0)} invested`}
            icon={IndianRupee}
            accent="info"
          />
          <KpiCard
            label="Unrealised"
            value={signedINR(totals?.unrealized ?? 0)}
            delta={totals?.unrealized ?? 0}
            deltaPct={totals?.unrealizedPct ?? 0}
            icon={(totals?.unrealized ?? 0) >= 0 ? ArrowUpRight : ArrowDownRight}
            accent={(totals?.unrealized ?? 0) >= 0 ? "gain" : "loss"}
          />
          <KpiCard
            label="Realised"
            value={signedINR(totals?.realized ?? 0)}
            hint={
              (totals?.realized ?? 0) === 0
                ? "Nothing sold yet"
                : `ST ${formatLakhCrore(totals?.realizedShortTerm ?? 0)} · LT ${formatLakhCrore(totals?.realizedLongTerm ?? 0)}`
            }
            icon={Scale}
            accent={(totals?.realized ?? 0) >= 0 ? "neutral" : "loss"}
          />
          <KpiCard
            label="Income"
            value={formatINR(totals?.income ?? 0)}
            hint="Dividends & interest"
            icon={Coins}
          />
          <KpiCard
            label="Total return"
            value={signedINR(totals?.totalReturn ?? 0)}
            delta={totals?.totalReturn ?? 0}
            deltaPct={totals?.totalReturnPct ?? 0}
            icon={TrendingUp}
            accent={(totals?.totalReturn ?? 0) >= 0 ? "gain" : "loss"}
          />
          <KpiCard
            label="Portfolio XIRR"
            value={xirrText(p?.xirr)}
            hint="Annualised, money-weighted"
            icon={LineIcon}
            accent={p?.xirr == null ? "neutral" : p.xirr >= 0 ? "gain" : "loss"}
          />
        </div>

        <StalePriceHint count={p?.stalePriceCount ?? 0} onUpdate={() => setPricesOpen(true)} />
        {Array.isArray(p?.warnings) && p.warnings.length > 0 && (
          <div className="rounded-lg border border-dashed p-3">
            <WarningList warnings={p.warnings} />
          </div>
        )}

        {/* ============================== tabs ============================== */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="overview">
              <LineIcon className="mr-1.5 h-3.5 w-3.5" /> Overview
            </TabsTrigger>
            <TabsTrigger value="holdings">
              <Wallet className="mr-1.5 h-3.5 w-3.5" /> Holdings
            </TabsTrigger>
            <TabsTrigger value="allocation">
              <PieIcon className="mr-1.5 h-3.5 w-3.5" /> Allocation
            </TabsTrigger>
            <TabsTrigger value="performance">
              <TrendingUp className="mr-1.5 h-3.5 w-3.5" /> Performance
            </TabsTrigger>
          </TabsList>

          {/* ---------------- Overview ---------------- */}
          <TabsContent value="overview" className="space-y-4">
            <ValueVsInvestedCard series={p?.valueSeries ?? []} range={range} />

            <div className="grid gap-4 lg:grid-cols-2">
              <MoversCard
                title="Top gainers"
                description="Biggest unrealised gains right now."
                rows={Array.isArray(p?.topGainers) ? p.topGainers : []}
                onOpen={openHolding}
                positive
              />
              <MoversCard
                title="Needs attention"
                description="Largest unrealised losses — worth a look before you rebalance."
                rows={Array.isArray(p?.topLosers) ? p.topLosers : []}
                onOpen={openHolding}
              />
            </div>

            <ContributionsCard rows={p?.monthlyContributions ?? []} />
          </TabsContent>

          {/* ---------------- Holdings ---------------- */}
          <TabsContent value="holdings" className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[12rem] flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search scheme, stock or asset class"
                  className="pl-8"
                />
              </div>
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger className="w-[12rem]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="all">All asset classes</SelectItem>
                  {assetClassOptions.map((c) => (
                    <SelectItem key={c} value={c}>
                      {assetClassLabel(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                <SelectTrigger className="w-[11rem]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {SORT_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant={showClosed ? "secondary" : "outline"}
                onClick={() => setShowClosed((s) => !s)}
              >
                {showClosed ? "Hiding nothing" : "Show closed"}
              </Button>
            </div>

            {visible.length === 0 ? (
              <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                No holdings match that filter.
              </p>
            ) : (
              <>
                {/* Desktop table */}
                <Card className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Holding</TableHead>
                        <TableHead className="text-right">Units</TableHead>
                        <TableHead className="text-right">Avg / Now</TableHead>
                        <TableHead className="text-right">Invested</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead className="text-right">Unrealised</TableHead>
                        <TableHead className="text-right">XIRR</TableHead>
                        <TableHead className="text-right">Weight</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visible.map((m) => {
                        const weight = totalValue > 0 ? (m.currentValue / totalValue) * 100 : 0;
                        return (
                          <TableRow
                            key={m.holdingId}
                            className="cursor-pointer"
                            onClick={() => openHolding(m.holdingId)}
                          >
                            <TableCell className="max-w-[16rem]">
                              <div className="flex items-center gap-2">
                                <span className="truncate font-medium">{m.symbol}</span>
                                {m.sip.isSip && (
                                  <Repeat
                                    className="h-3 w-3 shrink-0 text-muted-foreground"
                                    aria-label="SIP"
                                  />
                                )}
                                {m.priceStale && (
                                  <span className="shrink-0 text-[10px] text-amber-600 dark:text-amber-400">
                                    stale
                                  </span>
                                )}
                                {!m.isActive && (
                                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                                    closed
                                  </Badge>
                                )}
                              </div>
                              <p className="truncate text-xs text-muted-foreground">
                                {assetClassLabel(m.assetClass)}
                                {m.name && m.name !== m.symbol ? ` · ${m.name}` : ""}
                              </p>
                            </TableCell>
                            <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                              {formatUnits(m.quantity, m.unitsLabel)}
                            </TableCell>
                            <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                              {formatINR(m.avgCost)}
                              <span className="mx-1 opacity-50">/</span>
                              {formatINR(m.currentPrice)}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums">
                              {formatINR(m.invested)}
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium tabular-nums">
                              {formatINR(m.currentValue)}
                            </TableCell>
                            <TableCell className="text-right">
                              <DeltaText
                                value={m.unrealized}
                                pct={m.unrealizedPct}
                                showIcon={false}
                                className="justify-end text-sm"
                              />
                            </TableCell>
                            <TableCell
                              className={cn(
                                "text-right text-sm tabular-nums",
                                signClass(m.xirr ?? 0),
                              )}
                            >
                              {xirrText(m.xirr)}
                            </TableCell>
                            <TableCell className="w-24 text-right">
                              <span className="text-xs tabular-nums text-muted-foreground">
                                {weight.toFixed(1)}%
                              </span>
                              <AllocationBar pct={weight} color={VALUE_COLOR} className="mt-1" />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Card>

                {/* Mobile cards */}
                <div className="space-y-2 md:hidden">
                  {visible.map((m) => (
                    <Card
                      key={m.holdingId}
                      className="cursor-pointer transition hover:border-primary/40"
                      onClick={() => openHolding(m.holdingId)}
                    >
                      <CardContent className="space-y-2 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="truncate font-medium">{m.symbol}</p>
                              {m.sip.isSip && (
                                <Repeat className="h-3 w-3 shrink-0 text-muted-foreground" />
                              )}
                            </div>
                            <p className="truncate text-xs text-muted-foreground">
                              {assetClassLabel(m.assetClass)} · {formatUnits(m.quantity, m.unitsLabel)}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="font-medium tabular-nums">{formatINR(m.currentValue)}</p>
                            <DeltaText
                              value={m.unrealized}
                              pct={m.unrealizedPct}
                              showIcon={false}
                              compact
                              className="justify-end text-xs"
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span className="tabular-nums">{formatINR(m.invested)} invested</span>
                          <span className={cn("tabular-nums", signClass(m.xirr ?? 0))}>
                            XIRR {xirrText(m.xirr)}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <p className="text-xs text-muted-foreground">
                  Showing {visible.length} of {metrics.length} holdings. Tap any row for lots, tax
                  terms and its full ledger.
                </p>
              </>
            )}
          </TabsContent>

          {/* ---------------- Allocation ---------------- */}
          <TabsContent value="allocation" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <AllocationCard
                title="By asset class"
                description="Where your money actually sits, by market value."
                slices={p?.allocationByAssetClass ?? []}
              />
              <AllocationCard
                title="By account"
                description="Concentration across brokers, fund houses and schemes."
                slices={p?.allocationByAccount ?? []}
              />
            </div>

            <AllocationCard
              title="By bucket"
              description="Equity, debt, gold and retirement rolled up the way you think about them."
              slices={p?.allocationByGroup ?? []}
              wide
            />

            <DriftCard rows={p?.drift ?? []} metrics={metrics} onOpen={openHolding} />
          </TabsContent>

          {/* ---------------- Performance ---------------- */}
          <TabsContent value="performance" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Return by holding</CardTitle>
                  <CardDescription>
                    XIRR is annualised and money-weighted, so a SIP and a lump sum are comparable.
                    Absolute return ignores timing.
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-6">Holding</TableHead>
                        <TableHead className="text-right">Absolute</TableHead>
                        <TableHead className="text-right">XIRR</TableHead>
                        <TableHead className="pr-6 text-right">Held</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...metrics]
                        .filter((m) => m.txnCount > 0 || m.currentValue > 0)
                        .sort((a, b) => {
                          const av = a.xirr == null ? -Infinity : a.xirr;
                          const bv = b.xirr == null ? -Infinity : b.xirr;
                          return bv - av;
                        })
                        .map((m) => (
                          <TableRow
                            key={m.holdingId}
                            className="cursor-pointer"
                            onClick={() => openHolding(m.holdingId)}
                          >
                            <TableCell className="max-w-[14rem] pl-6">
                              <p className="truncate font-medium">{m.symbol}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {assetClassLabel(m.assetClass)}
                              </p>
                            </TableCell>
                            <TableCell
                              className={cn(
                                "text-right text-sm tabular-nums",
                                signClass(m.totalReturn),
                              )}
                            >
                              {pctText(m.totalReturnPct)}
                              <span className="block text-[10px] opacity-70">
                                {signedINR(m.totalReturn)}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <XirrBadge value={m.xirr} label="" />
                            </TableCell>
                            <TableCell className="pr-6 text-right text-xs tabular-nums text-muted-foreground">
                              {m.holdingDays >= 365
                                ? `${(m.holdingDays / 365).toFixed(1)} yr`
                                : m.holdingDays > 0
                                  ? `${m.holdingDays} d`
                                  : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Realised gains</CardTitle>
                    <CardDescription>Booked profit, split by tax term.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <RowStat
                      label="Short term"
                      value={signedINR(totals?.realizedShortTerm ?? 0)}
                      tone={totals?.realizedShortTerm ?? 0}
                    />
                    <RowStat
                      label="Long term"
                      value={signedINR(totals?.realizedLongTerm ?? 0)}
                      tone={totals?.realizedLongTerm ?? 0}
                    />
                    <RowStat
                      label="Income"
                      value={formatINR(totals?.income ?? 0)}
                      tone={totals?.income ?? 0}
                    />
                    <RowStat label="Fees paid" value={formatINR(totals?.totalFees ?? 0)} tone={0} />
                    <div className="border-t pt-2">
                      <RowStat
                        label="Total realised"
                        value={signedINR(totals?.realized ?? 0)}
                        tone={totals?.realized ?? 0}
                        bold
                      />
                    </div>
                    <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">
                      Terms use the statutory holding period per asset class. Indexation,
                      grandfathering and the ₹1.25L equity exemption are not applied — treat this as a
                      planning aid, not a tax return.
                    </p>
                  </CardContent>
                </Card>

                <SipCard metrics={metrics} />
              </div>
            </div>

            <ContributionsCard rows={p?.monthlyContributions ?? []} />
          </TabsContent>
        </Tabs>
      </div>

      {/* ============================== overlays ============================== */}
      <HoldingFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        accounts={accounts}
        initial={editingHolding}
      />
      <UpdatePricesDialog
        open={pricesOpen}
        onOpenChange={setPricesOpen}
        metrics={metrics}
        suggestedDate={p?.asOf}
      />
      <HoldingDetailSheet
        holdingId={detailId}
        onOpenChange={(o) => !o && setDetailId(null)}
        accounts={accounts}
      />
    </TooltipProvider>
  );
}

/* ============================== value vs invested ============================== */

function ValueVsInvestedCard({
  series,
  range,
}: {
  series: Array<{ date: string; invested: number; value: number }>;
  range: Range;
}) {
  const data = Array.isArray(series) ? series : [];
  const last = data[data.length - 1];
  const gap = last ? last.value - last.invested : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Value vs invested</CardTitle>
            <CardDescription>
              The gap between the two lines is your gain. Built from the prices you have entered, so
              gaps are carried forward, never guessed.
            </CardDescription>
          </div>
          {last && (
            <div className="text-right">
              <p className="font-display text-lg font-semibold tabular-nums">
                {formatINR(last.value)}
              </p>
              <DeltaText
                value={gap}
                pct={last.invested > 0 ? (gap / last.invested) * 100 : null}
                compact
                className="text-xs"
              />
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {data.length < 2 ? (
          <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            Not enough history in the {RANGE_LABEL[range]} window to draw a line yet. Log a few
            transactions and update prices — this chart fills in from month-end snapshots.
          </p>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                <defs>
                  <linearGradient id="pfValueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={VALUE_COLOR} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={VALUE_COLOR} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="pfInvestedFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={INVESTED_COLOR} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={INVESTED_COLOR} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: string) => monthLabel(String(v).slice(0, 7))}
                  stroke="currentColor"
                  className="text-muted-foreground"
                  minTickGap={24}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => formatLakhCrore(v)}
                  stroke="currentColor"
                  className="text-muted-foreground"
                  width={64}
                />
                <RTooltip
                  formatter={(v: any, name: any) => [formatINR(Number(v)), String(name)]}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area
                  type="monotone"
                  dataKey="invested"
                  name="Invested"
                  stroke={INVESTED_COLOR}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  fill="url(#pfInvestedFill)"
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  name="Value"
                  stroke={VALUE_COLOR}
                  strokeWidth={2.5}
                  fill="url(#pfValueFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ============================== movers ============================== */

function MoversCard({
  title,
  description,
  rows,
  onOpen,
  positive = false,
}: {
  title: string;
  description: string;
  rows: HoldingMetrics[];
  onOpen: (id: string) => void;
  positive?: boolean;
}) {
  const list = (Array.isArray(rows) ? rows : []).slice(0, 5);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {list.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
            {positive
              ? "No gains to show yet — update your prices and this fills in."
              : "Nothing in the red. Enjoy it while it lasts."}
          </p>
        ) : (
          <div className="space-y-1">
            {list.map((m) => (
              <button
                key={m.holdingId}
                type="button"
                onClick={() => onOpen(m.holdingId)}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/60"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{m.symbol}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {assetClassLabel(m.assetClass)} · {formatINR(m.currentValue)}
                  </p>
                </div>
                <DeltaText
                  value={m.unrealized}
                  pct={m.unrealizedPct}
                  showIcon={false}
                  compact
                  className="shrink-0 text-sm"
                />
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ============================== allocation ============================== */

function AllocationCard({
  title,
  description,
  slices,
  wide = false,
}: {
  title: string;
  description: string;
  slices: AllocationSlice[];
  wide?: boolean;
}) {
  const data = (Array.isArray(slices) ? slices : []).filter((s) => s.value > 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-xs text-muted-foreground">
            Nothing valued yet. Enter current prices and the split appears here.
          </p>
        ) : (
          <div className={cn("gap-4", wide ? "grid md:grid-cols-[14rem_1fr]" : "space-y-4")}>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="value"
                    nameKey="label"
                    innerRadius="58%"
                    outerRadius="88%"
                    paddingAngle={2}
                    stroke="none"
                  >
                    {data.map((_s, i) => (
                      <Cell key={i} fill={chartColor(i)} />
                    ))}
                  </Pie>
                  <RTooltip
                    formatter={(v: any, name: any) => [formatINR(Number(v)), String(name)]}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-2">
              {data.map((s, i) => (
                <div key={s.key} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <LegendDot color={chartColor(i)} />
                      <span className="truncate">{s.label}</span>
                      {s.count > 1 && (
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {s.count}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {s.pct.toFixed(1)}%
                      <span className="ml-2 text-xs text-muted-foreground">
                        {formatLakhCrore(s.value)}
                      </span>
                    </span>
                  </div>
                  <AllocationBar pct={s.pct} color={chartColor(i)} />
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ============================== drift / rebalance ============================== */

function DriftCard({
  rows,
  metrics,
  onOpen,
}: {
  rows: Array<{ holdingId: string; symbol: string; targetPct: number; actualPct: number; driftPct: number }>;
  metrics: HoldingMetrics[];
  onOpen: (id: string) => void;
}) {
  const list = Array.isArray(rows) ? rows : [];
  const byId = useMemo(() => new Map(metrics.map((m) => [m.holdingId, m])), [metrics]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Target vs actual</CardTitle>
        <CardDescription>
          Set a target allocation on a holding and it shows up here. Positive drift means you are
          overweight — that is the one to trim first.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {list.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-xs text-muted-foreground">
            No targets set yet. Edit a holding and give it a target allocation % to start tracking
            drift.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Holding</TableHead>
                <TableHead className="text-right">Target</TableHead>
                <TableHead className="text-right">Actual</TableHead>
                <TableHead className="text-right">Drift</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...list]
                .sort((a, b) => Math.abs(b.driftPct) - Math.abs(a.driftPct))
                .map((d) => {
                  const m = byId.get(d.holdingId);
                  return (
                    <TableRow
                      key={d.holdingId}
                      className="cursor-pointer"
                      onClick={() => onOpen(d.holdingId)}
                    >
                      <TableCell className="max-w-[14rem]">
                        <p className="truncate font-medium">{d.symbol}</p>
                        {m && (
                          <p className="truncate text-xs text-muted-foreground">
                            {assetClassLabel(m.assetClass)}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                        {d.targetPct.toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {d.actualPct.toFixed(1)}%
                      </TableCell>
                      <TableCell
                        className={cn("text-right text-sm tabular-nums", signClass(d.driftPct))}
                      >
                        {pctText(d.driftPct)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant="outline"
                          className={cn(
                            "font-normal",
                            Math.abs(d.driftPct) < 2 && "text-muted-foreground",
                          )}
                        >
                          {Math.abs(d.driftPct) < 2
                            ? "On target"
                            : d.driftPct > 0
                              ? "Trim"
                              : "Top up"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/* ============================== contributions ============================== */

function ContributionsCard({
  rows,
}: {
  rows: Array<{ month: string; invested: number; withdrawn: number; net: number; sipAmount: number }>;
}) {
  const data = (Array.isArray(rows) ? rows : []).map((r) => ({
    ...r,
    label: monthLabel(r.month),
    // Withdrawals plot downward so the bar chart reads as money in vs money out.
    withdrawnNeg: -Math.abs(r.withdrawn),
  }));
  const hasAny = data.some((d) => d.invested !== 0 || d.withdrawn !== 0);

  const totalIn = data.reduce((s, d) => s + d.invested, 0);
  const totalOut = data.reduce((s, d) => s + Math.abs(d.withdrawn), 0);
  const activeMonths = data.filter((d) => d.invested > 0).length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Money in, money out</CardTitle>
            <CardDescription>
              Contributions and withdrawals by month. Consistency here matters more than any single
              month&apos;s return.
            </CardDescription>
          </div>
          {hasAny && (
            <div className="flex gap-4 text-right text-xs">
              <div>
                <p className="text-muted-foreground">In</p>
                <p className="font-medium tabular-nums">{formatLakhCrore(totalIn)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Out</p>
                <p className="font-medium tabular-nums">{formatLakhCrore(totalOut)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Months invested</p>
                <p className="font-medium tabular-nums">{activeMonths}</p>
              </div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!hasAny ? (
          <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            No contributions logged in this window yet.
          </p>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  stroke="currentColor"
                  className="text-muted-foreground"
                  minTickGap={16}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => formatLakhCrore(v)}
                  stroke="currentColor"
                  className="text-muted-foreground"
                  width={64}
                />
                <RTooltip
                  formatter={(v: any, name: any) => [formatINR(Math.abs(Number(v))), String(name)]}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="invested" name="Invested" fill={GAIN_COLOR} radius={[3, 3, 0, 0]} />
                <Bar dataKey="withdrawnNeg" name="Withdrawn" fill={LOSS_COLOR} radius={[0, 0, 3, 3]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ============================== SIP summary ============================== */

function SipCard({ metrics }: { metrics: HoldingMetrics[] }) {
  const sips = metrics.filter((m) => m.sip.isSip);
  const monthly = sips.reduce((sum, m) => {
    const a = m.sip.averageAmount;
    if (m.sip.cadence === "weekly") return sum + a * 4.33;
    if (m.sip.cadence === "quarterly") return sum + a / 3;
    return sum + a;
  }, 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">SIPs detected</CardTitle>
        <CardDescription>
          Inferred from the cadence and size of your instalments — nothing to configure.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {sips.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
            No recurring pattern found yet. Log three or more instalments at a regular interval and
            they will be picked up automatically.
          </p>
        ) : (
          <>
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Roughly per month
              </p>
              <p className="font-display text-xl font-semibold tabular-nums">{formatINR(monthly)}</p>
              <p className="text-xs text-muted-foreground">
                across {sips.length} {sips.length === 1 ? "SIP" : "SIPs"}
              </p>
            </div>
            {sips.map((m) => (
              <div key={m.holdingId} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">{m.symbol}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {formatINR(m.sip.averageAmount)} · {m.sip.cadence ?? "irregular"} · {m.sip.count}x
                </span>
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ============================== bits ============================== */

function RowStat({
  label,
  value,
  tone,
  bold = false,
}: {
  label: string;
  value: string;
  tone: number;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tabular-nums", bold && "font-semibold", signClass(tone))}>{value}</span>
    </div>
  );
}
