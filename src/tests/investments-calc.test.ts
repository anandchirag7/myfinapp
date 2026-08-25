import { describe, it, expect } from "./test-framework";
import {
  absoluteReturnPct,
  buildValueSeries,
  cagr,
  computeHoldingMetrics,
  computePortfolio,
  detectSip,
  drift,
  fifoCostBasis,
  holdingCashFlows,
  monthlyContributions,
  npvAtRate,
  termForHoldingPeriod,
  xirr,
  type CashFlow,
} from "../lib/investments-calc";
import type { HoldingRow, HoldingTxn, TxnKind } from "../lib/investments-types";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Float compare with an explicit epsilon — used only where the math is inexact. */
function approx(a: number, b: number, eps = 1e-9): boolean {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= eps;
}

let seq = 0;
function txn(p: Partial<HoldingTxn> & { txn_date: string; kind: TxnKind }): HoldingTxn {
  seq += 1;
  return {
    id: p.id ?? `t-${seq}`,
    holding_id: p.holding_id ?? "h1",
    txn_date: p.txn_date,
    quantity: p.quantity ?? 0,
    price: p.price ?? 0,
    kind: p.kind,
    fees: p.fees ?? 0,
    amount: p.amount === undefined ? null : p.amount,
    notes: p.notes ?? null,
    // monotonic so same-date rows keep insertion order after sorting
    created_at: p.created_at ?? new Date(Date.UTC(2020, 0, 1) + seq * 1000).toISOString(),
  };
}

function holding(p: Partial<HoldingRow> & { id: string }): HoldingRow {
  return {
    id: p.id,
    account_id: p.account_id ?? "acc-1",
    household_id: p.household_id ?? "hh-1",
    symbol: p.symbol ?? p.id,
    name: p.name ?? null,
    quantity: p.quantity ?? 0,
    avg_price: p.avg_price ?? 0,
    current_price: p.current_price ?? 0,
    asset_class: p.asset_class ?? "equity_mf",
    isin: p.isin ?? null,
    folio_number: p.folio_number ?? null,
    currency: p.currency ?? "INR",
    units_label: p.units_label ?? null,
    sector: p.sector ?? null,
    target_allocation_pct: p.target_allocation_pct ?? null,
    notes: p.notes ?? null,
    is_active: p.is_active ?? true,
    updated_at: p.updated_at ?? "2026-08-25T00:00:00.000Z",
    price_updated_at: p.price_updated_at ?? null,
  };
}

/** 1st-of-month dates, `n` of them, starting at `startISO`. */
function monthlyDates(startISO: string, n: number): string[] {
  const [y, m, d] = startISO.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const monthIndex = m - 1 + i;
    const yy = y + Math.floor(monthIndex / 12);
    const mm = (monthIndex % 12) + 1;
    out.push(`${yy}-${String(mm).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return out;
}

export function registerInvestmentsCalcTests() {
  // -------------------------------------------------------------------------
  describe("Investments — XIRR & return math", () => {
    it("solves a single buy + terminal value over exactly one year at +10%", () => {
      const flows: CashFlow[] = [
        { date: "2025-01-01", amount: -100000 },
        { date: "2026-01-01", amount: 110000 },
      ];
      const r = xirr(flows);
      expect(r).not.toBeNull();
      expect(approx(r as number, 0.1, 1e-3)).toBe(true);
    });

    it("solves a 12-month ₹5,000 monthly SIP and the answer zeroes the NPV", () => {
      const dates = monthlyDates("2025-01-01", 12);
      const flows: CashFlow[] = dates.map((date) => ({ date, amount: -5000 }));
      // 12 × 5,000 = 60,000 invested, worth 66,500 a year after the first debit
      flows.push({ date: "2026-01-01", amount: 66500 });

      const r = xirr(flows);
      expect(r).not.toBeNull();
      const rate = r as number;
      // self-consistency: the returned rate must be an actual root of the NPV
      expect(approx(npvAtRate(rate, flows), 0, 1e-4)).toBe(true);
      // a money-weighted return on a SIP must beat the absolute return, because
      // the average rupee was only invested for about half the year
      expect(rate).toBeGreaterThan(0.1083);
      expect(rate).toBeLessThan(0.5);
    });

    it("returns null for empty, single-flow, all-negative and all-positive sets", () => {
      expect(xirr([])).toBeNull();
      expect(xirr([{ date: "2026-01-01", amount: -1000 }])).toBeNull();
      expect(
        xirr([
          { date: "2026-01-01", amount: -1000 },
          { date: "2026-06-01", amount: -2000 },
        ]),
      ).toBeNull();
      expect(
        xirr([
          { date: "2026-01-01", amount: 1000 },
          { date: "2026-06-01", amount: 2000 },
        ]),
      ).toBeNull();
    });

    it("never returns NaN on pathological flows", () => {
      const oneDayWipeout = xirr([
        { date: "2026-01-01", amount: -100000 },
        { date: "2026-01-02", amount: 1 },
      ]);
      // may legitimately be null (root is outside the -99.99%..10000% domain),
      // but it must never be NaN or Infinity
      expect(oneDayWipeout === null || Number.isFinite(oneDayWipeout)).toBe(true);

      // a 99% loss over one year DOES have a root inside the domain
      const bigLoss = xirr([
        { date: "2025-01-01", amount: -100000 },
        { date: "2026-01-01", amount: 1000 },
      ]);
      expect(bigLoss).not.toBeNull();
      expect(approx(bigLoss as number, -0.99, 1e-4)).toBe(true);

      // all flows on the same day => no root exists
      expect(
        xirr([
          { date: "2026-01-01", amount: -500 },
          { date: "2026-01-01", amount: 500.01 },
        ]),
      ).toBeNull();
    });

    it("computes cagr and absolute return defensively", () => {
      expect(approx(cagr(100000, 121000, 2) as number, 0.1, 1e-9)).toBe(true);
      expect(cagr(0, 100, 1)).toBeNull();
      expect(cagr(100, 100, 0)).toBeNull();
      expect(cagr(100, 0, 1)).toBe(-1);
      expect(absoluteReturnPct(0, 5000)).toBe(0);
      expect(absoluteReturnPct(-10, 5000)).toBe(0);
      expect(approx(absoluteReturnPct(20000, 25000), 25, 1e-9)).toBe(true);
    });

    it("builds signed cash flows from a ledger and appends the terminal value", () => {
      const txns = [
        txn({ txn_date: "2025-04-10", kind: "buy", quantity: 10, price: 100, fees: 20 }),
        txn({ txn_date: "2025-10-10", kind: "dividend", amount: 300 }),
        txn({ txn_date: "2026-04-10", kind: "sell", quantity: 4, price: 150, fees: 10 }),
        txn({ txn_date: "2026-04-10", kind: "bonus", quantity: 2 }),
      ];
      const flows = holdingCashFlows(txns, 1200, "2026-08-25");
      expect(flows.length).toBe(4); // bonus contributes no cash flow
      expect(flows[0].amount).toBe(-1020);
      expect(flows[1].amount).toBe(300);
      expect(flows[2].amount).toBe(590);
      expect(flows[3].amount).toBe(1200);
      expect(flows[3].date).toBe("2026-08-25");
      // no terminal flow when the position is worth nothing
      expect(holdingCashFlows(txns, 0, "2026-08-25").length).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  describe("Investments — FIFO cost basis", () => {
    it("matches a partial sell against the two oldest lots", () => {
      const res = fifoCostBasis([
        txn({ txn_date: "2025-01-01", kind: "buy", quantity: 10, price: 100 }),
        txn({ txn_date: "2025-06-01", kind: "buy", quantity: 10, price: 120 }),
        txn({ txn_date: "2026-07-01", kind: "sell", quantity: 15, price: 150 }),
      ]);
      expect(res.realizedProceeds).toBe(2250);
      expect(res.realizedCost).toBe(1600);
      expect(res.realizedGain).toBe(650); // (1500-1000) + (750-600)
      expect(res.soldQty).toBe(15);
      expect(res.openQty).toBe(5);
      expect(res.openCost).toBe(600);
      expect(res.avgCost).toBe(120);
      expect(res.openLots.length).toBe(1);
      expect(res.sales.length).toBe(2); // one row per lot consumed
      expect(res.warnings.length).toBe(0);
    });

    it("capitalises fees into cost on buys and nets them off proceeds on sells", () => {
      const afterBuy = fifoCostBasis([
        txn({ txn_date: "2025-01-01", kind: "buy", quantity: 10, price: 100, fees: 20 }),
      ]);
      expect(afterBuy.avgCost).toBe(102);
      expect(afterBuy.openCost).toBe(1020);
      expect(afterBuy.totalFees).toBe(20);

      const afterSell = fifoCostBasis([
        txn({ txn_date: "2025-01-01", kind: "buy", quantity: 10, price: 100, fees: 20 }),
        txn({ txn_date: "2025-03-01", kind: "sell", quantity: 10, price: 110, fees: 10 }),
      ]);
      expect(afterSell.realizedProceeds).toBe(1090);
      expect(afterSell.realizedCost).toBe(1020);
      expect(afterSell.realizedGain).toBe(70);
      expect(afterSell.totalFees).toBe(30);
      expect(afterSell.openQty).toBe(0);
      expect(afterSell.openCost).toBe(0);
      expect(afterSell.avgCost).toBe(0);
    });

    it("adds bonus units at zero cost and lowers the average", () => {
      const res = fifoCostBasis([
        txn({ txn_date: "2025-01-01", kind: "buy", quantity: 100, price: 50 }),
        txn({ txn_date: "2025-07-01", kind: "bonus", quantity: 100 }),
      ]);
      expect(res.openQty).toBe(200);
      expect(res.openCost).toBe(5000);
      expect(res.avgCost).toBe(25);
      expect(res.openLots.length).toBe(2);
      expect(res.openLots[1].costPerUnit).toBe(0);
    });

    it("applies a 1:2 split by doubling units and halving the average", () => {
      const res = fifoCostBasis([
        txn({ txn_date: "2025-01-01", kind: "buy", quantity: 10, price: 100 }),
        txn({ txn_date: "2025-09-01", kind: "split", quantity: 2 }),
      ]);
      expect(res.openQty).toBe(20);
      expect(res.avgCost).toBe(50);
      expect(res.openCost).toBe(1000); // cost basis is untouched by a split
      expect(res.warnings.length).toBe(0);

      const bad = fifoCostBasis([
        txn({ txn_date: "2025-01-01", kind: "buy", quantity: 10, price: 100 }),
        txn({ txn_date: "2025-09-01", kind: "split", quantity: 0 }),
      ]);
      expect(bad.openQty).toBe(10);
      expect(bad.warnings.length).toBe(1);
    });

    it("classifies short vs long term on both sides of the 12-month boundary", () => {
      const onTheAnniversary = fifoCostBasis(
        [
          txn({ txn_date: "2025-01-15", kind: "buy", quantity: 10, price: 100 }),
          txn({ txn_date: "2026-01-15", kind: "sell", quantity: 10, price: 150 }),
        ],
        { ltcgMonths: 12 },
      );
      expect(onTheAnniversary.sales[0].term).toBe("short"); // must be held MORE than 12 months
      expect(onTheAnniversary.shortTermGain).toBe(500);
      expect(onTheAnniversary.longTermGain).toBe(0);
      expect(onTheAnniversary.sales[0].holdingDays).toBe(365);

      const oneDayLater = fifoCostBasis(
        [
          txn({ txn_date: "2025-01-15", kind: "buy", quantity: 10, price: 100 }),
          txn({ txn_date: "2026-01-16", kind: "sell", quantity: 10, price: 150 }),
        ],
        { ltcgMonths: 12 },
      );
      expect(oneDayLater.sales[0].term).toBe("long");
      expect(oneDayLater.longTermGain).toBe(500);
      expect(oneDayLater.shortTermGain).toBe(0);

      // debt / gold use a 24-month clock, so the same hold is still short-term
      const debtClock = fifoCostBasis(
        [
          txn({ txn_date: "2025-01-15", kind: "buy", quantity: 10, price: 100 }),
          txn({ txn_date: "2026-01-16", kind: "sell", quantity: 10, price: 150 }),
        ],
        { ltcgMonths: 24 },
      );
      expect(debtClock.sales[0].term).toBe("short");

      // calendar-month arithmetic clamps the day of month
      expect(termForHoldingPeriod("2025-01-31", "2026-01-31", 12)).toBe("short");
      expect(termForHoldingPeriod("2024-02-29", "2025-02-28", 12)).toBe("short");
      expect(termForHoldingPeriod("2024-02-29", "2025-03-01", 12)).toBe("long");
    });

    it("warns instead of throwing when the ledger oversells", () => {
      let res: ReturnType<typeof fifoCostBasis> | null = null;
      expect(() => {
        res = fifoCostBasis([
          txn({ txn_date: "2025-01-01", kind: "buy", quantity: 10, price: 100 }),
          txn({ txn_date: "2026-01-01", kind: "sell", quantity: 15, price: 150 }),
        ]);
      }).not.toThrow();
      const r = res as unknown as ReturnType<typeof fifoCostBasis>;
      expect(r.warnings.length).toBe(1);
      expect(r.warnings[0].includes("sold more units than held")).toBe(true);
      expect(r.warnings[0].includes("2026-01-01")).toBe(true);
      expect(r.openQty).toBe(0);
      expect(r.soldQty).toBe(15);
      expect(r.realizedProceeds).toBe(2250);
      expect(r.realizedCost).toBe(1000); // the excess 5 units are booked at zero cost
      expect(r.realizedGain).toBe(1250);
    });

    it("accumulates dividends into income without touching units", () => {
      const res = fifoCostBasis([
        txn({ txn_date: "2025-01-01", kind: "buy", quantity: 100, price: 10 }),
        txn({ txn_date: "2025-06-01", kind: "dividend", amount: 500 }),
        // no explicit amount => qty × price
        txn({ txn_date: "2025-12-01", kind: "dividend", quantity: 100, price: 2 }),
        txn({ txn_date: "2026-03-31", kind: "interest", amount: 125.5 }),
      ]);
      expect(res.incomeReceived).toBe(825.5);
      expect(res.openQty).toBe(100);
      expect(res.openCost).toBe(1000);
      expect(res.realizedGain).toBe(0);
      expect(res.sales.length).toBe(0);
    });

    it("returns zeros for an empty or junk ledger without throwing", () => {
      const empty = fifoCostBasis([]);
      expect(empty.openQty).toBe(0);
      expect(empty.avgCost).toBe(0);
      expect(empty.realizedGain).toBe(0);
      expect(empty.warnings.length).toBe(0);

      const junk = fifoCostBasis([
        txn({ txn_date: "not-a-date", kind: "buy", quantity: 10, price: 100 }),
        txn({ txn_date: "2025-01-01", kind: "buy", quantity: 0, price: 100 }),
      ]);
      expect(junk.openQty).toBe(0);
      expect(junk.warnings.length).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  describe("Investments — holding & portfolio metrics", () => {
    it("falls back to the stored quantity and avg_price when there are no transactions", () => {
      const m = computeHoldingMetrics({
        holding: holding({
          id: "h-ppf",
          symbol: "PPF-SBI",
          name: "SBI PPF",
          asset_class: "ppf",
          quantity: 1000,
          avg_price: 25,
          current_price: 30,
        }),
        txns: [],
        asOf: "2026-08-25",
      });
      expect(m.quantity).toBe(1000);
      expect(m.avgCost).toBe(25);
      expect(m.invested).toBe(25000);
      expect(m.currentValue).toBe(30000);
      expect(m.unrealized).toBe(5000);
      expect(approx(m.unrealizedPct, 20, 1e-9)).toBe(true);
      expect(m.txnCount).toBe(0);
      expect(m.xirr).toBeNull();
      expect(m.priceStale).toBe(true); // price_updated_at is null
      expect(m.unitsLabel).toBe("₹"); // PPF speaks rupees, not units
      expect(m.sip.isSip).toBe(false);
      expect(m.warnings.length).toBe(0);
    });

    it("values a position at cost when no price has ever been entered", () => {
      const m = computeHoldingMetrics({
        holding: holding({ id: "h-x", asset_class: "stocks", current_price: 0 }),
        txns: [txn({ holding_id: "h-x", txn_date: "2026-01-01", kind: "buy", quantity: 10, price: 250 })],
        asOf: "2026-08-25",
      });
      expect(m.quantity).toBe(10);
      expect(m.currentPrice).toBe(250);
      expect(m.currentValue).toBe(2500);
      expect(m.unrealized).toBe(0);
    });

    it("rolls up totals as the sum of the parts and allocations to ~100%", () => {
      const holdings: HoldingRow[] = [
        holding({ id: "h1", symbol: "HDFCFLEXI", asset_class: "equity_mf", current_price: 130, account_id: "acc-mf" }),
        holding({ id: "h2", symbol: "INFY", asset_class: "stocks", current_price: 1600, account_id: "acc-demat" }),
        holding({ id: "h3", symbol: "SGB28", asset_class: "gold_sgb", current_price: 7200, account_id: "acc-demat" }),
      ];
      const txnsByHolding: Record<string, HoldingTxn[]> = {
        h1: [
          txn({ holding_id: "h1", txn_date: "2024-04-01", kind: "sip", quantity: 100, price: 100 }),
          txn({ holding_id: "h1", txn_date: "2024-05-01", kind: "sip", quantity: 100, price: 110 }),
          txn({ holding_id: "h1", txn_date: "2026-01-15", kind: "sell", quantity: 50, price: 125 }),
        ],
        h2: [
          txn({ holding_id: "h2", txn_date: "2023-06-15", kind: "buy", quantity: 10, price: 1400, fees: 50 }),
          txn({ holding_id: "h2", txn_date: "2025-07-01", kind: "dividend", amount: 400 }),
        ],
        h3: [txn({ holding_id: "h3", txn_date: "2025-02-01", kind: "buy", quantity: 5, price: 6000 })],
      };

      const p = computePortfolio({
        holdings,
        txnsByHolding,
        asOf: "2026-08-25",
        accounts: [
          { id: "acc-mf", name: "Zerodha Coin", category: "mutual_fund" },
          { id: "acc-demat", name: "Zerodha Demat", category: "stocks" },
        ],
      });

      expect(p.metrics.length).toBe(3);
      const sum = (pick: (m: (typeof p.metrics)[number]) => number) => p.metrics.reduce((s, m) => s + pick(m), 0);
      expect(approx(p.totals.currentValue, sum((m) => m.currentValue), 1e-6)).toBe(true);
      expect(approx(p.totals.invested, sum((m) => m.invested), 1e-6)).toBe(true);
      expect(approx(p.totals.realized, sum((m) => m.realized), 1e-6)).toBe(true);
      expect(approx(p.totals.income, sum((m) => m.income), 1e-6)).toBe(true);
      expect(approx(p.totals.totalFees, sum((m) => m.totalFees), 1e-6)).toBe(true);
      expect(approx(p.totals.unrealized, p.totals.currentValue - p.totals.invested, 1e-6)).toBe(true);
      expect(approx(p.totals.totalReturn, p.totals.unrealized + p.totals.realized + p.totals.income, 1e-6)).toBe(true);
      expect(p.totals.holdingCount).toBe(3);
      expect(p.totals.activeHoldingCount).toBe(3);

      // 150 units of h1 left (200 bought, 50 sold) at 130
      expect(p.metrics[0].quantity).toBe(150);
      expect(approx(p.metrics[0].currentValue, 19500, 1e-6)).toBe(true);

      const pctSum = (rows: { pct: number }[]) => rows.reduce((s, r) => s + r.pct, 0);
      expect(p.allocationByAssetClass.length).toBe(3);
      expect(approx(pctSum(p.allocationByAssetClass), 100, 1e-6)).toBe(true);
      expect(p.allocationByAccount.length).toBe(2);
      expect(approx(pctSum(p.allocationByAccount), 100, 1e-6)).toBe(true);
      expect(approx(pctSum(p.allocationByGroup), 100, 1e-6)).toBe(true);
      expect(p.allocationByAccount.some((a) => a.label === "Zerodha Demat")).toBe(true);

      // allocation slices are sorted by value, so the biggest is first
      expect(p.allocationByAssetClass[0].value >= p.allocationByAssetClass[1].value).toBe(true);

      expect(p.xirr === null || Number.isFinite(p.xirr)).toBe(true);
      expect(p.bestPerformer).not.toBeNull();
      expect(p.worstPerformer).not.toBeNull();
      expect((p.bestPerformer?.unrealizedPct ?? 0) >= (p.worstPerformer?.unrealizedPct ?? 0)).toBe(true);
      expect(p.asOf).toBe("2026-08-25");
    });

    it("returns empty, zeroed output for an empty portfolio", () => {
      const p = computePortfolio({ holdings: [], txnsByHolding: {}, asOf: "2026-08-25" });
      expect(p.metrics.length).toBe(0);
      expect(p.totals.currentValue).toBe(0);
      expect(p.totals.unrealizedPct).toBe(0);
      expect(p.totals.totalReturnPct).toBe(0);
      expect(p.xirr).toBeNull();
      expect(p.allocationByAssetClass.length).toBe(0);
      expect(p.bestPerformer).toBeNull();
      expect(p.worstPerformer).toBeNull();
    });

    it("computes target-vs-actual drift and hides itself when no target is set", () => {
      const holdings: HoldingRow[] = [
        holding({ id: "h1", symbol: "EQ", current_price: 100, quantity: 600, avg_price: 100, target_allocation_pct: 70 }),
        holding({ id: "h2", symbol: "DEBT", current_price: 100, quantity: 400, avg_price: 100, target_allocation_pct: 30, asset_class: "debt_mf" }),
      ];
      const p = computePortfolio({ holdings, txnsByHolding: {}, asOf: "2026-08-25" });
      const rows = drift(p.metrics, p.totals.currentValue);
      expect(rows.length).toBe(2);
      const eq = rows.find((r) => r.symbol === "EQ");
      expect(approx(eq?.actualPct ?? 0, 60, 1e-9)).toBe(true);
      expect(approx(eq?.driftPct ?? 0, -10, 1e-9)).toBe(true);
      // biggest absolute drift first
      expect(Math.abs(rows[0].driftPct) >= Math.abs(rows[1].driftPct)).toBe(true);

      const noTargets = computePortfolio({
        holdings: [holding({ id: "h9", quantity: 10, avg_price: 10, current_price: 12 })],
        txnsByHolding: {},
        asOf: "2026-08-25",
      });
      expect(drift(noTargets.metrics, noTargets.totals.currentValue).length).toBe(0);
      expect(drift([], 0).length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  describe("Investments — SIP detection", () => {
    it("recognises 12 equal monthly buys as a monthly SIP", () => {
      const txns = monthlyDates("2025-01-05", 12).map((date) =>
        txn({ txn_date: date, kind: "buy", quantity: 50, price: 100 }),
      );
      const sip = detectSip(txns);
      expect(sip.isSip).toBe(true);
      expect(sip.cadence).toBe("monthly");
      expect(sip.count).toBe(12);
      expect(approx(sip.averageAmount, 5000, 1e-6)).toBe(true);
    });

    it("rejects three buys with random gaps", () => {
      const sip = detectSip([
        txn({ txn_date: "2025-01-05", kind: "buy", quantity: 10, price: 100 }),
        txn({ txn_date: "2025-01-08", kind: "buy", quantity: 3, price: 100 }),
        txn({ txn_date: "2025-02-24", kind: "buy", quantity: 40, price: 100 }),
      ]);
      expect(sip.isSip).toBe(false);
      expect(sip.cadence).toBeNull();
      expect(sip.count).toBe(0);
      expect(sip.averageAmount).toBe(0);
    });

    it("trusts explicit sip rows and reads their cadence", () => {
      const weekly = detectSip(
        ["2026-01-02", "2026-01-09", "2026-01-16", "2026-01-23"].map((date) =>
          txn({ txn_date: date, kind: "sip", quantity: 20, price: 50, fees: 0 }),
        ),
      );
      expect(weekly.isSip).toBe(true);
      expect(weekly.cadence).toBe("weekly");
      expect(weekly.count).toBe(4);
      expect(approx(weekly.averageAmount, 1000, 1e-6)).toBe(true);

      const single = detectSip([txn({ txn_date: "2026-01-02", kind: "sip", quantity: 20, price: 50 })]);
      expect(single.isSip).toBe(true);
      expect(single.cadence).toBeNull(); // one instalment tells us nothing about cadence
    });

    it("returns a safe zeroed result for an empty ledger", () => {
      const sip = detectSip([]);
      expect(sip.isSip).toBe(false);
      expect(sip.cadence).toBeNull();
      expect(sip.count).toBe(0);
      expect(sip.averageAmount).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  describe("Investments — time series", () => {
    it("builds month-end value buckets with non-decreasing invested for buy-only data", () => {
      const holdings = [holding({ id: "h1", symbol: "NIFTY50", asset_class: "index_etf", current_price: 130 })];
      const txnsByHolding = {
        h1: [
          txn({ holding_id: "h1", txn_date: "2026-01-10", kind: "buy", quantity: 10, price: 100 }),
          txn({ holding_id: "h1", txn_date: "2026-03-10", kind: "buy", quantity: 10, price: 110 }),
        ],
      };
      const series = buildValueSeries({
        holdings,
        txnsByHolding,
        priceHistory: { NIFTY50: [{ price_date: "2026-06-30", price: 130 }] },
        from: "2026-01-01",
        to: "2026-06-30",
      });

      expect(series.length).toBe(6); // Jan..Jun month ends
      expect(series[0].date).toBe("2026-01-31");
      expect(series[5].date).toBe("2026-06-30");

      for (let i = 0; i < series.length; i++) {
        expect(Number.isFinite(series[i].invested)).toBe(true);
        expect(Number.isFinite(series[i].value)).toBe(true);
        if (i > 0) {
          expect(series[i].invested >= series[i - 1].invested).toBe(true);
          expect(series[i].date > series[i - 1].date).toBe(true);
        }
      }

      expect(series[0].invested).toBe(1000);
      expect(series[0].value).toBe(1000); // no price yet => valued at cost
      expect(series[2].invested).toBe(2100);
      expect(series[5].invested).toBe(2100);
      expect(series[5].value).toBe(2600); // 20 units × the 30-Jun price of 130

      // downsampling caps the point count and keeps the ends
      const capped = buildValueSeries({
        holdings,
        txnsByHolding,
        priceHistory: {},
        from: "2026-01-01",
        to: "2026-06-30",
        buckets: 3,
      });
      expect(capped.length).toBe(3);
      expect(capped[0].date).toBe("2026-01-31");
      expect(capped[2].date).toBe("2026-06-30");

      // degenerate inputs must not throw or produce NaN
      expect(buildValueSeries({ holdings: [], txnsByHolding: {}, priceHistory: {}, from: "2026-01-01", to: "2026-06-30" }).length).toBe(0);
      expect(buildValueSeries({ holdings, txnsByHolding, priceHistory: {}, from: "2026-06-30", to: "2026-01-01" }).length).toBe(0);
    });

    it("zero-fills monthly contributions across the whole window", () => {
      const txnsByHolding = {
        h1: [
          txn({ holding_id: "h1", txn_date: "2026-01-10", kind: "sip", quantity: 10, price: 100 }),
          txn({ holding_id: "h1", txn_date: "2026-03-10", kind: "buy", quantity: 10, price: 110, fees: 15 }),
          txn({ holding_id: "h1", txn_date: "2026-05-20", kind: "sell", quantity: 5, price: 150, fees: 10 }),
          txn({ holding_id: "h1", txn_date: "2026-05-25", kind: "dividend", amount: 200 }),
        ],
        h2: [txn({ holding_id: "h2", txn_date: "2026-03-15", kind: "contribution", quantity: 5000, price: 1 })],
      };
      const rows = monthlyContributions(txnsByHolding, "2026-01-01", "2026-06-30");

      expect(rows.length).toBe(6);
      expect(rows[0].month).toBe("2026-01");
      expect(rows[5].month).toBe("2026-06");
      for (const r of rows) {
        expect(Number.isFinite(r.invested)).toBe(true);
        expect(Number.isFinite(r.withdrawn)).toBe(true);
        expect(Number.isFinite(r.net)).toBe(true);
        expect(Number.isFinite(r.sipAmount)).toBe(true);
        expect(approx(r.net, r.invested - r.withdrawn, 1e-9)).toBe(true);
      }

      expect(rows[0].invested).toBe(1000);
      expect(rows[0].sipAmount).toBe(1000);
      expect(rows[1].invested).toBe(0);
      expect(rows[2].invested).toBe(6115); // 1115 buy + 5000 contribution
      expect(rows[2].sipAmount).toBe(0);
      expect(rows[4].withdrawn).toBe(740); // dividends are income, not a withdrawal
      expect(rows[4].net).toBe(-740);
      expect(monthlyContributions({}, "2026-01-01", "2026-01-31").length).toBe(1);
      expect(monthlyContributions({}, "2026-06-30", "2026-01-01").length).toBe(0);
    });
  });
}
