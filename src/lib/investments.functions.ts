// ---------------------------------------------------------------------------
// Investments — server functions (portfolio read + holdings / ledger / NAV writes)
//
// XIRR is money-weighted and lives in TypeScript (investments-calc.ts), not SQL:
// it needs the whole cash-flow ladder plus one terminal flow at market value, and
// Postgres has no XIRR. Portfolio XIRR concatenates every holding's flows with the
// per-holding terminal flow suppressed, then appends ONE aggregate terminal flow,
// so today's value is never counted twice. FIFO is the single source of truth for
// cost basis: the DB owns an authoritative replay (rpc recompute_holding) which we
// call after every ledger write, with fifoCostBasis() in TS as the fallback when
// the migration has not been applied. Manual NAV entry is the ONLY price source —
// updateHoldingPrices writes price_history per (household, symbol, date), stamps
// holdings.current_price / price_updated_at, then resyncs accounts.current_balance
// to market value so net worth stays correct. Tenancy: every handler resolves
// getHouseholdId(context) and re-verifies each account / holding id against it;
// client ids and the denormalised holdings.household_id are never trusted alone.
// ---------------------------------------------------------------------------

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getHouseholdId } from "@/lib/household.server";
import {
  ACCOUNT_TYPE_BY_CATEGORY,
  GROUP_LABELS,
  type AccountCategory,
} from "@/lib/account-types";
import {
  ASSET_CLASS_VALUES,
  GROUP_LABEL_FALLBACK,
  INVESTMENT_ACCOUNT_CATEGORIES,
  TXN_KINDS,
  TXN_KIND_LABELS,
  assetClassDef,
  isCashOnlyKind,
  removesUnits,
  type AllocationSlice,
  type AssetGroup,
  type HoldingMetrics,
  type HoldingRow,
  type HoldingTxn,
  type InvestmentAccountRef,
  type MonthlyContribution,
  type PortfolioPayload,
  type PriceHistoryMap,
  type PriceHistoryPoint,
  type TxnKind,
  type TxnsByHolding,
} from "@/lib/investments-types";
import {
  addMonthsISO,
  buildValueSeries,
  computeHoldingMetrics,
  computePortfolio,
  drift as computeDrift,
  fifoCostBasis,
  monthlyContributions,
  roundTo,
  toDayKey,
  toNum,
  unrealizedTermSplit,
} from "@/lib/investments-calc";

// ---------------------------------------------------------------------------
// Local constants + tiny helpers
// ---------------------------------------------------------------------------

/** Supabase caps a select at 1000 rows; every unbounded read is range-paginated. */
const PAGE = 1000;
/** Hard stop so a pathological household can never stream unbounded rows into RAM. */
const MAX_ROWS = 60_000;
/** Max ids per `.in(...)` filter — keeps the generated URL well under any limit. */
const IN_CHUNK = 100;
/** Largest number we accept anywhere. numeric(18,4) can hold far more, humans cannot. */
const AMOUNT_CAP = 1e12;
/** Chart points in the value-vs-invested series (month-end buckets, downsampled). */
const SERIES_BUCKETS = 72;
/** Deliberately vague so a probe cannot distinguish "absent" from "another household's". */
const NOT_FOUND = "Holding not found";

const RANGE_MONTHS: Record<string, number> = { "1y": 12, "3y": 36, "5y": 60 };

/**
 * Ticker-shaped asset classes get their symbol upper-cased so RELIANCE / reliance
 * collapse onto one holding. Mutual-fund scheme names and folio-style symbols keep
 * the user's own casing.
 */
const UPPERCASE_SYMBOL_CLASSES: ReadonlySet<string> = new Set([
  "stocks",
  "index_etf",
  "reit_invit",
  "crypto",
]);

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function nowISO(): string {
  return new Date().toISOString();
}

function nullableStr(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function chunked<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function uniq(values: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  for (const v of values) {
    const s = String(v ?? "");
    if (s) seen.add(s);
  }
  return Array.from(seen);
}

/** Reject NaN / Infinity / absurd magnitudes with a message a human can act on. */
function finiteOrThrow(value: unknown, label: string): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) throw new Error(`${label} must be a number.`);
  if (Math.abs(n) > AMOUNT_CAP) throw new Error(`${label} is unrealistically large.`);
  return n;
}

/** Run an async mapper over items with a hard concurrency ceiling. */
async function mapCapped<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = new Array(Math.max(1, Math.min(limit, items.length))).fill(0).map(async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Range-paginate a select until a short page comes back — the same idiom as
 * listCategories in categories.functions.ts.
 */
async function fetchAllPages<T = any>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await run(from, from + PAGE - 1);
    if (error) throw error;
    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    if (page.length < PAGE) break;
    if (rows.length >= MAX_ROWS) return { rows, truncated: true };
  }
  return { rows, truncated: false };
}

// ---------------------------------------------------------------------------
// Row normalisation (Postgres numerics arrive as strings; new columns may be
// absent on a database where the Phase-3 migration has not run yet)
// ---------------------------------------------------------------------------

function normalizeHolding(row: any): HoldingRow {
  return {
    id: String(row?.id ?? ""),
    account_id: String(row?.account_id ?? ""),
    household_id: nullableStr(row?.household_id),
    symbol: String(row?.symbol ?? ""),
    name: nullableStr(row?.name),
    quantity: toNum(row?.quantity),
    avg_price: toNum(row?.avg_price),
    current_price: toNum(row?.current_price),
    asset_class: assetClassDef(row?.asset_class).value,
    isin: nullableStr(row?.isin),
    folio_number: nullableStr(row?.folio_number),
    currency: String(row?.currency ?? "") || "INR",
    units_label: nullableStr(row?.units_label),
    sector: nullableStr(row?.sector),
    target_allocation_pct:
      row?.target_allocation_pct === null || row?.target_allocation_pct === undefined
        ? null
        : toNum(row.target_allocation_pct),
    notes: nullableStr(row?.notes),
    is_active: row?.is_active !== false,
    updated_at: String(row?.updated_at ?? ""),
    price_updated_at: nullableStr(row?.price_updated_at),
  };
}

function normalizeTxn(row: any): HoldingTxn {
  return {
    id: String(row?.id ?? ""),
    holding_id: String(row?.holding_id ?? ""),
    txn_date: toDayKey(row?.txn_date),
    quantity: toNum(row?.quantity),
    price: toNum(row?.price),
    // Unknown kinds are passed through on purpose: fifoCostBasis reports them as a
    // warning instead of us silently rewriting the user's ledger.
    kind: String(row?.kind ?? "") as TxnKind,
    fees: toNum(row?.fees),
    amount: row?.amount === null || row?.amount === undefined ? null : toNum(row.amount),
    notes: nullableStr(row?.notes),
    created_at: row?.created_at ? String(row.created_at) : undefined,
  };
}

type PortfolioAccountRef = InvestmentAccountRef & { current_balance: number };

function groupForCategory(category: unknown): AssetGroup | null {
  const c = String(category ?? "") as AccountCategory;
  const def = ACCOUNT_TYPE_BY_CATEGORY[c];
  return def ? def.group : null;
}

function normalizeAccount(row: any): PortfolioAccountRef {
  return {
    id: String(row?.id ?? ""),
    name: nullableStr(row?.name),
    institution: nullableStr(row?.institution),
    category: nullableStr(row?.category),
    group: groupForCategory(row?.category),
    currency: String(row?.currency ?? "") || "INR",
    current_balance: toNum(row?.current_balance),
  };
}

// ---------------------------------------------------------------------------
// Tenancy guards
// ---------------------------------------------------------------------------

/** All account ids in the household, used to prove holding ownership set-wise. */
async function householdAccountIds(supabase: any, householdId: string): Promise<Set<string>> {
  const { rows } = await fetchAllPages<any>((from, to) =>
    (supabase as any)
      .from("accounts")
      .select("id")
      .eq("household_id", householdId)
      .range(from, to),
  );
  return new Set(rows.map((r: any) => String(r?.id ?? "")).filter(Boolean));
}

/** Verify a single account id belongs to the caller's household. */
async function requireOwnedAccount(supabase: any, householdId: string, accountId: string): Promise<any> {
  const { data, error } = await (supabase as any)
    .from("accounts")
    .select("id, name, category, currency, current_balance")
    .eq("id", accountId)
    .eq("household_id", householdId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Account not found in your household");
  return data;
}

/**
 * Fetch holdings by id and keep only those whose parent account really belongs to
 * the household. The account is embedded so this is ONE round trip per chunk, and
 * the ownership decision is made from accounts.household_id — never from the
 * denormalised holdings.household_id, which a client could try to spoof.
 */
async function fetchOwnedHoldings(
  supabase: any,
  householdId: string,
  holdingIds: string[],
): Promise<Map<string, any>> {
  const out = new Map<string, any>();
  const ids = uniq(holdingIds);
  if (ids.length === 0) return out;
  for (const chunk of chunked(ids, IN_CHUNK)) {
    const { data, error } = await (supabase as any)
      .from("holdings")
      .select("*, account:accounts!holdings_account_id_fkey(id, name, category, currency, current_balance, household_id)")
      .in("id", chunk);
    if (error) throw error;
    for (const row of Array.isArray(data) ? data : []) {
      const acct = (row as any)?.account;
      if (!acct || String(acct.household_id ?? "") !== householdId) continue;
      out.set(String((row as any)?.id ?? ""), row);
    }
  }
  return out;
}

async function requireOwnedHolding(supabase: any, householdId: string, holdingId: string): Promise<any> {
  const found = await fetchOwnedHoldings(supabase, householdId, [holdingId]);
  const row = found.get(String(holdingId));
  if (!row) throw new Error(NOT_FOUND);
  return row;
}

// ---------------------------------------------------------------------------
// Recompute chain (DB RPC first, TypeScript fallback second)
// ---------------------------------------------------------------------------

/**
 * Replay a holding's ledger through FIFO and write back quantity + avg_price.
 * Prefers rpc("recompute_holding"), which is tenant-guarded in SQL. When the
 * migration has not been applied the RPC is missing, so we recompute with
 * fifoCostBasis() and write directly — the same RPC-then-fallback shape as
 * recomputeAccountBalance in finance.functions.ts. `accountId` must already be
 * proven to belong to the caller's household; it re-scopes the fallback UPDATE.
 */
async function recomputeHolding(
  supabase: any,
  holdingId: string,
  accountId: string,
  assetClass: unknown,
): Promise<void> {
  try {
    const { error } = await (supabase.rpc as any)("recompute_holding", { p_holding_id: holdingId });
    if (!error) return;
  } catch (err) {
    console.warn("[investments] recompute_holding RPC unavailable, using TS fallback:", err);
  }

  try {
    const { rows } = await fetchAllPages<any>((from, to) =>
      (supabase as any)
        .from("holding_transactions")
        .select("*")
        .eq("holding_id", holdingId)
        .order("txn_date", { ascending: true })
        .order("created_at", { ascending: true })
        .range(from, to),
    );
    const fifo = fifoCostBasis(rows.map(normalizeTxn), {
      ltcgMonths: assetClassDef(assetClass).ltcgMonths,
    });
    await (supabase as any)
      .from("holdings")
      .update({
        quantity: roundTo(fifo.openQty, 4),
        avg_price: roundTo(fifo.avgCost, 4),
        updated_at: nowISO(),
      })
      .eq("id", holdingId)
      .eq("account_id", accountId);
  } catch (err) {
    console.error("[investments] TS fallback recompute of holding failed:", err);
  }
}

/**
 * Push market value (SUM(quantity * price) over active holdings) into
 * accounts.current_balance so the net-worth surface stays correct after a NAV or
 * ledger change. RPC first, TypeScript fallback second.
 *
 * The fallback carries the same two guards as the RPC (see the comment above
 * recompute_investment_account_balance in the Phase-3 migration) because both paths
 * write to a column that feeds net worth:
 *
 *   1. Zero active holdings -> DO NOT WRITE. An account with no unit-bearing holdings
 *      is tracked as a plain balance (PPF, EPF, FD, RD, post office, chit fund) and
 *      that balance was typed in by the user. Summing an empty list gives 0, and
 *      writing that 0 would wipe it — and wipe it out of net worth too.
 *   2. current_price of 0 -> fall back to avg_price. A position whose NAV has never
 *      been entered is worth its cost basis, not nothing.
 */
async function recomputeInvestmentAccountBalance(
  supabase: any,
  householdId: string,
  accountId: string,
): Promise<void> {
  try {
    const { error } = await (supabase.rpc as any)("recompute_investment_account_balance", {
      p_account_id: accountId,
    });
    if (!error) return;
  } catch (err) {
    console.warn(
      "[investments] recompute_investment_account_balance RPC unavailable, using TS fallback:",
      err,
    );
  }

  try {
    const { rows } = await fetchAllPages<any>((from, to) =>
      (supabase as any)
        .from("holdings")
        .select("quantity, avg_price, current_price, is_active")
        .eq("account_id", accountId)
        .range(from, to),
    );
    let value = 0;
    let active = 0;
    for (const h of rows) {
      if ((h as any)?.is_active === false) continue;
      active += 1;
      const price = toNum((h as any)?.current_price) || toNum((h as any)?.avg_price);
      value += toNum((h as any)?.quantity) * price;
    }
    // Guard 1 — never overwrite a hand-entered balance with a sum over zero rows.
    if (active === 0) return;
    await (supabase as any)
      .from("accounts")
      .update({ current_balance: roundTo(value, 2), updated_at: nowISO() })
      .eq("id", accountId)
      .eq("household_id", householdId);
  } catch (err) {
    console.error("[investments] TS fallback recompute of account balance failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Price history
// ---------------------------------------------------------------------------

/**
 * Read every manual price the household has entered plus any global (household_id
 * IS NULL) row, keyed by symbol. price_history.household_id only exists after the
 * Phase-3 migration, so a failure on the scoped filter is retried once without it
 * — RLS already restricts reads to "global OR mine", so the retry cannot widen
 * visibility. If the retry fails too we throw, per the house rule.
 */
async function fetchPriceHistory(
  supabase: any,
  householdId: string,
  symbols: string[],
): Promise<{ map: PriceHistoryMap; warnings: string[] }> {
  const map: PriceHistoryMap = {};
  const warnings: string[] = [];
  const list = uniq(symbols);
  if (list.length === 0) return { map, warnings };

  for (const chunk of chunked(list, IN_CHUNK)) {
    const read = (scoped: boolean) =>
      fetchAllPages<any>((from, to) => {
        let q = (supabase as any)
          .from("price_history")
          .select("symbol, price_date, price")
          .in("symbol", chunk);
        if (scoped) q = q.or(`household_id.eq.${householdId},household_id.is.null`);
        return q.order("price_date", { ascending: true }).range(from, to);
      });

    let rows: any[] = [];
    try {
      rows = (await read(true)).rows;
    } catch (err) {
      console.warn("[investments] household-scoped price_history read failed, retrying unscoped:", err);
      warnings.push("Price history is not household-scoped yet — apply the investments migration.");
      rows = (await read(false)).rows;
    }

    for (const row of rows) {
      const symbol = String((row as any)?.symbol ?? "");
      if (!symbol) continue;
      const point: PriceHistoryPoint = {
        price_date: toDayKey((row as any)?.price_date),
        price: toNum((row as any)?.price),
      };
      if (!point.price_date) continue;
      (map[symbol] ??= []).push(point);
    }
  }

  return { map, warnings };
}

// ---------------------------------------------------------------------------
// Allocation by account GROUP (Bank & Cash / Retirement / Market ... )
// ---------------------------------------------------------------------------

/**
 * computePortfolio buckets by the ASSET CLASS's group; this buckets by the parent
 * ACCOUNT's group (ACCOUNT_TYPE_BY_CATEGORY[category].group + GROUP_LABELS), which
 * is what the Investments page shows next to the accounts list. Falls back to the
 * asset-class group when the account is unknown.
 */
function allocationByAccountGroup(
  metrics: HoldingMetrics[],
  accountById: Map<string, PortfolioAccountRef>,
  totalValue: number,
): AllocationSlice[] {
  const buckets = new Map<AssetGroup, AllocationSlice>();
  for (const m of Array.isArray(metrics) ? metrics : []) {
    if (m.currentValue === 0 && m.invested === 0) continue;
    const acct = accountById.get(m.accountId);
    const group: AssetGroup = groupForCategory(acct?.category) ?? assetClassDef(m.assetClass).group;
    const slice =
      buckets.get(group) ??
      ({
        key: group,
        label: GROUP_LABELS[group] ?? GROUP_LABEL_FALLBACK,
        value: 0,
        pct: 0,
        invested: 0,
        unrealized: 0,
        count: 0,
        group,
      } satisfies AllocationSlice);
    slice.value += m.currentValue;
    slice.invested += m.invested;
    slice.unrealized += m.unrealized;
    slice.count += 1;
    buckets.set(group, slice);
  }
  const out = Array.from(buckets.values());
  for (const s of out) s.pct = totalValue > 0 ? (s.value / totalValue) * 100 : 0;
  out.sort((a, b) => b.value - a.value);
  return out;
}

// ---------------------------------------------------------------------------
// 1. getPortfolio
// ---------------------------------------------------------------------------

export type PortfolioResponse = Omit<PortfolioPayload, "accounts"> & {
  accounts: PortfolioAccountRef[];
  /** Same array as monthlyContributions — both names are kept for the page. */
  contributions: MonthlyContribution[];
  topGainers: HoldingMetrics[];
  topLosers: HoldingMetrics[];
  /** Start of the requested window, "YYYY-MM-DD". */
  from: string;
  stalePriceCount: number;
  warnings: string[];
};

const portfolioInput = z.object({
  range: z.enum(["1y", "3y", "5y", "all"]).default("all"),
  asOf: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/, "asOf must be an ISO date")
    .optional(),
});

export const getPortfolio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => portfolioInput.parse(d ?? {}))
  .handler(async ({ context, data }): Promise<PortfolioResponse> => {
    const householdId = await getHouseholdId(context);
    const sb = context.supabase as any;
    const asOf = toDayKey(data.asOf) || todayISO();
    const range = data.range;
    const warnings: string[] = [];

    // --- a. investment accounts -------------------------------------------
    const { data: accountRows, error: accErr } = await sb
      .from("accounts")
      .select("id, name, institution, category, currency, current_balance, is_active")
      .eq("household_id", householdId)
      .eq("is_active", true)
      .in("category", INVESTMENT_ACCOUNT_CATEGORIES as unknown as string[])
      .order("name", { ascending: true });
    if (accErr) throw accErr;

    const accounts = (Array.isArray(accountRows) ? accountRows : []).map(normalizeAccount);
    const accountIds = uniq(accounts.map((a) => a.id));
    const accountById = new Map<string, PortfolioAccountRef>(accounts.map((a) => [a.id, a]));

    // --- b. holdings for those accounts -----------------------------------
    const holdingRows: any[] = [];
    for (const chunk of chunked(accountIds, IN_CHUNK)) {
      const { rows, truncated } = await fetchAllPages<any>((from, to) =>
        sb
          .from("holdings")
          .select("*")
          .in("account_id", chunk)
          .order("symbol", { ascending: true })
          .range(from, to),
      );
      holdingRows.push(...rows);
      if (truncated) warnings.push("Too many holdings to load in one pass — showing the first batch.");
    }
    const holdings: HoldingRow[] = holdingRows.map(normalizeHolding).filter((h) => !!h.id);
    const holdingIds = uniq(holdings.map((h) => h.id));
    const symbols = uniq(holdings.map((h) => h.symbol));

    // --- c + d. ledger and prices in parallel -----------------------------
    const [txnRows, priceRes] = await Promise.all([
      (async () => {
        const out: any[] = [];
        for (const chunk of chunked(holdingIds, IN_CHUNK)) {
          const { rows, truncated } = await fetchAllPages<any>((from, to) =>
            sb
              .from("holding_transactions")
              .select("*")
              .in("holding_id", chunk)
              .order("txn_date", { ascending: true })
              .order("created_at", { ascending: true })
              .range(from, to),
          );
          out.push(...rows);
          if (truncated) {
            warnings.push("Your transaction ledger is very large — some older rows were skipped.");
          }
        }
        return out;
      })(),
      fetchPriceHistory(sb, householdId, symbols),
    ]);

    warnings.push(...priceRes.warnings);
    const priceHistory = priceRes.map;

    const txnsByHolding: TxnsByHolding = {};
    for (const row of txnRows) {
      const txn = normalizeTxn(row);
      if (!txn.holding_id) continue;
      (txnsByHolding[txn.holding_id] ??= []).push(txn);
    }

    // --- window ------------------------------------------------------------
    let earliest = "";
    for (const list of Object.values(txnsByHolding)) {
      for (const t of list) {
        if (t.txn_date && (earliest === "" || t.txn_date < earliest)) earliest = t.txn_date;
      }
    }
    const months = RANGE_MONTHS[range];
    let from = months ? addMonthsISO(asOf, -months) : earliest || addMonthsISO(asOf, -12);
    if (!from || from > asOf) from = addMonthsISO(asOf, -12) || asOf;

    // --- compute -----------------------------------------------------------
    const computation = computePortfolio({ holdings, txnsByHolding, asOf, accounts });
    const valueSeries = buildValueSeries({
      holdings,
      txnsByHolding,
      priceHistory,
      from,
      to: asOf,
      buckets: SERIES_BUCKETS,
    });
    const contributions = monthlyContributions(txnsByHolding, from, asOf);
    const driftRows = computeDrift(computation.metrics, computation.totals.currentValue);

    const ranked = computation.metrics
      .filter((m) => m.currentValue > 0)
      .slice()
      .sort((a, b) => b.unrealizedPct - a.unrealizedPct);
    const topGainers = ranked.slice(0, 5);
    // With fewer than ten valued positions the two lists necessarily overlap; the
    // page renders them side by side and that is the honest picture.
    const topLosers = ranked.slice().reverse().slice(0, 5);

    const stalePriceCount = computation.metrics.filter(
      (m) => m.priceStale && m.isActive && m.quantity > 0,
    ).length;

    for (const m of computation.metrics) {
      for (const w of Array.isArray(m.warnings) ? m.warnings : []) {
        if (warnings.length >= 20) break;
        warnings.push(`${m.symbol || "Holding"}: ${w}`);
      }
    }

    return {
      asOf: computation.asOf,
      range,
      from,
      totals: computation.totals,
      xirr: computation.xirr,
      metrics: computation.metrics,
      allocationByAssetClass: computation.allocationByAssetClass,
      allocationByAccount: computation.allocationByAccount,
      allocationByGroup: allocationByAccountGroup(
        computation.metrics,
        accountById,
        computation.totals.currentValue,
      ),
      bestPerformer: computation.bestPerformer,
      worstPerformer: computation.worstPerformer,
      valueSeries,
      contributions,
      monthlyContributions: contributions,
      drift: driftRows,
      topGainers,
      topLosers,
      accounts,
      stalePriceCount,
      warnings: uniq(warnings),
    };
  });

// ---------------------------------------------------------------------------
// 2. getHoldingDetail
// ---------------------------------------------------------------------------

/** investments-calc has addMonthsISO but no day helper; +1 day, UTC-safe. */
function addDaysISO(iso: string, days: number): string {
  const ms = Date.parse(`${toDayKey(iso)}T00:00:00Z`);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms + days * 86_400_000).toISOString().slice(0, 10);
}

export const getHoldingDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ holdingId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const householdId = await getHouseholdId(context);
    const sb = context.supabase as any;
    const asOf = todayISO();

    // Ownership is proven set-wise against the household's own account ids before
    // anything is returned — RLS alone is not the guard here.
    const ownedAccountIds = await householdAccountIds(sb, householdId);
    const { data: holdingRow, error: hErr } = await sb
      .from("holdings")
      .select("*, account:accounts!holdings_account_id_fkey(id, name, category, currency, current_balance, household_id)")
      .eq("id", data.holdingId)
      .maybeSingle();
    if (hErr) throw hErr;
    if (!holdingRow || !ownedAccountIds.has(String((holdingRow as any).account_id ?? ""))) {
      throw new Error(NOT_FOUND);
    }

    const holding = normalizeHolding(holdingRow);
    const account = normalizeAccount((holdingRow as any).account ?? { id: holding.account_id });
    const def = assetClassDef(holding.asset_class);

    const [{ rows: txnRows }, priceRes] = await Promise.all([
      fetchAllPages<any>((fromRow, toRow) =>
        sb
          .from("holding_transactions")
          .select("*")
          .eq("holding_id", holding.id)
          .order("txn_date", { ascending: true })
          .order("created_at", { ascending: true })
          .range(fromRow, toRow),
      ),
      fetchPriceHistory(sb, householdId, [holding.symbol]),
    ]);

    const txns = txnRows.map(normalizeTxn);
    const fifo = fifoCostBasis(txns, { ltcgMonths: def.ltcgMonths });
    const metrics = computeHoldingMetrics({ holding, txns, asOf });
    const unrealizedSplit = unrealizedTermSplit(
      fifo.openLots,
      metrics.currentPrice,
      asOf,
      def.ltcgMonths,
    );

    const priceSeries = (priceRes.map[holding.symbol] ?? [])
      .slice()
      .sort((a, b) => (a.price_date < b.price_date ? -1 : a.price_date > b.price_date ? 1 : 0));
    const lastPriceDate = priceSeries.length ? priceSeries[priceSeries.length - 1].price_date : null;
    // Next date worth recording: the day after the last known price, never in the
    // future. With no history at all, today.
    const nextDay = lastPriceDate ? addDaysISO(lastPriceDate, 1) : "";
    const suggestedPriceDate = nextDay && nextDay < asOf ? nextDay : asOf;

    return {
      asOf,
      holding,
      account,
      assetClass: {
        value: def.value,
        label: def.label,
        unitsLabel: holding.units_label || def.unitsLabel,
        ltcgMonths: def.ltcgMonths,
        group: def.group,
      },
      metrics,
      fifo: {
        openLots: fifo.openLots,
        openQty: fifo.openQty,
        openCost: fifo.openCost,
        avgCost: fifo.avgCost,
        sales: fifo.sales,
        soldQty: fifo.soldQty,
        realizedGain: fifo.realizedGain,
        realizedCost: fifo.realizedCost,
        realizedProceeds: fifo.realizedProceeds,
        totalFees: fifo.totalFees,
        incomeReceived: fifo.incomeReceived,
      },
      termSplit: {
        realizedShortTerm: fifo.shortTermGain,
        realizedLongTerm: fifo.longTermGain,
        unrealizedShortTerm: unrealizedSplit.shortTermGain,
        unrealizedLongTerm: unrealizedSplit.longTermGain,
        shortTermQty: unrealizedSplit.shortTermQty,
        longTermQty: unrealizedSplit.longTermQty,
      },
      // Newest first for the ledger table.
      txns: txns.slice().reverse(),
      priceSeries,
      lastPriceDate,
      suggestedPriceDate,
      warnings: uniq([...fifo.warnings, ...priceRes.warnings]),
    };
  });

// ---------------------------------------------------------------------------
// 3. upsertHolding
// ---------------------------------------------------------------------------

const holdingInput = z.object({
  id: z.string().uuid().optional(),
  account_id: z.string().uuid(),
  symbol: z.string().trim().min(1, "Symbol or scheme name is required").max(120),
  name: z.string().trim().max(200).nullable().optional(),
  asset_class: z.enum(ASSET_CLASS_VALUES),
  isin: z.string().trim().max(20).nullable().optional(),
  folio_number: z.string().trim().max(60).nullable().optional(),
  currency: z.string().trim().min(1).max(8).default("INR"),
  units_label: z.string().trim().max(24).nullable().optional(),
  sector: z.string().trim().max(80).nullable().optional(),
  target_allocation_pct: z.number().min(0).max(100).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  is_active: z.boolean().optional(),
  quantity: z.number().min(0).max(AMOUNT_CAP).optional(),
  avg_price: z.number().min(0).max(AMOUNT_CAP).optional(),
  current_price: z.number().min(0).max(AMOUNT_CAP).optional(),
});

/** Translate the (account_id, symbol) unique index into something a human reads. */
function translateWriteError(error: any, symbol: string): Error {
  if (error?.code === "23505") {
    return new Error(`"${symbol}" already exists in this account — edit that holding instead.`);
  }
  return error instanceof Error ? error : new Error(error?.message ?? "Could not save the holding");
}

export const upsertHolding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => holdingInput.parse(d))
  .handler(async ({ context, data }) => {
    const householdId = await getHouseholdId(context);
    const sb = context.supabase as any;

    // The target account must be ours. Never trust account_id on its own.
    await requireOwnedAccount(sb, householdId, data.account_id);

    let previousAccountId: string | null = null;
    let allowManualSeed = true;
    if (data.id) {
      const existing = await requireOwnedHolding(sb, householdId, data.id);
      previousAccountId = String(existing.account_id ?? "");
      // quantity / avg_price are a MANUAL SEED for positions with no ledger (a PPF
      // balance, an inherited folio). Once transactions exist, FIFO owns those two
      // columns and any client-supplied value is ignored so it cannot silently
      // contradict the ledger.
      const { count, error: cErr } = await sb
        .from("holding_transactions")
        .select("id", { count: "exact", head: true })
        .eq("holding_id", data.id);
      if (cErr) throw cErr;
      allowManualSeed = toNum(count) === 0;
    }

    const symbol = UPPERCASE_SYMBOL_CLASSES.has(data.asset_class)
      ? data.symbol.trim().toUpperCase()
      : data.symbol.trim();

    const row: Record<string, any> = {
      account_id: data.account_id,
      household_id: householdId, // trigger re-derives it from the account anyway
      symbol,
      name: nullableStr(data.name) ?? symbol,
      asset_class: data.asset_class,
      isin: nullableStr(data.isin),
      folio_number: nullableStr(data.folio_number),
      currency: data.currency.trim().toUpperCase(),
      units_label: nullableStr(data.units_label),
      sector: nullableStr(data.sector),
      target_allocation_pct:
        data.target_allocation_pct === null || data.target_allocation_pct === undefined
          ? null
          : roundTo(data.target_allocation_pct, 2),
      notes: nullableStr(data.notes),
      is_active: data.is_active ?? true,
      updated_at: nowISO(),
    };
    if (data.current_price !== undefined) {
      row.current_price = roundTo(data.current_price, 4);
      row.price_updated_at = nowISO();
    }
    if (allowManualSeed) {
      if (data.quantity !== undefined) row.quantity = roundTo(data.quantity, 4);
      if (data.avg_price !== undefined) row.avg_price = roundTo(data.avg_price, 4);
    }

    let saved: any;
    if (data.id && previousAccountId) {
      const { data: updated, error } = await sb
        .from("holdings")
        .update(row)
        .eq("id", data.id)
        .eq("account_id", previousAccountId) // re-scope to the row we verified
        .select("*")
        .single();
      if (error) throw translateWriteError(error, symbol);
      saved = updated;
    } else {
      const { data: inserted, error } = await sb.from("holdings").insert(row).select("*").single();
      if (error) throw translateWriteError(error, symbol);
      saved = inserted;
    }

    // Best effort: market value moved, so the account balance must follow.
    const touched = uniq([data.account_id, previousAccountId]);
    for (const accountId of touched) {
      await recomputeInvestmentAccountBalance(sb, householdId, accountId);
    }

    return normalizeHolding(saved);
  });

// ---------------------------------------------------------------------------
// 4. deleteHolding
// ---------------------------------------------------------------------------

export const deleteHolding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const householdId = await getHouseholdId(context);
    const sb = context.supabase as any;

    const holding = await requireOwnedHolding(sb, householdId, data.id);
    const accountId = String(holding.account_id ?? "");

    // holding_transactions cascade via holding_transactions_holding_id_fkey.
    const { error } = await sb.from("holdings").delete().eq("id", data.id).eq("account_id", accountId);
    if (error) throw error;

    await recomputeInvestmentAccountBalance(sb, householdId, accountId);
    return { ok: true, id: data.id, accountId };
  });

// ---------------------------------------------------------------------------
// 5. upsertHoldingTransaction
// ---------------------------------------------------------------------------

const txnInput = z.object({
  id: z.string().uuid().optional(),
  holding_id: z.string().uuid(),
  txn_date: z.string().regex(/^\d{4}-\d{2}-\d{2}/, "Date must be YYYY-MM-DD"),
  kind: z.enum(TXN_KINDS),
  quantity: z.number().min(-AMOUNT_CAP).max(AMOUNT_CAP),
  price: z.number().min(-AMOUNT_CAP).max(AMOUNT_CAP),
  fees: z.number().min(-AMOUNT_CAP).max(AMOUNT_CAP).optional(),
  amount: z.number().min(-AMOUNT_CAP).max(AMOUNT_CAP).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

type TxnWriteRow = {
  txn_date: string;
  kind: TxnKind;
  quantity: number;
  price: number;
  fees: number;
  amount: number | null;
  notes: string | null;
};

/**
 * Per-kind validation, in one place so the messages are user-facing:
 *   buy / sip / sell / withdrawal / contribution — quantity > 0, price >= 0
 *   bonus                                        — quantity > 0, price forced to 0
 *   split                                        — ratio (quantity) > 0, no cash
 *   dividend / interest                          — amount > 0, quantity and price 0
 * Every number is checked for NaN / Infinity and capped at 1e12.
 */
function buildTxnRow(input: z.infer<typeof txnInput>): TxnWriteRow {
  const txn_date = toDayKey(input.txn_date);
  if (!txn_date) throw new Error("Enter a valid transaction date (YYYY-MM-DD).");
  const year = Number(txn_date.slice(0, 4));
  if (!(year >= 1900 && year <= 2200)) throw new Error("That transaction date is out of range.");

  const kind = input.kind;
  const label = TXN_KIND_LABELS[kind] ?? kind;
  const notes = nullableStr(input.notes);
  const fees = Math.abs(finiteOrThrow(input.fees ?? 0, "Fees"));
  const quantity = finiteOrThrow(input.quantity, "Quantity");
  const price = finiteOrThrow(input.price, "Price");
  const amount =
    input.amount === null || input.amount === undefined ? null : finiteOrThrow(input.amount, "Amount");

  if (isCashOnlyKind(kind)) {
    const cash = amount ?? 0;
    if (!(cash > 0)) throw new Error(`${label} needs a cash amount greater than zero.`);
    return { txn_date, kind, quantity: 0, price: 0, fees, amount: roundTo(cash, 2), notes };
  }

  if (kind === "bonus") {
    if (!(quantity > 0)) throw new Error("Bonus units need a quantity greater than zero.");
    // Free units: zero price, and no cash leg to record.
    return { txn_date, kind, quantity: roundTo(quantity, 4), price: 0, fees, amount: null, notes };
  }

  if (kind === "split") {
    if (!(quantity > 0)) throw new Error("Enter the split ratio in Quantity (a 1:2 split is 2).");
    return { txn_date, kind, quantity: roundTo(quantity, 4), price: 0, fees, amount: null, notes };
  }

  if (!(quantity > 0)) throw new Error(`${label} needs a quantity greater than zero.`);
  if (!(price >= 0)) throw new Error(`${label} needs a price of zero or more.`);

  // Informational cash leg — what actually hit the bank. The calc layer only reads
  // `amount` for dividend / interest, so this can never distort cost basis.
  const gross = quantity * price;
  const cash = removesUnits(kind) ? gross - fees : gross + fees;
  return {
    txn_date,
    kind,
    quantity: roundTo(quantity, 4),
    price: roundTo(price, 4),
    fees: roundTo(fees, 2),
    amount: amount === null ? roundTo(cash, 2) : roundTo(amount, 2),
    notes,
  };
}

export const upsertHoldingTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => txnInput.parse(d))
  .handler(async ({ context, data }) => {
    const householdId = await getHouseholdId(context);
    const sb = context.supabase as any;

    const holding = await requireOwnedHolding(sb, householdId, data.holding_id);
    const accountId = String(holding.account_id ?? "");
    const row = { ...buildTxnRow(data), holding_id: data.holding_id, created_by: context.userId };

    let saved: any;
    if (data.id) {
      // Confirm the row being edited really hangs off this (verified) holding.
      const { data: existing, error: eErr } = await sb
        .from("holding_transactions")
        .select("id, holding_id")
        .eq("id", data.id)
        .eq("holding_id", data.holding_id)
        .maybeSingle();
      if (eErr) throw eErr;
      if (!existing) throw new Error("Transaction not found");

      const { data: updated, error } = await sb
        .from("holding_transactions")
        .update(row)
        .eq("id", data.id)
        .eq("holding_id", data.holding_id)
        .select("*")
        .single();
      if (error) throw error;
      saved = updated;
    } else {
      const { data: inserted, error } = await sb
        .from("holding_transactions")
        .insert(row)
        .select("*")
        .single();
      if (error) throw error;
      saved = inserted;
    }

    await recomputeHolding(sb, data.holding_id, accountId, holding.asset_class);
    await recomputeInvestmentAccountBalance(sb, householdId, accountId);

    return normalizeTxn(saved);
  });

// ---------------------------------------------------------------------------
// 6. deleteHoldingTransaction
// ---------------------------------------------------------------------------

export const deleteHoldingTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const householdId = await getHouseholdId(context);
    const sb = context.supabase as any;

    // Join lookup: transaction -> holding -> account, then an explicit household check.
    const { data: txn, error: tErr } = await sb
      .from("holding_transactions")
      .select("id, holding_id, holding:holdings!holding_transactions_holding_id_fkey(id, account_id, asset_class)")
      .eq("id", data.id)
      .maybeSingle();
    if (tErr) throw tErr;
    const holdingId = String((txn as any)?.holding?.id ?? (txn as any)?.holding_id ?? "");
    const accountId = String((txn as any)?.holding?.account_id ?? "");
    if (!txn || !holdingId || !accountId) throw new Error("Transaction not found");
    await requireOwnedAccount(sb, householdId, accountId);

    const { error } = await sb
      .from("holding_transactions")
      .delete()
      .eq("id", data.id)
      .eq("holding_id", holdingId);
    if (error) throw error;

    await recomputeHolding(sb, holdingId, accountId, (txn as any)?.holding?.asset_class);
    await recomputeInvestmentAccountBalance(sb, householdId, accountId);

    return { ok: true, id: data.id, holdingId, accountId };
  });

// ---------------------------------------------------------------------------
// 7. updateHoldingPrices — the manual NAV flow
// ---------------------------------------------------------------------------

const pricesInput = z.object({
  asOf: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/, "asOf must be an ISO date")
    .optional(),
  prices: z
    .array(
      z.object({
        holding_id: z.string().uuid(),
        price: z.number().min(0).max(AMOUNT_CAP),
      }),
    )
    .min(1, "Enter at least one price")
    .max(500, "Update at most 500 prices at a time"),
});

export const updateHoldingPrices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => pricesInput.parse(d))
  .handler(async ({ context, data }) => {
    const householdId = await getHouseholdId(context);
    const sb = context.supabase as any;
    const asOf = toDayKey(data.asOf) || todayISO();

    // Last value wins when the client sends the same holding twice.
    const wanted = new Map<string, number>();
    for (const p of data.prices) {
      wanted.set(p.holding_id, finiteOrThrow(p.price, "Price"));
    }
    const ids = Array.from(wanted.keys());

    // One verified read for every holding_id: the embedded account carries the
    // household, so ownership is decided from accounts.household_id.
    const owned = await fetchOwnedHoldings(sb, householdId, ids);
    if (owned.size !== ids.length) {
      throw new Error("Some of those holdings are not in your household.");
    }

    const stamp = nowISO();
    const historyBySymbol = new Map<string, any>();
    const holdingRows: any[] = [];
    const accountIds = new Set<string>();

    for (const id of ids) {
      const holding = owned.get(id);
      if (!holding) continue;
      const price = roundTo(wanted.get(id) ?? 0, 4);
      const symbol = String(holding.symbol ?? "");
      const accountId = String(holding.account_id ?? "");
      if (accountId) accountIds.add(accountId);

      // One price_history row per symbol per day. Deduping is mandatory, not
      // cosmetic: an upsert whose payload hits the same conflict target twice
      // fails with "ON CONFLICT DO UPDATE cannot affect row a second time".
      if (symbol) {
        historyBySymbol.set(symbol, {
          household_id: householdId,
          symbol,
          price_date: asOf,
          price,
          source: "manual",
        });
      }
      holdingRows.push({
        id,
        account_id: accountId,
        symbol,
        current_price: price,
        price_updated_at: stamp,
      });
    }

    if (historyBySymbol.size > 0) {
      const { error } = await sb
        .from("price_history")
        .upsert(Array.from(historyBySymbol.values()), { onConflict: "household_id,symbol,price_date" });
      if (error) throw error;
    }

    // Batched write: ON CONFLICT (id) only touches the columns in the payload.
    const { error: upErr } = await sb.from("holdings").upsert(holdingRows, { onConflict: "id" });
    if (upErr) {
      console.warn("[investments] batched holdings price upsert failed, falling back to updates:", upErr);
      await mapCapped(holdingRows, 4, async (r) => {
        const { error } = await sb
          .from("holdings")
          .update({ current_price: r.current_price, price_updated_at: r.price_updated_at })
          .eq("id", r.id)
          .eq("account_id", r.account_id);
        if (error) throw error;
      });
    }

    const accounts = Array.from(accountIds);
    await mapCapped(accounts, 4, (accountId) =>
      recomputeInvestmentAccountBalance(sb, householdId, accountId),
    );

    return { updated: holdingRows.length, asOf, accountsTouched: accounts.length };
  });

// ---------------------------------------------------------------------------
// 8. snapshotInvestmentValue
// ---------------------------------------------------------------------------

export const snapshotInvestmentValue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({}).default({}).parse(d ?? {}))
  .handler(async ({ context }) => {
    const householdId = await getHouseholdId(context);
    const sb = context.supabase as any;
    const snapshotDate = todayISO();

    // Market value of every ACTIVE holding in the household's investment accounts,
    // matching what recompute_investment_account_balance writes to accounts.
    const { data: accountRows, error: accErr } = await sb
      .from("accounts")
      .select("id, category, currency, current_balance, is_liability, excluded_from_net_worth, is_active")
      .eq("household_id", householdId);
    if (accErr) throw accErr;
    const allAccounts = Array.isArray(accountRows) ? accountRows : [];
    const investmentIds = uniq(
      allAccounts
        .filter(
          (a: any) =>
            a?.is_active !== false && INVESTMENT_ACCOUNT_CATEGORIES.includes(String(a?.category ?? "")),
        )
        .map((a: any) => String(a?.id ?? "")),
    );

    let investments = 0;
    for (const chunk of chunked(investmentIds, IN_CHUNK)) {
      const { rows } = await fetchAllPages<any>((from, to) =>
        sb.from("holdings").select("quantity, current_price, is_active").in("account_id", chunk).range(from, to),
      );
      for (const h of rows) {
        if ((h as any)?.is_active === false) continue;
        investments += toNum((h as any)?.quantity) * toNum((h as any)?.current_price);
      }
    }
    investments = roundTo(investments, 2);

    const { data: existing, error: readErr } = await sb
      .from("net_worth_snapshots")
      .select("id, breakdown")
      .eq("household_id", householdId)
      .eq("snapshot_date", snapshotDate)
      .maybeSingle();
    if (readErr) throw readErr;

    if (existing?.id) {
      // Read-modify-write so we never clobber another surface's breakdown keys.
      let breakdown: Record<string, any> = {};
      try {
        const raw = (existing as any).breakdown;
        if (raw && typeof raw === "object" && !Array.isArray(raw)) breakdown = { ...raw };
      } catch (err) {
        console.warn("[investments] snapshot breakdown was unreadable, rebuilding it:", err);
      }
      breakdown.investments = investments;
      const { error } = await sb
        .from("net_worth_snapshots")
        .update({ breakdown })
        .eq("id", (existing as any).id)
        .eq("household_id", householdId);
      if (error) throw error;
      return { ok: true, created: false, snapshotDate, investments };
    }

    // No row for today yet: total_assets / total_liabilities / net_worth are NOT
    // NULL, so seed them from the account balances the same way the dashboard does.
    let assets = 0;
    let liabilities = 0;
    for (const a of allAccounts as any[]) {
      if (a?.is_active === false || a?.excluded_from_net_worth) continue;
      if (String(a?.currency ?? "INR") !== "INR") continue;
      const bal = toNum(a?.current_balance);
      if (a?.is_liability) liabilities += Math.abs(bal);
      else assets += bal;
    }
    const { error: insErr } = await sb.from("net_worth_snapshots").insert({
      household_id: householdId,
      snapshot_date: snapshotDate,
      total_assets: roundTo(assets, 2),
      total_liabilities: roundTo(liabilities, 2),
      net_worth: roundTo(assets - liabilities, 2),
      breakdown: { investments },
    });
    if (insErr) throw insErr;

    return { ok: true, created: true, snapshotDate, investments };
  });
