// ---------------------------------------------------------------------------
// Investments — pure calculation layer
//
// PURE TypeScript. No supabase, no server-only modules, no React, no zod.
// Imported by both src/lib/investments.functions.ts (SSR / Node) and the
// Investments page (browser), so it must be environment-agnostic.
//
// House rules honoured by every function in this file:
//   * coerce every incoming number with Number() (Postgres numerics arrive as
//     strings), treat NaN/Infinity as 0
//   * never divide by zero
//   * never throw — bad input yields sane zeros / nulls / warnings
//   * empty input yields empty output, not an exception
// ---------------------------------------------------------------------------

import {
  ASSET_CLASS_BY_VALUE,
  GROUP_LABEL_FALLBACK,
  PRICE_STALE_DAYS,
  addsUnits,
  assetClassDef,
  isCashOnlyKind,
  removesUnits,
  type AllocationSlice,
  type AssetGroup,
  type CapitalGainTerm,
  type DriftRow,
  type HoldingMetrics,
  type HoldingRow,
  type HoldingTxn,
  type InvestmentAccountRef,
  type MonthlyContribution,
  type PortfolioComputation,
  type PortfolioTotals,
  type PriceHistoryMap,
  type PriceHistoryPoint,
  type SipCadence,
  type SipInfo,
  type TxnsByHolding,
  type ValuePoint,
} from "./investments-types";
import { GROUP_LABELS } from "./account-types";

// ---------------------------------------------------------------------------
// Numeric + date primitives
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365; // ACT/365 day counting for XIRR
/** Units below this are treated as zero (numeric(18,4) in the DB). */
const QTY_EPS = 1e-9;
/** Default long-term threshold when the asset class is unknown. */
export const DEFAULT_LTCG_MONTHS = 24;

/** Coerce anything to a finite number. NaN / Infinity / null / "" become 0. */
export function toNum(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Final guard applied to every value we hand back out. */
function safe(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

/** Round to `dp` decimals without introducing -0. */
export function roundTo(value: unknown, dp = 2): number {
  const n = toNum(value);
  const f = Math.pow(10, Math.max(0, Math.trunc(dp)));
  const r = Math.round(n * f) / f;
  return r === 0 ? 0 : safe(r);
}

/**
 * Parse a date-ish value to UTC midnight epoch ms, or null when unparseable.
 * UTC is used deliberately: "2026-08-25" must mean the same instant on a
 * Node server in UTC and in a browser in IST.
 */
function toDayMs(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    const t = value.getTime();
    if (!Number.isFinite(t)) return null;
    return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    const d = new Date(value);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  if (typeof value !== "string") return null;
  const s = value.trim();
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const ms = Date.UTC(y, mo - 1, d);
    const chk = new Date(ms);
    // rejects impossible dates such as 2026-02-31
    if (chk.getUTCMonth() !== mo - 1 || chk.getUTCDate() !== d) return null;
    return ms;
  }
  const parsed = Date.parse(s);
  if (!Number.isFinite(parsed)) return null;
  const d2 = new Date(parsed);
  return Date.UTC(d2.getUTCFullYear(), d2.getUTCMonth(), d2.getUTCDate());
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function monthKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

/** Normalise any date-ish value to "YYYY-MM-DD", or "" when unparseable. */
export function toDayKey(value: unknown): string {
  const ms = toDayMs(value);
  return ms === null ? "" : dayKey(ms);
}

/** Whole days from `a` to `b`. 0 when either side is unparseable. */
export function daysBetween(a: unknown, b: unknown): number {
  const ams = toDayMs(a);
  const bms = toDayMs(b);
  if (ams === null || bms === null) return 0;
  return Math.round((bms - ams) / MS_PER_DAY);
}

/** Add calendar months, clamping the day-of-month (31 Jan + 1m = 28/29 Feb). */
function addMonthsMs(ms: number, months: number): number {
  const d = new Date(ms);
  const monthIndex = d.getUTCMonth() + Math.trunc(months);
  const y = d.getUTCFullYear() + Math.floor(monthIndex / 12);
  const m = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay));
}

/** Add calendar months to an ISO day string. Returns "" for bad input. */
export function addMonthsISO(iso: unknown, months: number): string {
  const ms = toDayMs(iso);
  if (ms === null) return "";
  return dayKey(addMonthsMs(ms, months));
}

/**
 * Short- vs long-term capital gain classification.
 *
 * SPEC NOTE — the feature brief offered two rules: "holdingDays >=
 * ltcgMonths * 30.44" and "add ltcgMonths calendar months to the lot date and
 * compare dates". They disagree (a 12-month hold from 01-Feb is 365 days but
 * 12 * 30.44 = 365.3 days, so the approximation would wrongly say short-term).
 * We resolve the conflict in favour of REAL CALENDAR MONTHS, which is what
 * s.2(42A) of the Income Tax Act actually says, and we require the holding to
 * be STRICTLY LONGER than the threshold ("held for more than 12 months").
 * A sale exactly on the anniversary is therefore short-term.
 *
 * ltcgMonths === 0 (PPF / EPF / NPS / FD / post-office) means the instrument
 * has no STCG/LTCG distinction at all; any hold of at least one day lands in
 * the long bucket so the numbers still add up, and the UI hides the split for
 * those asset classes.
 */
export function termForHoldingPeriod(
  lotDate: unknown,
  saleDate: unknown,
  ltcgMonths: number = DEFAULT_LTCG_MONTHS,
): CapitalGainTerm {
  const lot = toDayMs(lotDate);
  const sale = toDayMs(saleDate);
  if (lot === null || sale === null) return "short";
  const months = Math.max(0, Math.trunc(toNum(ltcgMonths)));
  return sale > addMonthsMs(lot, months) ? "long" : "short";
}

// ---------------------------------------------------------------------------
// XIRR / NPV
// ---------------------------------------------------------------------------

export type CashFlow = { date: string; amount: number };

type NormFlow = { ms: number; amount: number };

/** Drop unusable rows, coerce, and sort ascending by date. */
function normalizeFlows(flows: CashFlow[] | null | undefined): NormFlow[] {
  const list = Array.isArray(flows) ? flows : [];
  const out: NormFlow[] = [];
  for (const f of list) {
    const ms = toDayMs(f?.date);
    if (ms === null) continue;
    const amount = toNum(f?.amount);
    if (amount === 0) continue; // zero flows cannot move the NPV
    out.push({ ms, amount });
  }
  out.sort((a, b) => a.ms - b.ms);
  return out;
}

/** Search domain for the discount base (1 + rate): rate ∈ (-0.9999, 100]. */
const RATE_MIN = -0.9999;
const RATE_MAX = 100;
const BASE_MIN = 1 + RATE_MIN;
const BASE_MAX = 1 + RATE_MAX;
/** Per-term clamp so a pathological flow cannot overflow the sum to Infinity. */
const TERM_CAP = 1e150;

function npvOfNormalized(norm: NormFlow[], rate: number): number {
  if (norm.length === 0) return 0;
  const t0 = norm[0].ms;
  let base = 1 + toNum(rate);
  if (!(base > BASE_MIN)) base = BASE_MIN;
  let sum = 0;
  for (const f of norm) {
    const years = (f.ms - t0) / MS_PER_DAY / DAYS_PER_YEAR;
    let term = f.amount / Math.pow(base, years);
    if (!Number.isFinite(term)) term = f.amount >= 0 ? TERM_CAP : -TERM_CAP;
    else if (term > TERM_CAP) term = TERM_CAP;
    else if (term < -TERM_CAP) term = -TERM_CAP;
    sum += term;
  }
  return safe(sum);
}

/**
 * Net present value of `flows` discounted at `rate` (a decimal, 0.12 = 12%),
 * using ACT/365 from the earliest flow. Always finite.
 */
export function npvAtRate(rate: number, flows: CashFlow[]): number {
  return npvOfNormalized(normalizeFlows(flows), rate);
}

/**
 * Annualised money-weighted return (XIRR) as a decimal, or null when it is not
 * defined. Bracket-then-bisect: a bare Newton-Raphson diverges on real SIP
 * ladders, so we first find a sign change on a log-spaced ladder of discount
 * bases and then bisect it. A few safeguarded Newton steps polish the answer
 * without ever leaving the bracket.
 */
export function xirr(flows: CashFlow[]): number | null {
  const norm = normalizeFlows(flows);
  if (norm.length < 2) return null;

  let hasNeg = false;
  let hasPos = false;
  for (const f of norm) {
    if (f.amount < 0) hasNeg = true;
    else if (f.amount > 0) hasPos = true;
  }
  if (!hasNeg || !hasPos) return null;

  // Every flow on the same day => NPV is constant in rate => no root exists.
  if (norm[norm.length - 1].ms === norm[0].ms) return null;

  const f = (r: number) => npvOfNormalized(norm, r);

  // --- 1. bracket the root on a log-spaced ladder of (1 + rate) -------------
  const STEPS = 240;
  const ratio = Math.pow(BASE_MAX / BASE_MIN, 1 / STEPS);
  let lo = RATE_MIN;
  let loVal = f(lo);

  let a = NaN;
  let b = NaN;
  let fa = NaN;
  let base = BASE_MIN;
  for (let i = 1; i <= STEPS; i++) {
    base = i === STEPS ? BASE_MAX : base * ratio;
    const hi = base - 1;
    const hiVal = f(hi);
    if (hiVal === 0) return hi;
    if ((loVal < 0 && hiVal > 0) || (loVal > 0 && hiVal < 0)) {
      a = lo;
      fa = loVal;
      b = hi;
      break;
    }
    lo = hi;
    loVal = hiVal;
  }
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null; // no sign change in domain

  // --- 2. bisection to a tight tolerance -----------------------------------
  let mid = (a + b) / 2;
  for (let i = 0; i < 200; i++) {
    mid = (a + b) / 2;
    const fm = f(mid);
    if (fm === 0 || Math.abs(b - a) <= 1e-11) break;
    if ((fa < 0 && fm < 0) || (fa > 0 && fm > 0)) {
      a = mid;
      fa = fm;
    } else {
      b = mid;
    }
  }

  // --- 3. safeguarded Newton polish (never leaves the bracket) -------------
  let best = mid;
  let bestVal = Math.abs(f(best));
  for (let i = 0; i < 8; i++) {
    const h = 1e-6;
    const d = (f(best + h) - f(best - h)) / (2 * h);
    if (!Number.isFinite(d) || d === 0) break;
    const next = best - f(best) / d;
    if (!Number.isFinite(next) || next <= Math.min(a, b) || next >= Math.max(a, b)) break;
    const nextVal = Math.abs(f(next));
    if (!(nextVal < bestVal)) break;
    best = next;
    bestVal = nextVal;
  }

  if (!Number.isFinite(best)) return null;
  if (best <= RATE_MIN || best > RATE_MAX) return null;
  return best;
}

/** Compound annual growth rate as a decimal. null when undefined. */
export function cagr(begin: number, end: number, years: number): number | null {
  const b = toNum(begin);
  const e = toNum(end);
  const y = toNum(years);
  if (!(b > 0) || !(y > 0)) return null;
  if (e < 0) return null;
  if (e === 0) return -1; // wiped out
  const r = Math.pow(e / b, 1 / y) - 1;
  return Number.isFinite(r) ? r : null;
}

/** Simple absolute return as a PERCENT (12.5 => +12.5%). 0 when nothing invested. */
export function absoluteReturnPct(invested: number, current: number): number {
  const i = toNum(invested);
  const c = toNum(current);
  if (!(i > 0)) return 0;
  return safe(((c - i) / i) * 100);
}

// ---------------------------------------------------------------------------
// FIFO cost basis
// ---------------------------------------------------------------------------

export type Lot = { date: string; qty: number; costPerUnit: number };

export type RealizedSale = {
  date: string;
  qty: number;
  proceeds: number;
  cost: number;
  gain: number;
  holdingDays: number;
  term: CapitalGainTerm;
};

export type FifoResult = {
  openLots: Lot[];
  openQty: number;
  openCost: number;
  avgCost: number;
  realizedGain: number;
  realizedProceeds: number;
  realizedCost: number;
  soldQty: number;
  shortTermGain: number;
  longTermGain: number;
  sales: RealizedSale[];
  totalFees: number;
  /** Dividends + interest received in cash. */
  incomeReceived: number;
  warnings: string[];
};

/**
 * Deterministic ledger order: txn_date, then created_at, then id.
 * Rows with an unparseable date sort first and are reported as warnings later.
 */
export function sortTxns(txns: HoldingTxn[] | null | undefined): HoldingTxn[] {
  const list = (Array.isArray(txns) ? txns : []).filter((t) => !!t);
  return list.slice().sort((x, y) => {
    const dx = toDayKey(x?.txn_date);
    const dy = toDayKey(y?.txn_date);
    if (dx !== dy) return dx < dy ? -1 : 1;
    const cx = String(x?.created_at ?? "");
    const cy = String(y?.created_at ?? "");
    if (cx !== cy) return cx < cy ? -1 : 1;
    const ix = String(x?.id ?? "");
    const iy = String(y?.id ?? "");
    return ix < iy ? -1 : ix > iy ? 1 : 0;
  });
}

/** Cash amount a transaction represents (income kinds prefer the explicit amount). */
function cashAmountOf(t: HoldingTxn): number {
  const qty = Math.abs(toNum(t?.quantity));
  const price = toNum(t?.price);
  const explicit = t?.amount;
  if (explicit !== null && explicit !== undefined && explicit !== ("" as unknown)) {
    return toNum(explicit);
  }
  return safe(qty * price);
}

/**
 * Walk the ledger and produce open lots, realised gains (FIFO matched) and
 * income. Fees are capitalised into cost on the way in and netted off proceeds
 * on the way out — the Indian convention for brokerage/STT/stamp duty.
 */
export function fifoCostBasis(txns: HoldingTxn[], opts?: { ltcgMonths?: number }): FifoResult {
  const list = sortTxns(txns);
  const ltcgMonths = Math.max(0, Math.trunc(toNum(opts?.ltcgMonths ?? DEFAULT_LTCG_MONTHS)));

  const openLots: Lot[] = [];
  const sales: RealizedSale[] = [];
  const warnings: string[] = [];
  let realizedGain = 0;
  let realizedProceeds = 0;
  let realizedCost = 0;
  let soldQty = 0;
  let shortTermGain = 0;
  let longTermGain = 0;
  let totalFees = 0;
  let incomeReceived = 0;

  for (const t of list) {
    const ms = toDayMs(t?.txn_date);
    if (ms === null) {
      warnings.push(`ignored a transaction with an unreadable date (${String(t?.txn_date ?? "blank")})`);
      continue;
    }
    const date = dayKey(ms);
    const kind = String(t?.kind ?? "");
    const fees = Math.abs(toNum(t?.fees));
    const price = toNum(t?.price);
    const rawQty = toNum(t?.quantity);
    totalFees += fees;

    // --- cash-only: dividend / interest ------------------------------------
    if (isCashOnlyKind(kind)) {
      incomeReceived += cashAmountOf(t);
      continue;
    }

    // --- bonus units: free units, zero cost --------------------------------
    if (kind === "bonus") {
      const qty = Math.abs(rawQty);
      if (!(qty > QTY_EPS)) {
        warnings.push(`ignored a bonus entry with no units on ${date}`);
        continue;
      }
      openLots.push({ date, qty, costPerUnit: 0 });
      continue;
    }

    // --- split: `quantity` is the ratio multiplier R (1:2 split => 2) ------
    if (kind === "split") {
      const ratio = rawQty;
      if (!(ratio > 0)) {
        warnings.push(`ignored a split on ${date} because the ratio was not positive`);
        continue;
      }
      for (const lot of openLots) {
        lot.qty = safe(lot.qty * ratio);
        lot.costPerUnit = safe(lot.costPerUnit / ratio);
      }
      continue;
    }

    // --- units in: buy / sip / contribution --------------------------------
    if (addsUnits(kind)) {
      const qty = Math.abs(rawQty);
      if (!(qty > QTY_EPS)) {
        warnings.push(`ignored a ${kind} entry with no units on ${date}`);
        continue;
      }
      const costPerUnit = price + fees / qty;
      openLots.push({ date, qty, costPerUnit: safe(costPerUnit) });
      continue;
    }

    // --- units out: sell / withdrawal --------------------------------------
    if (removesUnits(kind)) {
      const sellQty = Math.abs(rawQty);
      if (!(sellQty > QTY_EPS)) {
        warnings.push(`ignored a ${kind} entry with no units on ${date}`);
        continue;
      }
      const proceeds = sellQty * price - fees;
      let remaining = sellQty;

      while (remaining > QTY_EPS && openLots.length > 0) {
        const lot = openLots[0];
        const take = Math.min(lot.qty, remaining);
        const lotCost = take * lot.costPerUnit;
        // multiply before dividing so clean ratios stay exact in floating point
        const shareProceeds = safe((proceeds * take) / sellQty);
        const gain = shareProceeds - lotCost;
        const term = termForHoldingPeriod(lot.date, date, ltcgMonths);
        sales.push({
          date,
          qty: safe(take),
          proceeds: shareProceeds,
          cost: safe(lotCost),
          gain: safe(gain),
          holdingDays: daysBetween(lot.date, date),
          term,
        });
        realizedGain += gain;
        realizedProceeds += shareProceeds;
        realizedCost += lotCost;
        soldQty += take;
        if (term === "long") longTermGain += gain;
        else shortTermGain += gain;

        lot.qty -= take;
        remaining -= take;
        if (lot.qty <= QTY_EPS) openLots.shift();
      }

      if (remaining > QTY_EPS) {
        // Overselling must never throw: book the excess at zero cost so the
        // cash still reconciles, and tell the user their ledger is off.
        warnings.push(`sold more units than held on ${date}`);
        const shareProceeds = safe((proceeds * remaining) / sellQty);
        sales.push({
          date,
          qty: safe(remaining),
          proceeds: shareProceeds,
          cost: 0,
          gain: shareProceeds,
          holdingDays: 0,
          term: "short",
        });
        realizedGain += shareProceeds;
        realizedProceeds += shareProceeds;
        soldQty += remaining;
        shortTermGain += shareProceeds;
      }
      continue;
    }

    warnings.push(`ignored an unknown transaction kind "${kind}" on ${date}`);
  }

  let openQty = 0;
  let openCost = 0;
  for (const lot of openLots) {
    openQty += lot.qty;
    openCost += lot.qty * lot.costPerUnit;
  }
  if (!(openQty > QTY_EPS)) {
    openQty = 0;
    openCost = 0;
  }

  return {
    openLots: openLots.map((l) => ({ date: l.date, qty: safe(l.qty), costPerUnit: safe(l.costPerUnit) })),
    openQty: safe(openQty),
    openCost: safe(openCost),
    avgCost: openQty > 0 ? safe(openCost / openQty) : 0,
    realizedGain: safe(realizedGain),
    realizedProceeds: safe(realizedProceeds),
    realizedCost: safe(realizedCost),
    soldQty: safe(soldQty),
    shortTermGain: safe(shortTermGain),
    longTermGain: safe(longTermGain),
    sales,
    totalFees: safe(totalFees),
    incomeReceived: safe(incomeReceived),
    warnings,
  };
}

/**
 * Split the UNREALISED gain of the open lots into short- and long-term as of
 * `asOf` — the "if I sold today, what would I pay tax on" view.
 */
export function unrealizedTermSplit(
  lots: Lot[],
  currentPrice: number,
  asOf: string,
  ltcgMonths: number = DEFAULT_LTCG_MONTHS,
): { shortTermQty: number; longTermQty: number; shortTermGain: number; longTermGain: number } {
  const list = Array.isArray(lots) ? lots : [];
  const px = toNum(currentPrice);
  let shortTermQty = 0;
  let longTermQty = 0;
  let shortTermGain = 0;
  let longTermGain = 0;
  for (const lot of list) {
    const qty = toNum(lot?.qty);
    if (!(qty > 0)) continue;
    const gain = qty * px - qty * toNum(lot?.costPerUnit);
    if (termForHoldingPeriod(lot?.date, asOf, ltcgMonths) === "long") {
      longTermQty += qty;
      longTermGain += gain;
    } else {
      shortTermQty += qty;
      shortTermGain += gain;
    }
  }
  return {
    shortTermQty: safe(shortTermQty),
    longTermQty: safe(longTermQty),
    shortTermGain: safe(shortTermGain),
    longTermGain: safe(longTermGain),
  };
}

// ---------------------------------------------------------------------------
// Cash flows / XIRR inputs
// ---------------------------------------------------------------------------

/**
 * Cash flows for one holding, signed from the investor's point of view:
 * negative = money left your pocket. `bonus` and `split` restate units without
 * any cash moving, so they produce no flow. A terminal inflow equal to the
 * present market value is appended at `asOf` when there is anything left.
 */
export function holdingCashFlows(txns: HoldingTxn[], currentValue: number, asOf: string): CashFlow[] {
  const list = sortTxns(txns);
  const flows: CashFlow[] = [];

  for (const t of list) {
    const ms = toDayMs(t?.txn_date);
    if (ms === null) continue;
    const date = dayKey(ms);
    const kind = String(t?.kind ?? "");
    const fees = Math.abs(toNum(t?.fees));
    const price = toNum(t?.price);
    const qty = Math.abs(toNum(t?.quantity));

    if (addsUnits(kind)) {
      const amount = safe(qty * price + fees);
      if (amount !== 0) flows.push({ date, amount: -amount });
      continue;
    }
    if (removesUnits(kind)) {
      const amount = safe(qty * price - fees);
      if (amount !== 0) flows.push({ date, amount });
      continue;
    }
    if (isCashOnlyKind(kind)) {
      const amount = cashAmountOf(t);
      if (amount !== 0) flows.push({ date, amount });
      continue;
    }
    // bonus / split / unknown: no cash movement
  }

  const terminal = toNum(currentValue);
  const asOfMs = toDayMs(asOf);
  if (terminal > 0 && asOfMs !== null) flows.push({ date: dayKey(asOfMs), amount: terminal });
  return flows;
}

// ---------------------------------------------------------------------------
// SIP detection
// ---------------------------------------------------------------------------

function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  let sum = 0;
  for (const n of nums) sum += toNum(n);
  return safe(sum / nums.length);
}

function stddev(nums: number[]): number {
  if (nums.length < 2) return 0;
  const m = mean(nums);
  let acc = 0;
  for (const n of nums) acc += Math.pow(toNum(n) - m, 2);
  return safe(Math.sqrt(acc / nums.length));
}

function median(nums: number[]): number {
  const list = nums.filter((n) => Number.isFinite(n)).slice().sort((a, b) => a - b);
  if (list.length === 0) return 0;
  const mid = Math.floor(list.length / 2);
  return list.length % 2 === 1 ? list[mid] : safe((list[mid - 1] + list[mid]) / 2);
}

function gapsOf(txns: HoldingTxn[]): number[] {
  const days: number[] = [];
  for (const t of txns) {
    const ms = toDayMs(t?.txn_date);
    if (ms !== null) days.push(ms);
  }
  days.sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < days.length; i++) gaps.push(Math.round((days[i] - days[i - 1]) / MS_PER_DAY));
  return gaps;
}

/**
 * Classify a gap ladder. "irregular" when the gaps are not uniform (each gap
 * must sit within ±50% of the median) or when the median matches no cadence.
 */
function cadenceFromGaps(gaps: number[]): SipCadence | null {
  const g = gaps.filter((x) => Number.isFinite(x) && x > 0);
  if (g.length === 0) return null;
  const med = median(g);
  if (!(med > 0)) return null;
  const uniform = g.every((x) => x >= med * 0.5 && x <= med * 1.5);
  if (!uniform) return "irregular";
  if (med >= 6 && med <= 8) return "weekly";
  if (med >= 25 && med <= 35) return "monthly";
  if (med >= 85 && med <= 95) return "quarterly";
  return "irregular";
}

function investedAmountOf(t: HoldingTxn): number {
  const qty = Math.abs(toNum(t?.quantity));
  const price = toNum(t?.price);
  const fees = Math.abs(toNum(t?.fees));
  return safe(qty * price + fees);
}

/**
 * Explicit `sip` rows win. Otherwise infer: >= 3 plain buys, uniform gaps that
 * land on a real cadence, and similar ticket sizes (CV < 0.25).
 */
export function detectSip(txns: HoldingTxn[]): SipInfo {
  const list = sortTxns(txns);

  const sipRows = list.filter((t) => String(t?.kind) === "sip");
  if (sipRows.length > 0) {
    return {
      isSip: true,
      cadence: sipRows.length >= 2 ? cadenceFromGaps(gapsOf(sipRows)) : null,
      averageAmount: mean(sipRows.map(investedAmountOf)),
      count: sipRows.length,
    };
  }

  const buys = list.filter((t) => String(t?.kind) === "buy");
  if (buys.length >= 3) {
    const cadence = cadenceFromGaps(gapsOf(buys));
    const amounts = buys.map(investedAmountOf);
    const m = mean(amounts);
    const cv = m > 0 ? stddev(amounts) / m : Number.POSITIVE_INFINITY;
    if (cadence && cadence !== "irregular" && cv < 0.25) {
      return { isSip: true, cadence, averageAmount: m, count: buys.length };
    }
  }

  return { isSip: false, cadence: null, averageAmount: 0, count: 0 };
}

// ---------------------------------------------------------------------------
// Per-holding metrics
// ---------------------------------------------------------------------------

export function computeHoldingMetrics(args: {
  holding: HoldingRow;
  txns: HoldingTxn[];
  asOf: string;
}): HoldingMetrics {
  const holding = (args?.holding ?? {}) as HoldingRow;
  const txns = sortTxns(args?.txns);
  const asOf = toDayKey(args?.asOf) || toDayKey(new Date());
  const def = assetClassDef(holding?.asset_class);

  const fifo = fifoCostBasis(txns, { ltcgMonths: def.ltcgMonths });

  // A holding is "manually seeded" when its ledger contains nothing that could
  // move units (no buy/sip/contribution/sell/withdrawal/bonus/split). That
  // covers both an empty ledger and, say, a PPF account where the user only
  // logged interest credits. In that case we trust the stored
  // holdings.quantity / holdings.avg_price instead of a FIFO result of zero,
  // so hand-entered positions still show up with a real value.
  const hasUnitLedger = txns.some((t) => {
    const k = String(t?.kind ?? "");
    return addsUnits(k) || removesUnits(k) || k === "bonus" || k === "split";
  });

  const quantity = hasUnitLedger ? fifo.openQty : Math.max(0, toNum(holding?.quantity));
  const avgCost = hasUnitLedger ? fifo.avgCost : Math.max(0, toNum(holding?.avg_price));
  const invested = hasUnitLedger ? fifo.openCost : safe(quantity * avgCost);

  const storedPrice = toNum(holding?.current_price);
  // No price yet? Value the position at cost rather than at zero.
  const currentPrice = storedPrice > 0 ? storedPrice : avgCost;
  const currentValue = safe(quantity * currentPrice);

  const unrealized = safe(currentValue - invested);
  const realized = fifo.realizedGain;
  const income = fifo.incomeReceived;
  const totalReturn = safe(unrealized + realized + income);
  // Denominator = all capital ever deployed that we can still see: the open
  // cost basis plus the cost of the units already sold.
  const deployed = invested + fifo.realizedCost;
  const totalReturnPct = deployed > 0 ? safe((totalReturn / deployed) * 100) : 0;

  const flows = holdingCashFlows(txns, currentValue, asOf);
  const holdingXirr = xirr(flows);

  const firstTxnDate = txns.length > 0 ? toDayKey(txns[0]?.txn_date) || null : null;
  const lastTxnDate = txns.length > 0 ? toDayKey(txns[txns.length - 1]?.txn_date) || null : null;

  const priceUpdatedMs = toDayMs(holding?.price_updated_at);
  const priceStale = priceUpdatedMs === null ? true : daysBetween(dayKey(priceUpdatedMs), asOf) > PRICE_STALE_DAYS;

  const termSplit = unrealizedTermSplit(fifo.openLots, currentPrice, asOf, def.ltcgMonths);

  return {
    holdingId: String(holding?.id ?? ""),
    symbol: String(holding?.symbol ?? ""),
    name: String(holding?.name ?? holding?.symbol ?? ""),
    assetClass: def.value,
    accountId: String(holding?.account_id ?? ""),
    unitsLabel: String(holding?.units_label ?? "") || def.unitsLabel,
    currency: String(holding?.currency ?? "") || "INR",
    quantity: safe(quantity),
    avgCost: safe(avgCost),
    currentPrice: safe(currentPrice),
    invested: safe(invested),
    currentValue,
    unrealized,
    unrealizedPct: absoluteReturnPct(invested, currentValue),
    unrealizedShortTerm: termSplit.shortTermGain,
    unrealizedLongTerm: termSplit.longTermGain,
    realized,
    realizedShortTerm: fifo.shortTermGain,
    realizedLongTerm: fifo.longTermGain,
    realizedCost: fifo.realizedCost,
    realizedProceeds: fifo.realizedProceeds,
    soldQty: fifo.soldQty,
    income,
    totalFees: fifo.totalFees,
    totalReturn,
    totalReturnPct,
    xirr: holdingXirr,
    firstTxnDate,
    lastTxnDate,
    holdingDays: firstTxnDate ? Math.max(0, daysBetween(firstTxnDate, asOf)) : 0,
    txnCount: txns.length,
    targetPct: Math.max(0, toNum(holding?.target_allocation_pct)),
    sip: detectSip(txns),
    warnings: fifo.warnings,
    priceStale,
    isActive: holding?.is_active !== false,
  };
}

// ---------------------------------------------------------------------------
// Portfolio roll-up
// ---------------------------------------------------------------------------

function emptyTotals(): PortfolioTotals {
  return {
    currentValue: 0,
    invested: 0,
    unrealized: 0,
    unrealizedPct: 0,
    realized: 0,
    realizedShortTerm: 0,
    realizedLongTerm: 0,
    income: 0,
    totalFees: 0,
    totalReturn: 0,
    totalReturnPct: 0,
    holdingCount: 0,
    activeHoldingCount: 0,
  };
}

type Bucket = { key: string; label: string; group?: AssetGroup; value: number; invested: number; unrealized: number; count: number };

function bucketsToSlices(buckets: Map<string, Bucket>, totalValue: number): AllocationSlice[] {
  const out: AllocationSlice[] = [];
  for (const b of buckets.values()) {
    out.push({
      key: b.key,
      label: b.label,
      value: safe(b.value),
      pct: totalValue > 0 ? safe((b.value / totalValue) * 100) : 0,
      invested: safe(b.invested),
      unrealized: safe(b.unrealized),
      count: b.count,
      ...(b.group ? { group: b.group } : {}),
    });
  }
  out.sort((a, b) => b.value - a.value);
  return out;
}

export function computePortfolio(args: {
  holdings: HoldingRow[];
  txnsByHolding: TxnsByHolding;
  asOf: string;
  /** Optional, purely for nicer allocation labels. */
  accounts?: InvestmentAccountRef[];
}): PortfolioComputation {
  const holdings = Array.isArray(args?.holdings) ? args.holdings.filter((h) => !!h) : [];
  const txnsByHolding = (args?.txnsByHolding ?? {}) as TxnsByHolding;
  const asOf = toDayKey(args?.asOf) || toDayKey(new Date());
  const accounts = Array.isArray(args?.accounts) ? args.accounts.filter((a) => !!a) : [];

  const accountById = new Map<string, InvestmentAccountRef>();
  for (const a of accounts) accountById.set(String(a.id ?? ""), a);

  const metrics: HoldingMetrics[] = [];
  const totals = emptyTotals();
  const portfolioFlows: CashFlow[] = [];

  for (const h of holdings) {
    const raw = txnsByHolding[String(h?.id ?? "")];
    const txns = Array.isArray(raw) ? raw : [];
    const m = computeHoldingMetrics({ holding: h, txns, asOf });
    metrics.push(m);

    totals.currentValue += m.currentValue;
    totals.invested += m.invested;
    totals.realized += m.realized;
    totals.realizedShortTerm += m.realizedShortTerm;
    totals.realizedLongTerm += m.realizedLongTerm;
    totals.income += m.income;
    totals.totalFees += m.totalFees;

    // Portfolio XIRR uses the CONCATENATION of every holding's flows with the
    // per-holding TERMINAL flows dropped (currentValue = 0 below), then ONE
    // aggregate terminal flow for the whole portfolio. Keeping the per-holding
    // terminals AND adding the aggregate one would count today's market value
    // twice and produce a wildly inflated rate. Using a single aggregate flow
    // also guarantees the XIRR is anchored to exactly the same number the KPI
    // tile shows (totals.currentValue) on exactly the as-of date.
    for (const f of holdingCashFlows(txns, 0, asOf)) portfolioFlows.push(f);
  }

  // realizedCost across the book, for the return-on-deployed-capital figure
  let realizedCostTotal = 0;
  for (const m of metrics) realizedCostTotal += m.realizedCost;

  totals.currentValue = safe(totals.currentValue);
  totals.invested = safe(totals.invested);
  totals.unrealized = safe(totals.currentValue - totals.invested);
  totals.unrealizedPct = absoluteReturnPct(totals.invested, totals.currentValue);
  totals.realized = safe(totals.realized);
  totals.realizedShortTerm = safe(totals.realizedShortTerm);
  totals.realizedLongTerm = safe(totals.realizedLongTerm);
  totals.income = safe(totals.income);
  totals.totalFees = safe(totals.totalFees);
  totals.totalReturn = safe(totals.unrealized + totals.realized + totals.income);
  const deployed = totals.invested + realizedCostTotal;
  totals.totalReturnPct = deployed > 0 ? safe((totals.totalReturn / deployed) * 100) : 0;
  totals.holdingCount = metrics.length;
  totals.activeHoldingCount = metrics.filter((m) => m.isActive && m.quantity > 0).length;

  if (totals.currentValue > 0) portfolioFlows.push({ date: asOf, amount: totals.currentValue });
  const portfolioXirr = xirr(portfolioFlows);

  // --- allocations ---------------------------------------------------------
  const byAssetClass = new Map<string, Bucket>();
  const byAccount = new Map<string, Bucket>();
  const byGroup = new Map<string, Bucket>();

  for (const m of metrics) {
    if (m.currentValue === 0 && m.invested === 0) continue;
    const def = ASSET_CLASS_BY_VALUE[m.assetClass] ?? assetClassDef(m.assetClass);

    const ac = byAssetClass.get(m.assetClass) ?? {
      key: m.assetClass,
      label: def.label,
      group: def.group,
      value: 0,
      invested: 0,
      unrealized: 0,
      count: 0,
    };
    ac.value += m.currentValue;
    ac.invested += m.invested;
    ac.unrealized += m.unrealized;
    ac.count += 1;
    byAssetClass.set(m.assetClass, ac);

    const acctRef = accountById.get(m.accountId);
    const acct = byAccount.get(m.accountId) ?? {
      key: m.accountId,
      label: String(acctRef?.name ?? "") || m.symbol || "Unassigned",
      group: (acctRef?.group as AssetGroup | undefined) ?? def.group,
      value: 0,
      invested: 0,
      unrealized: 0,
      count: 0,
    };
    acct.value += m.currentValue;
    acct.invested += m.invested;
    acct.unrealized += m.unrealized;
    acct.count += 1;
    byAccount.set(m.accountId, acct);

    const grp = byGroup.get(def.group) ?? {
      key: def.group,
      label: GROUP_LABELS[def.group] ?? GROUP_LABEL_FALLBACK,
      group: def.group,
      value: 0,
      invested: 0,
      unrealized: 0,
      count: 0,
    };
    grp.value += m.currentValue;
    grp.invested += m.invested;
    grp.unrealized += m.unrealized;
    grp.count += 1;
    byGroup.set(def.group, grp);
  }

  // --- best / worst performer (needs real skin in the game) ----------------
  const ranked = metrics
    .filter((m) => m.invested > 0 && m.quantity > 0)
    .slice()
    .sort((a, b) => b.unrealizedPct - a.unrealizedPct);

  return {
    metrics,
    totals,
    xirr: portfolioXirr,
    allocationByAssetClass: bucketsToSlices(byAssetClass, totals.currentValue),
    allocationByAccount: bucketsToSlices(byAccount, totals.currentValue),
    allocationByGroup: bucketsToSlices(byGroup, totals.currentValue),
    bestPerformer: ranked.length > 0 ? ranked[0] : null,
    worstPerformer: ranked.length > 1 ? ranked[ranked.length - 1] : null,
    asOf,
  };
}

// ---------------------------------------------------------------------------
// Time series
// ---------------------------------------------------------------------------

/** Month-end dates from `fromMs` to `toMs`, always finishing exactly on `toMs`. */
function monthEndBuckets(fromMs: number, toMs: number): number[] {
  const out: number[] = [];
  const start = new Date(fromMs);
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth();
  for (let guard = 0; guard < 1200; guard++) {
    const end = Date.UTC(y, m + 1, 0);
    if (end > toMs) break;
    if (end >= fromMs) out.push(end);
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  if (out.length === 0 || out[out.length - 1] !== toMs) out.push(toMs);
  return out;
}

function downsample(values: number[], buckets: number): number[] {
  const n = values.length;
  if (buckets < 2 || buckets >= n) return values;
  const picked: number[] = [];
  for (let i = 0; i < buckets; i++) picked.push(values[Math.round((i * (n - 1)) / (buckets - 1))]);
  return picked.filter((v, i) => i === 0 || v !== picked[i - 1]);
}

/** Latest known price at or before `atMs`. `points` must be sorted DESC. */
function priceAt(points: PriceHistoryPoint[] | undefined, atMs: number): number | null {
  if (!Array.isArray(points)) return null;
  for (const p of points) {
    const ms = toDayMs(p?.price_date);
    if (ms === null || ms > atMs) continue;
    const px = toNum(p?.price);
    if (px > 0) return px;
  }
  return null;
}

/**
 * Value-vs-invested series on month-end buckets. `invested` is the cumulative
 * open cost basis at that date; `value` is units held × the best price known at
 * or before that date, falling back to the lot average cost and then to the
 * stored current price. Strictly ascending in time, never NaN.
 */
export function buildValueSeries(args: {
  holdings: HoldingRow[];
  txnsByHolding: TxnsByHolding;
  priceHistory: PriceHistoryMap;
  from: string;
  to: string;
  buckets?: number;
}): ValuePoint[] {
  const holdings = Array.isArray(args?.holdings) ? args.holdings.filter((h) => !!h) : [];
  const txnsByHolding = (args?.txnsByHolding ?? {}) as TxnsByHolding;
  const priceHistory = (args?.priceHistory ?? {}) as PriceHistoryMap;
  const fromMs = toDayMs(args?.from);
  const toMs = toDayMs(args?.to);
  if (fromMs === null || toMs === null || toMs < fromMs || holdings.length === 0) return [];

  let dates = monthEndBuckets(fromMs, toMs);
  const wanted = Math.trunc(toNum(args?.buckets));
  if (wanted > 1 && dates.length > wanted) dates = downsample(dates, wanted);

  // sort each symbol's history once, newest first
  const sortedPrices: Record<string, PriceHistoryPoint[]> = {};
  for (const [symbol, points] of Object.entries(priceHistory)) {
    sortedPrices[symbol] = (Array.isArray(points) ? points.filter((p) => !!p) : [])
      .slice()
      .sort((a, b) => (toDayKey(b?.price_date) < toDayKey(a?.price_date) ? -1 : 1));
  }

  // pre-bucket each holding's ledger so we only parse dates once
  const prepared = holdings.map((h) => {
    const raw = txnsByHolding[String(h?.id ?? "")];
    const all = sortTxns(Array.isArray(raw) ? raw : []);
    return {
      holding: h,
      def: assetClassDef(h?.asset_class),
      all,
      dated: all.map((t) => ({ txn: t, ms: toDayMs(t?.txn_date) })).filter((x) => x.ms !== null) as {
        txn: HoldingTxn;
        ms: number;
      }[],
    };
  });

  const out: ValuePoint[] = [];
  for (const dMs of dates) {
    let invested = 0;
    let value = 0;
    for (const p of prepared) {
      const upto = p.dated.filter((x) => x.ms <= dMs).map((x) => x.txn);
      let qty = 0;
      let cost = 0;
      let avg = 0;
      if (upto.length === 0) {
        // Nothing in the ledger yet at this date. If the holding has NO ledger
        // at all it was seeded by hand, so carry its stored position across the
        // whole series instead of drawing a flat zero.
        if (p.all.length === 0) {
          qty = Math.max(0, toNum(p.holding?.quantity));
          avg = Math.max(0, toNum(p.holding?.avg_price));
          cost = safe(qty * avg);
        }
      } else {
        const fifo = fifoCostBasis(upto, { ltcgMonths: p.def.ltcgMonths });
        qty = fifo.openQty;
        cost = fifo.openCost;
        avg = fifo.avgCost;
      }
      invested += cost;
      if (qty > 0) {
        const px = priceAt(sortedPrices[String(p.holding?.symbol ?? "")], dMs) ?? (avg > 0 ? avg : toNum(p.holding?.current_price));
        value += safe(qty * px);
      }
    }
    out.push({ date: dayKey(dMs), invested: safe(invested), value: safe(value) });
  }
  return out;
}

/**
 * Monthly cash in / out across the whole book. Every month in [from, to] is
 * present (zero-filled) so the bar chart has no gaps.
 */
export function monthlyContributions(
  txnsByHolding: TxnsByHolding,
  from: string,
  to: string,
): MonthlyContribution[] {
  const fromMs = toDayMs(from);
  const toMs = toDayMs(to);
  if (fromMs === null || toMs === null || toMs < fromMs) return [];

  const rows = new Map<string, MonthlyContribution>();
  const startD = new Date(fromMs);
  const endD = new Date(toMs);
  let y = startD.getUTCFullYear();
  let m = startD.getUTCMonth();
  const endY = endD.getUTCFullYear();
  const endM = endD.getUTCMonth();
  for (let guard = 0; guard < 1200; guard++) {
    if (y > endY || (y === endY && m > endM)) break;
    const key = `${y}-${pad2(m + 1)}`;
    rows.set(key, { month: key, invested: 0, withdrawn: 0, net: 0, sipAmount: 0 });
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }

  const groups = Object.values(txnsByHolding ?? {});
  for (const list of groups) {
    for (const t of Array.isArray(list) ? list : []) {
      const ms = toDayMs(t?.txn_date);
      if (ms === null || ms < fromMs || ms > toMs) continue;
      const row = rows.get(monthKey(ms));
      if (!row) continue;
      const kind = String(t?.kind ?? "");
      const fees = Math.abs(toNum(t?.fees));
      const qty = Math.abs(toNum(t?.quantity));
      const price = toNum(t?.price);
      if (addsUnits(kind)) {
        const amount = safe(qty * price + fees);
        row.invested += amount;
        if (kind === "sip") row.sipAmount += amount;
      } else if (removesUnits(kind)) {
        row.withdrawn += safe(qty * price - fees);
      }
    }
  }

  const out = Array.from(rows.values()).sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
  for (const r of out) {
    r.invested = safe(r.invested);
    r.withdrawn = safe(r.withdrawn);
    r.sipAmount = safe(r.sipAmount);
    r.net = safe(r.invested - r.withdrawn);
  }
  return out;
}

/**
 * Target vs actual allocation drift. Returns [] when nobody has set a target,
 * so the UI can hide the whole card. Sorted by biggest absolute drift first.
 */
export function drift(metrics: HoldingMetrics[], totalValue: number): DriftRow[] {
  const list = Array.isArray(metrics) ? metrics.filter((m) => !!m) : [];
  const total = toNum(totalValue);
  if (!list.some((m) => toNum(m?.targetPct) > 0)) return [];

  const rows: DriftRow[] = list
    .filter((m) => toNum(m?.targetPct) > 0 || toNum(m?.currentValue) > 0)
    .map((m) => {
      const targetPct = Math.max(0, toNum(m?.targetPct));
      const actualPct = total > 0 ? safe((toNum(m?.currentValue) / total) * 100) : 0;
      return {
        holdingId: String(m?.holdingId ?? ""),
        symbol: String(m?.symbol ?? ""),
        targetPct: safe(targetPct),
        actualPct,
        driftPct: safe(actualPct - targetPct),
      };
    });

  rows.sort((a, b) => Math.abs(b.driftPct) - Math.abs(a.driftPct));
  return rows;
}
