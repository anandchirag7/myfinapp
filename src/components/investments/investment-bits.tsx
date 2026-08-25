// ---------------------------------------------------------------------------
// Investments — small shared presentational pieces
//
// Pure presentation. No server functions, no react-query, no recharts. Kept
// free of recharts on purpose: passing a Recharts component (e.g. PieChart) as
// an `icon` prop has crashed this app before with a null-useContext error, so
// every icon slot here is typed as a LucideIcon and nothing else.
// ---------------------------------------------------------------------------

import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Minus, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatINR, formatLakhCrore, formatNumber } from "@/lib/format";
import { assetClassDef, type AssetClass } from "@/lib/investments-types";

/* ---------------------------- palette ---------------------------- */

/**
 * Same oklch palette the Accounts and Transactions pages use, so a category
 * keeps roughly the same hue as the user moves between surfaces.
 */
export const CHART_COLORS = [
  "oklch(0.55 0.14 200)",
  "oklch(0.6 0.14 155)",
  "oklch(0.65 0.14 70)",
  "oklch(0.6 0.16 320)",
  "oklch(0.55 0.18 25)",
  "oklch(0.6 0.12 260)",
  "oklch(0.6 0.12 40)",
  "oklch(0.5 0.06 100)",
];

export function chartColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}

/** Value line vs invested line — deliberately fixed, not palette-indexed. */
export const VALUE_COLOR = "oklch(0.55 0.14 200)";
export const INVESTED_COLOR = "oklch(0.6 0.03 260)";
export const GAIN_COLOR = "oklch(0.6 0.14 155)";
export const LOSS_COLOR = "oklch(0.55 0.18 25)";

/* ---------------------------- number helpers ---------------------------- */

/** Tailwind text colour for a signed number. Zero stays neutral, never green. */
export function signClass(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "text-muted-foreground";
  return n > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
}

/** "+12.4%" / "-3.0%" / "—". Input is already a percent (12.4), not a decimal. */
export function pctText(n: number | null | undefined, dp = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(dp)}%`;
}

/** XIRR arrives as a DECIMAL (0.1432). Renders "+14.3%". */
export function xirrText(decimal: number | null | undefined, dp = 1): string {
  if (decimal == null || !Number.isFinite(decimal)) return "—";
  return pctText(decimal * 100, dp);
}

/** "+₹1.204" with an explicit sign so gains and losses never look alike. */
export function signedINR(n: number): string {
  if (!Number.isFinite(n)) return formatINR(0);
  return `${n > 0 ? "+" : ""}${formatINR(n)}`;
}

/** Units render to 4dp for MF, but trailing zeros are noise. Trim them. */
export function formatUnits(qty: number, label?: string | null): string {
  if (!Number.isFinite(qty)) return "0";
  const rounded = Math.abs(qty) < 1000 ? Number(qty.toFixed(4)) : Number(qty.toFixed(2));
  const text = formatNumber(rounded);
  return label ? `${text} ${label}` : text;
}

/* ---------------------------- DeltaText ---------------------------- */

/**
 * A signed amount with its percent and a direction arrow. Used in KPI cards and
 * in every holding row, so it has to stay compact.
 */
export function DeltaText({
  value,
  pct,
  className,
  showIcon = true,
  compact = false,
}: {
  value: number;
  pct?: number | null;
  className?: string;
  showIcon?: boolean;
  compact?: boolean;
}) {
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus;
  return (
    <span className={cn("inline-flex items-center gap-1 tabular-nums", signClass(value), className)}>
      {showIcon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />}
      <span>{compact ? `${value > 0 ? "+" : ""}${formatLakhCrore(value)}` : signedINR(value)}</span>
      {pct != null && Number.isFinite(pct) && (
        <span className="text-xs opacity-80">({pctText(pct)})</span>
      )}
    </span>
  );
}

/* ---------------------------- KpiCard ---------------------------- */

export function KpiCard({
  label,
  value,
  hint,
  delta,
  deltaPct,
  icon: Icon,
  accent,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: number;
  deltaPct?: number | null;
  /** Lucide icon only — never a Recharts component. */
  icon?: LucideIcon;
  /** Colours the icon tile. Defaults to the neutral accent. */
  accent?: "neutral" | "gain" | "loss" | "info";
  className?: string;
}) {
  const tile =
    accent === "gain"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : accent === "loss"
        ? "bg-red-500/10 text-red-600 dark:text-red-400"
        : accent === "info"
          ? "bg-sky-500/10 text-sky-600 dark:text-sky-400"
          : "bg-accent text-muted-foreground";

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="truncate font-display text-xl font-semibold tabular-nums" title={value}>
            {value}
          </p>
          {delta != null ? (
            <DeltaText value={delta} pct={deltaPct} compact className="text-xs" />
          ) : hint ? (
            <p className="truncate text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
        {Icon && (
          <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", tile)}>
            <Icon className="h-4 w-4" aria-hidden />
          </span>
        )}
      </CardContent>
    </Card>
  );
}

export function KpiSkeleton() {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="w-full space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-9 w-9 rounded-lg" />
      </CardContent>
    </Card>
  );
}

/* ---------------------------- XirrBadge ---------------------------- */

/**
 * XIRR is money-weighted and annualised, which is not obvious from a number, so
 * the badge always carries a tooltip explaining it. `value` is a decimal.
 */
export function XirrBadge({
  value,
  className,
  label = "XIRR",
}: {
  value: number | null | undefined;
  className?: string;
  label?: string;
}) {
  const defined = value != null && Number.isFinite(value);
  const positive = defined && (value as number) > 0;
  const negative = defined && (value as number) < 0;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={cn(
            "cursor-default gap-1 tabular-nums",
            positive && "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
            negative && "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
            !defined && "text-muted-foreground",
            className,
          )}
        >
          <span className="opacity-70">{label}</span>
          {xirrText(value)}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-[16rem]">
        {defined
          ? "Annualised money-weighted return. Accounts for the date and size of every instalment, so it is the right number to compare a SIP against an FD."
          : "Needs at least one buy and one positive value to solve. Add a current price or a second transaction."}
      </TooltipContent>
    </Tooltip>
  );
}

/* ---------------------------- AssetClassPill ---------------------------- */

export function AssetClassPill({
  assetClass,
  className,
}: {
  assetClass: AssetClass | string;
  className?: string;
}) {
  const def = assetClassDef(assetClass);
  return (
    <Badge variant="secondary" className={cn("font-normal", className)}>
      {def.label}
    </Badge>
  );
}

/* ---------------------------- term / tax pills ---------------------------- */

/**
 * Long-term vs short-term split. Asset classes with ltcgMonths = 0 (PPF, EPF,
 * NPS, FD, post office) have no capital-gains distinction at all, so showing a
 * split there would be actively misleading — we render nothing.
 */
export function TermSplit({
  assetClass,
  shortTerm,
  longTerm,
  className,
}: {
  assetClass: AssetClass | string;
  shortTerm: number;
  longTerm: number;
  className?: string;
}) {
  const def = assetClassDef(assetClass);
  if (def.ltcgMonths === 0) return null;
  if (shortTerm === 0 && longTerm === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-2 text-xs", className)}>
      <span className="text-muted-foreground">
        Short term <span className={cn("tabular-nums", signClass(shortTerm))}>{signedINR(shortTerm)}</span>
      </span>
      <span className="text-muted-foreground/50">·</span>
      <span className="text-muted-foreground">
        Long term <span className={cn("tabular-nums", signClass(longTerm))}>{signedINR(longTerm)}</span>
      </span>
      <span className="text-muted-foreground/60">({def.ltcgMonths}mo to qualify)</span>
    </div>
  );
}

/* ---------------------------- StalePriceHint ---------------------------- */

/**
 * Prices are entered by hand in this app, so a stale NAV quietly makes every
 * number on the page wrong. This is the nudge, and it is a button — the fix is
 * one click away.
 */
export function StalePriceHint({
  count,
  onUpdate,
  className,
}: {
  count: number;
  onUpdate?: () => void;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <button
      type="button"
      onClick={onUpdate}
      disabled={!onUpdate}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-left text-xs text-amber-700 transition-colors dark:text-amber-300",
        onUpdate && "hover:bg-amber-500/15",
        className,
      )}
    >
      <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
      <span className="flex-1">
        {count === 1 ? "1 holding has a stale price" : `${count} holdings have stale prices`} — your
        current value may be out of date.
      </span>
      {onUpdate && <span className="shrink-0 font-medium underline">Update now</span>}
    </button>
  );
}

/* ---------------------------- warnings ---------------------------- */

/** Data-quality notes from the calc layer (negative units, missing prices…). */
export function WarningList({ warnings, className }: { warnings: string[]; className?: string }) {
  if (!warnings?.length) return null;
  return (
    <ul className={cn("space-y-1 text-xs text-amber-700 dark:text-amber-300", className)}>
      {warnings.map((w, i) => (
        <li key={i} className="flex gap-1.5">
          <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          <span>{w}</span>
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------- misc ---------------------------- */

/** Label/value pair used inside the detail sheet grids. */
export function MiniStat({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg bg-muted/40 p-2.5", className)}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium tabular-nums">{value}</p>
    </div>
  );
}

/** Horizontal allocation bar — used in the legend beside the donut. */
export function AllocationBar({
  pct,
  color,
  className,
}: {
  pct: number;
  color: string;
  className?: string;
}) {
  const width = Math.max(0, Math.min(100, pct));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div className="h-full rounded-full" style={{ width: `${width}%`, background: color }} />
    </div>
  );
}

export function LegendDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", className)}
      style={{ background: color }}
    />
  );
}
