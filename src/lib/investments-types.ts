// ---------------------------------------------------------------------------
// Investments — shared shapes (single source of truth)
//
// PURE TypeScript. No supabase, no server-only modules, no React, no zod.
// This file is imported by BOTH the server functions (src/lib/*.functions.ts)
// and the Investments page, so it must run in Node (SSR) and in the browser.
//
// Server code should build its zod schemas FROM the constants exported here
// (e.g. z.enum(TXN_KINDS), z.enum(ASSET_CLASS_VALUES)) rather than restating
// the literals.
// ---------------------------------------------------------------------------

import type { AccountTypeDef } from "./account-types";

// ---------------------------------------------------------------------------
// Transaction kinds
// ---------------------------------------------------------------------------

export const TXN_KINDS = [
  "buy",
  "sell",
  "sip",
  "dividend",
  "bonus",
  "split",
  "interest",
  "contribution",
  "withdrawal",
] as const;

export type TxnKind = (typeof TXN_KINDS)[number];

export const TXN_KIND_LABELS: Record<TxnKind, string> = {
  buy: "Buy",
  sell: "Sell",
  sip: "SIP",
  dividend: "Dividend",
  bonus: "Bonus units",
  split: "Split / Bonus ratio",
  interest: "Interest credited",
  contribution: "Contribution",
  withdrawal: "Withdrawal",
};

/** Short help text shown next to the kind picker in the ledger dialog. */
export const TXN_KIND_HINTS: Record<TxnKind, string> = {
  buy: "Units bought at a price. Fees are capitalised into cost.",
  sell: "Units sold. Realised gain is matched FIFO against your oldest lots.",
  sip: "A systematic instalment — same as a buy, but tracked for SIP analytics.",
  dividend: "Cash payout. Does not change units.",
  bonus: "Free units received. Lands at zero cost and lowers your average.",
  split: "Enter the ratio multiplier in Quantity (1:2 split → 2).",
  interest: "Interest credited (PPF / EPF / FD). Does not change units.",
  contribution: "Money added to a scheme (PPF / EPF / NPS / chit fund).",
  withdrawal: "Money taken out of a scheme. Matched FIFO like a sell.",
};

/** Kinds that ADD units to the position (cost basis lots are created). */
export const ADDS_UNITS = ["buy", "sip", "contribution"] as const satisfies readonly TxnKind[];
/** Kinds that REMOVE units from the position (FIFO lots are consumed). */
export const REMOVES_UNITS = ["sell", "withdrawal"] as const satisfies readonly TxnKind[];
/** Kinds that move cash only — no unit change (income). */
export const CASH_ONLY_KINDS = ["dividend", "interest"] as const satisfies readonly TxnKind[];
/** Kinds that restate existing units without any cash moving. */
export const UNIT_ADJUST_KINDS = ["bonus", "split"] as const satisfies readonly TxnKind[];

export const ADDS_UNITS_SET: ReadonlySet<TxnKind> = new Set<TxnKind>(ADDS_UNITS);
export const REMOVES_UNITS_SET: ReadonlySet<TxnKind> = new Set<TxnKind>(REMOVES_UNITS);
export const CASH_ONLY_SET: ReadonlySet<TxnKind> = new Set<TxnKind>(CASH_ONLY_KINDS);
export const UNIT_ADJUST_SET: ReadonlySet<TxnKind> = new Set<TxnKind>(UNIT_ADJUST_KINDS);

export function addsUnits(kind: string): boolean {
  return ADDS_UNITS_SET.has(kind as TxnKind);
}
export function removesUnits(kind: string): boolean {
  return REMOVES_UNITS_SET.has(kind as TxnKind);
}
export function isCashOnlyKind(kind: string): boolean {
  return CASH_ONLY_SET.has(kind as TxnKind);
}
export function isUnitAdjustKind(kind: string): boolean {
  return UNIT_ADJUST_SET.has(kind as TxnKind);
}
export function isTxnKind(value: unknown): value is TxnKind {
  return typeof value === "string" && (TXN_KINDS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Asset classes
//
// ltcgMonths = minimum CALENDAR holding period for the gain to count as
// long-term under the Income Tax Act. 0 means the instrument has no
// STCG/LTCG distinction at all (PPF/EPF/NPS/FD/post-office are taxed on
// interest/withdrawal rules, not capital gains) — see investments-calc.ts.
// ---------------------------------------------------------------------------

export const ASSET_CLASSES = [
  { value: "equity_mf", label: "Equity Mutual Fund", unitsLabel: "units", ltcgMonths: 12, group: "market" },
  { value: "debt_mf", label: "Debt Mutual Fund", unitsLabel: "units", ltcgMonths: 24, group: "market" },
  { value: "hybrid_mf", label: "Hybrid Mutual Fund", unitsLabel: "units", ltcgMonths: 24, group: "market" },
  { value: "elss", label: "ELSS (80C)", unitsLabel: "units", ltcgMonths: 12, group: "market" },
  { value: "index_etf", label: "Index Fund / ETF", unitsLabel: "units", ltcgMonths: 12, group: "market" },
  { value: "stocks", label: "Stocks / Equity", unitsLabel: "shares", ltcgMonths: 12, group: "market" },
  { value: "reit_invit", label: "REIT / InvIT", unitsLabel: "units", ltcgMonths: 12, group: "market" },
  { value: "gold_sgb", label: "Sovereign Gold Bond", unitsLabel: "grams", ltcgMonths: 12, group: "gold" },
  { value: "gold_digital", label: "Digital Gold", unitsLabel: "grams", ltcgMonths: 24, group: "gold" },
  { value: "gold_physical", label: "Physical Gold", unitsLabel: "grams", ltcgMonths: 24, group: "gold" },
  { value: "ppf", label: "PPF", unitsLabel: "₹", ltcgMonths: 0, group: "retirement" },
  { value: "epf", label: "EPF / PF", unitsLabel: "₹", ltcgMonths: 0, group: "retirement" },
  { value: "nps", label: "NPS", unitsLabel: "units", ltcgMonths: 0, group: "retirement" },
  { value: "fd_rd", label: "FD / RD", unitsLabel: "₹", ltcgMonths: 0, group: "deposits" },
  { value: "post_office", label: "Post Office Scheme", unitsLabel: "₹", ltcgMonths: 0, group: "post_office" },
  { value: "bonds", label: "Bonds / Debentures", unitsLabel: "units", ltcgMonths: 24, group: "market" },
  { value: "crypto", label: "Crypto", unitsLabel: "units", ltcgMonths: 0, group: "other" },
  { value: "other", label: "Other", unitsLabel: "units", ltcgMonths: 24, group: "other" },
] as const;

export type AssetClass = (typeof ASSET_CLASSES)[number]["value"];

/** Groups reuse the account-types group vocabulary so the UI can share labels. */
export type AssetGroup = AccountTypeDef["group"];

export type AssetClassDef = {
  value: AssetClass;
  label: string;
  unitsLabel: string;
  ltcgMonths: number;
  group: AssetGroup;
};

export const ASSET_CLASS_VALUES = ASSET_CLASSES.map((a) => a.value) as unknown as readonly [
  AssetClass,
  ...AssetClass[],
];

export const ASSET_CLASS_BY_VALUE: Record<AssetClass, AssetClassDef> = Object.fromEntries(
  ASSET_CLASSES.map((a) => [a.value, a as AssetClassDef]),
) as Record<AssetClass, AssetClassDef>;

export function isAssetClass(value: unknown): value is AssetClass {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ASSET_CLASS_BY_VALUE, value);
}

export function assetClassDef(value: unknown): AssetClassDef {
  return isAssetClass(value) ? ASSET_CLASS_BY_VALUE[value] : ASSET_CLASS_BY_VALUE.other;
}

/** Human label for an asset class, falling back to "Other". */
export function assetClassLabel(value: unknown): string {
  return assetClassDef(value).label;
}

/** "units" / "shares" / "grams" / "₹" — MF speaks units, gold speaks grams. */
export function unitsLabelFor(value: unknown): string {
  return assetClassDef(value).unitsLabel;
}

/**
 * Account categories that show up on the Investments page.
 * real_estate is deliberately excluded: it is an asset but has no units,
 * so it is valuation-only and lives on the Net Worth surface instead.
 */
export const INVESTMENT_ACCOUNT_CATEGORIES: readonly string[] = [
  "mutual_fund",
  "stocks",
  "gold",
  "nps",
  "ppf",
  "epf",
  "post_office",
  "fixed_deposit",
  "recurring_deposit",
  "chit_fund",
] as const;

export function isInvestmentAccountCategory(category: unknown): boolean {
  return typeof category === "string" && INVESTMENT_ACCOUNT_CATEGORIES.includes(category);
}

/** Best-guess default asset class for a new holding inside an account. */
export function assetClassForAccountCategory(c: string): AssetClass {
  switch (c) {
    case "mutual_fund":
      return "equity_mf";
    case "stocks":
      return "stocks";
    // A "Gold" account can be physical / digital / SGB — digital gold is the
    // safest default because it is priced per gram like the other two but has
    // no bond-specific rules. The user can switch per holding.
    case "gold":
      return "gold_digital";
    case "nps":
      return "nps";
    case "ppf":
      return "ppf";
    case "epf":
      return "epf";
    case "post_office":
      return "post_office";
    case "fixed_deposit":
    case "recurring_deposit":
      return "fd_rd";
    case "chit_fund":
    case "real_estate":
    default:
      return "other";
  }
}

// ---------------------------------------------------------------------------
// Row shapes (mirror the DB, loosely — numeric columns can arrive as strings
// from Postgres so every consumer must coerce with Number()).
// ---------------------------------------------------------------------------

export type HoldingTxn = {
  id: string;
  holding_id: string;
  txn_date: string; // "YYYY-MM-DD"
  quantity: number;
  price: number;
  kind: TxnKind;
  fees: number;
  /** Explicit cash amount — used for dividend/interest where qty×price is meaningless. */
  amount: number | null;
  notes: string | null;
  created_at?: string;
};

export type HoldingRow = {
  id: string;
  account_id: string;
  household_id: string | null;
  symbol: string;
  name: string | null;
  quantity: number;
  avg_price: number;
  current_price: number;
  asset_class: AssetClass;
  isin: string | null;
  folio_number: string | null;
  currency: string;
  units_label: string | null;
  sector: string | null;
  target_allocation_pct: number | null;
  notes: string | null;
  is_active: boolean;
  updated_at: string;
  price_updated_at: string | null;
};

/** Minimal account reference the calc layer needs to label allocations. */
export type InvestmentAccountRef = {
  id: string;
  name: string | null;
  institution?: string | null;
  category?: string | null;
  group?: AssetGroup | null;
  currency?: string | null;
};

export type PriceHistoryPoint = { price_date: string; price: number };
/** Keyed by holding symbol. */
export type PriceHistoryMap = Record<string, PriceHistoryPoint[]>;
/** Keyed by holding id. */
export type TxnsByHolding = Record<string, HoldingTxn[]>;

// ---------------------------------------------------------------------------
// Computed shapes
// ---------------------------------------------------------------------------

export type SipCadence = "weekly" | "monthly" | "quarterly" | "irregular";

export type SipInfo = {
  isSip: boolean;
  cadence: SipCadence | null;
  averageAmount: number;
  count: number;
};

export type CapitalGainTerm = "short" | "long";

export type HoldingMetrics = {
  holdingId: string;
  symbol: string;
  name: string;
  assetClass: AssetClass;
  accountId: string;
  unitsLabel: string;
  currency: string;
  /** Units still held (recomputed from the ledger — see computeHoldingMetrics). */
  quantity: number;
  avgCost: number;
  currentPrice: number;
  /** Cost basis of the OPEN position only. */
  invested: number;
  currentValue: number;
  unrealized: number;
  /** Percent, e.g. 12.5 means +12.5%. */
  unrealizedPct: number;
  /** "If I sold today" tax view of the open lots. */
  unrealizedShortTerm: number;
  unrealizedLongTerm: number;
  realized: number;
  realizedShortTerm: number;
  realizedLongTerm: number;
  /** Cost basis and proceeds of the CLOSED part of the position. */
  realizedCost: number;
  realizedProceeds: number;
  soldQty: number;
  income: number;
  totalFees: number;
  /** unrealized + realized + income */
  totalReturn: number;
  /** Percent of total capital deployed (open cost + cost of units already sold). */
  totalReturnPct: number;
  /** Annualised money-weighted return as a DECIMAL (0.1432 = 14.32%). null when undefined. */
  xirr: number | null;
  firstTxnDate: string | null;
  lastTxnDate: string | null;
  holdingDays: number;
  txnCount: number;
  /** From holdings.target_allocation_pct, 0 when unset. */
  targetPct: number;
  sip: SipInfo;
  warnings: string[];
  /** price_updated_at is null or older than PRICE_STALE_DAYS. */
  priceStale: boolean;
  isActive: boolean;
};

export type PortfolioTotals = {
  currentValue: number;
  invested: number;
  unrealized: number;
  unrealizedPct: number;
  realized: number;
  realizedShortTerm: number;
  realizedLongTerm: number;
  income: number;
  totalFees: number;
  totalReturn: number;
  totalReturnPct: number;
  holdingCount: number;
  activeHoldingCount: number;
};

export type AllocationSlice = {
  key: string;
  label: string;
  value: number;
  /** Percent of total current value. */
  pct: number;
  invested: number;
  unrealized: number;
  count: number;
  group?: AssetGroup;
};

export type ValuePoint = { date: string; invested: number; value: number };

export type MonthlyContribution = {
  /** "YYYY-MM" */
  month: string;
  invested: number;
  withdrawn: number;
  net: number;
  sipAmount: number;
};

export type DriftRow = {
  holdingId: string;
  symbol: string;
  targetPct: number;
  actualPct: number;
  driftPct: number;
};

export type PortfolioComputation = {
  metrics: HoldingMetrics[];
  totals: PortfolioTotals;
  /** Portfolio-level money-weighted return, decimal. */
  xirr: number | null;
  allocationByAssetClass: AllocationSlice[];
  allocationByAccount: AllocationSlice[];
  allocationByGroup: AllocationSlice[];
  bestPerformer: HoldingMetrics | null;
  worstPerformer: HoldingMetrics | null;
  asOf: string;
};

/** What the server function hands the page. */
export type PortfolioPayload = PortfolioComputation & {
  valueSeries: ValuePoint[];
  monthlyContributions: MonthlyContribution[];
  drift: DriftRow[];
  accounts: InvestmentAccountRef[];
  /** Echo of the requested range key, e.g. "1y" | "3y" | "all". */
  range: string;
};

/** Payload for the bulk "update prices" flow. */
export type PriceUpdateInput = {
  holdingId: string;
  price: number;
  priceDate?: string;
};

export const PRICE_STALE_DAYS = 7;

/** Label used when an asset group has no entry in GROUP_LABELS. */
export const GROUP_LABEL_FALLBACK = "Other";
