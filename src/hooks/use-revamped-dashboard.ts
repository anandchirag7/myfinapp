import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getDashboard,
  listAccounts,
  listTransactions,
  getMyContext,
  listGoals,
} from "@/lib/finance.functions";
import { listBills } from "@/lib/bills.functions";
import { getBudgetForMonth } from "@/lib/budgets.functions";
import { getPortfolio } from "@/lib/investments.functions";
import { queryKeys } from "@/lib/query-keys";
import { formatLakhCrore, formatINR } from "@/lib/format";

export interface DashboardFilterState {
  range: "1m" | "3m" | "6m" | "1y" | "ytd";
  accountId: string | "all";
  searchQuery: string;
}

function getCurrentMonthStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function useRevampedDashboard(filters: DashboardFilterState) {
  const qc = useQueryClient();
  const getDashFn = useServerFn(getDashboard);
  const listAccFn = useServerFn(listAccounts);
  const listTxnFn = useServerFn(listTransactions);
  const getContextFn = useServerFn(getMyContext);
  const listBillsFn = useServerFn(listBills);
  const getBudgetFn = useServerFn(getBudgetForMonth);
  const getPortfolioFn = useServerFn(getPortfolio);
  const listGoalsFn = useServerFn(listGoals);

  const currentMonth = getCurrentMonthStr();

  // 1. Dashboard summary data from backend
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: queryKeys.dashboard.data(filters.range),
    queryFn: () => getDashFn({ data: { range: filters.range } }),
    staleTime: 60 * 1000,
  });

  // 2. Real Accounts
  const { data: rawAccounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => listAccFn(),
    staleTime: 60 * 1000,
  });

  // 3. Real Transactions
  const { data: rawTransactions = [] } = useQuery({
    queryKey: ["transactions", "recent"],
    queryFn: () => listTxnFn({ data: { limit: 100 } }),
    staleTime: 30 * 1000,
  });

  // 4. Real Bills
  const { data: rawBills = [] } = useQuery({
    queryKey: ["bills"],
    queryFn: () => listBillsFn(),
    staleTime: 60 * 1000,
  });

  // 5. Real Budget
  const { data: budgetData } = useQuery({
    queryKey: ["budget", currentMonth],
    queryFn: () => getBudgetFn({ data: { month: currentMonth } }),
    staleTime: 60 * 1000,
  });

  // 6. Real Portfolio
  const { data: portfolioData } = useQuery({
    queryKey: ["portfolio", "1y"],
    queryFn: () => getPortfolioFn({ data: { range: "1y" } }),
    staleTime: 60 * 1000,
  });

  // 7. Real Goals
  const { data: rawGoals = [] } = useQuery({
    queryKey: ["goals"],
    queryFn: () => listGoalsFn(),
    staleTime: 60 * 1000,
  });

  // 8. User Context / Profile
  const { data: userContext } = useQuery({
    queryKey: ["user-context"],
    queryFn: () => getContextFn(),
    staleTime: 300 * 1000,
  });

  const userName = useMemo(() => {
    const p = (userContext as any)?.profile;
    if (p?.full_name?.trim()) return p.full_name;
    if (p?.display_name?.trim()) return p.display_name;
    return "Your Portfolio";
  }, [userContext]);

  // Real Accounts Snapshot
  const accountsSnapshot = useMemo(() => {
    const accs = Array.isArray(rawAccounts) ? (rawAccounts as any[]) : [];
    return accs.map((a) => ({
      id: a.id,
      name: a.name,
      category: a.category,
      balance: Number(a.current_balance ?? 0),
      isLiability: Boolean(a.is_liability),
      institution: a.institution || "Bank",
    }));
  }, [rawAccounts]);

  // Real KPI Metrics derived strictly from backend calculations
  const kpiData = useMemo(() => {
    const d = metrics as any;
    const netWorth = Number(d?.netWorth ?? 0);
    const income = Number(d?.income ?? 0);
    const expense = Number(d?.expense ?? 0);
    const savings = income - expense;
    const savingsRate = income > 0 ? Math.round((savings / income) * 100) : 0;
    const liabilities = Number(d?.liabilities ?? 0);

    // Compute Net Worth delta from netWorthTrend if snapshots exist
    const nwTrend = Array.isArray(d?.netWorthTrend) ? d.netWorthTrend : [];
    let nwDeltaStr = "+0.0%";
    let nwDeltaPositive = true;
    let nwComparisonStr = "Current snapshot";
    if (nwTrend.length >= 2) {
      const prevNw = Number(nwTrend[nwTrend.length - 2]?.netWorth ?? 0);
      const diff = netWorth - prevNw;
      const pct = prevNw !== 0 ? (diff / Math.abs(prevNw)) * 100 : 0;
      nwDeltaStr = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
      nwDeltaPositive = diff >= 0;
      nwComparisonStr = `${diff >= 0 ? "+" : "-"} ${formatLakhCrore(Math.abs(diff))} from prev snapshot`;
    }

    // Range-aware duration and labeling
    const range = filters.range;
    let rangeMonths = 1;
    let incomeLabel = "Monthly Income";
    let expenseLabel = "Monthly Expenses";

    if (range === "3m") {
      rangeMonths = 3;
      incomeLabel = "Total Income (3M)";
      expenseLabel = "Total Expenses (3M)";
    } else if (range === "6m") {
      rangeMonths = 6;
      incomeLabel = "Total Income (6M)";
      expenseLabel = "Total Expenses (6M)";
    } else if (range === "1y") {
      rangeMonths = 12;
      incomeLabel = "Annual Income (12M)";
      expenseLabel = "Annual Expenses (12M)";
    } else if (range === "ytd") {
      rangeMonths = Math.max(1, new Date().getMonth() + 1);
      incomeLabel = "YTD Income";
      expenseLabel = "YTD Expenses";
    }

    // Compute Income delta & comparison
    const cf = Array.isArray(d?.cashFlow) ? d.cashFlow : [];
    let incDeltaStr = "+0.0%";
    let incDeltaPositive = true;
    let incCompStr = rangeMonths > 1 ? `Avg. ${formatLakhCrore(income / rangeMonths)}/mo` : "Current month";
    let expDeltaStr = "+0.0%";
    let expCompStr = rangeMonths > 1 ? `Avg. ${formatLakhCrore(expense / rangeMonths)}/mo` : "Current month";
    let srCompStr = rangeMonths > 1 ? `Across ${rangeMonths} months` : "vs. previous month";

    if (range === "1m" && cf.length >= 2) {
      const prevMonth = cf[cf.length - 2];
      const prevInc = Number(prevMonth?.income ?? 0);
      const prevExp = Number(prevMonth?.expense ?? 0);

      if (prevInc > 0) {
        const incDiff = income - prevInc;
        const incPct = (incDiff / prevInc) * 100;
        incDeltaStr = `${incPct >= 0 ? "+" : ""}${incPct.toFixed(1)}%`;
        incDeltaPositive = incDiff >= 0;
        incCompStr = `vs. ${formatLakhCrore(prevInc)} last month`;
      }

      if (prevExp > 0) {
        const expDiff = expense - prevExp;
        const expPct = (expDiff / prevExp) * 100;
        expDeltaStr = `${expPct >= 0 ? "+" : ""}${expPct.toFixed(1)}%`;
        expCompStr = `vs. ${formatLakhCrore(prevExp)} last month`;
      }

      const prevSavingsRate = prevInc > 0 ? Math.round(((prevInc - prevExp) / prevInc) * 100) : 0;
      srCompStr = `vs. ${prevSavingsRate}% last month`;
    } else if (rangeMonths > 1 && cf.length > 0) {
      // For multi-month ranges, show monthly average run rate delta
      const monthlyAvgInc = income / rangeMonths;
      const latestMonth = cf[cf.length - 1];
      const latestInc = Number(latestMonth?.income ?? 0);
      if (monthlyAvgInc > 0 && latestInc > 0) {
        const diff = latestInc - monthlyAvgInc;
        const pct = (diff / monthlyAvgInc) * 100;
        incDeltaStr = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
        incDeltaPositive = diff >= 0;
      }
      const monthlyAvgExp = expense / rangeMonths;
      const latestExp = Number(latestMonth?.expense ?? 0);
      if (monthlyAvgExp > 0 && latestExp > 0) {
        const diff = latestExp - monthlyAvgExp;
        const pct = (diff / monthlyAvgExp) * 100;
        expDeltaStr = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
      }
    }

    // Real Investments Value from Portfolio or from Investment Accounts
    const invAccounts = (rawAccounts as any[]).filter((a) =>
      [
        "mutual_fund",
        "stocks",
        "etf",
        "fixed_deposit",
        "recurring_deposit",
        "ppf",
        "epf",
        "nps",
        "gold",
      ].includes(a.category)
    );
    const sumInvAccounts = invAccounts.reduce(
      (sum, a) => sum + Number(a.current_balance ?? 0),
      0
    );
    const realPortfolioValue =
      portfolioData?.totals?.currentValue && portfolioData.totals.currentValue > 0
        ? portfolioData.totals.currentValue
        : sumInvAccounts;

    const portGainPct = portfolioData?.totals?.absoluteReturnPct ?? 0;
    const portGainAmt = portfolioData?.totals?.totalGainLoss ?? 0;

    return {
      netWorth: {
        value: netWorth,
        delta: nwDeltaStr,
        deltaIsPositive: nwDeltaPositive,
        comparison: nwComparisonStr,
      },
      monthlyIncome: {
        label: incomeLabel,
        value: income,
        delta: incDeltaStr,
        deltaIsPositive: incDeltaPositive,
        comparison: incCompStr,
      },
      monthlyExpenses: {
        label: expenseLabel,
        value: expense,
        delta: expDeltaStr,
        deltaIsPositive: false,
        comparison: expCompStr,
      },
      savingsRate: {
        value: savingsRate,
        delta: `${savingsRate}%`,
        deltaIsPositive: savingsRate >= 0,
        comparison: srCompStr,
      },
      investments: {
        value: realPortfolioValue,
        delta: `${portGainPct >= 0 ? "+" : ""}${portGainPct.toFixed(1)}%`,
        deltaIsPositive: portGainPct >= 0,
        comparison: portGainAmt !== 0 ? `${portGainAmt >= 0 ? "+" : "-"} ${formatLakhCrore(Math.abs(portGainAmt))}` : "Holdings value",
      },
      liabilities: {
        value: liabilities,
        delta: "-0.0%",
        deltaIsPositive: true,
        comparison: `${(rawAccounts as any[]).filter((a) => a.is_liability).length} liability accounts`,
      },
    };
  }, [metrics, rawAccounts, portfolioData, filters.range]);

  // Real Cash Flow Trend from backend getDashboard
  const cashFlowTrend = useMemo(() => {
    const d = metrics as any;
    const cf = Array.isArray(d?.cashFlow) ? d.cashFlow : [];
    return cf.map((item: any) => ({
      month: item.label,
      income: Number(item.income ?? 0),
      expenses: Number(item.expense ?? 0),
    }));
  }, [metrics]);

  // Real Spending by Category from backend spendByCat
  const spendingByCategory = useMemo(() => {
    const d = metrics as any;
    const spendMap = (d?.spendByCat ?? {}) as Record<string, number>;
    const entries = Object.entries(spendMap)
      .map(([name, amount]) => ({
        name,
        amount: Number(amount),
      }))
      .filter((e) => e.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    const totalSpent = Number(d?.expense ?? entries.reduce((acc, c) => acc + c.amount, 0));
    const palette = [
      "#3b82f6",
      "#10b981",
      "#f59e0b",
      "#8b5cf6",
      "#ec4899",
      "#06b6d4",
      "#f97316",
      "#64748b",
      "#6366f1",
      "#14b8a6",
      "#e11d48",
      "#84cc16",
    ];

    return {
      totalSpent,
      categories: entries.slice(0, 8).map((c, i) => ({
        name: c.name,
        amount: c.amount,
        percentage: totalSpent > 0 ? Math.round((c.amount / totalSpent) * 100) : 0,
        color: palette[i % palette.length],
      })),
    };
  }, [metrics]);

  // Real Smart Insights generated directly from actual backend numbers
  const smartInsights = useMemo(() => {
    const d = metrics as any;
    const insights: Array<{
      id: string;
      title: string;
      description: string;
      type: string;
      iconType: string;
      severity: string;
    }> = [];

    // 1. Savings rate insight
    const inc = Number(d?.income ?? 0);
    const exp = Number(d?.expense ?? 0);
    if (inc > 0) {
      const sr = Math.round(((inc - exp) / inc) * 100);
      if (sr > 20) {
        insights.push({
          id: "sr-good",
          title: "Great progress on savings!",
          description: `You are saving ${sr}% of your income (${formatINR(inc - exp)}) this period.`,
          type: "success",
          iconType: "trophy",
          severity: "success",
        });
      } else if (sr < 0) {
        insights.push({
          id: "sr-deficit",
          title: "Expenses exceed income",
          description: `Outflow is ${formatINR(Math.abs(inc - exp))} higher than inflow. Review discretionary expenses.`,
          type: "alert",
          iconType: "alert",
          severity: "high",
        });
      }
    }

    // 2. Highest expense category insight
    const spendEntries = Object.entries((d?.spendByCat ?? {}) as Record<string, number>).sort(
      (a, b) => b[1] - a[1]
    );
    if (spendEntries.length > 0) {
      const [topName, topAmt] = spendEntries[0];
      const pct = exp > 0 ? Math.round((topAmt / exp) * 100) : 0;
      insights.push({
        id: "top-spend",
        title: `Highest expense: ${topName}`,
        description: `₹${topAmt.toLocaleString("en-IN")} (${pct}% of total period spending) went to ${topName}.`,
        type: "warning",
        iconType: "alert",
        severity: "medium",
      });
    }

    // 3. Upcoming bills insight
    const rawB = Array.isArray(rawBills) ? (rawBills as any[]) : [];
    const soonBills = rawB
      .filter((b) => {
        const days = Math.floor((new Date(b.due_date).getTime() - Date.now()) / 86400000);
        return days >= 0 && days <= 7;
      })
      .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

    if (soonBills.length > 0) {
      const nextBill = soonBills[0];
      const days = Math.max(0, Math.floor((new Date(nextBill.due_date).getTime() - Date.now()) / 86400000));
      insights.push({
        id: "bill-due",
        title: `${nextBill.name} due soon`,
        description: `₹${Number(nextBill.amount).toLocaleString("en-IN")} is due ${days === 0 ? "today" : `in ${days} days`}.`,
        type: "calendar",
        iconType: "home",
        severity: "info",
      });
    }

    // 4. Accounts coverage / Cash health
    const cashAccounts = (rawAccounts as any[]).filter((a) =>
      ["bank", "cash"].includes(a.category)
    );
    const totalCash = cashAccounts.reduce((s, a) => s + Number(a.current_balance ?? 0), 0);
    if (exp > 0) {
      const months = (totalCash / exp).toFixed(1);
      insights.push({
        id: "cash-coverage",
        title: "Cash reserves coverage",
        description: `Liquid bank balances (${formatINR(totalCash)}) provide ${months} months of expense buffer.`,
        type: "subscription",
        iconType: "star",
        severity: "neutral",
      });
    }

    if (insights.length === 0) {
      insights.push({
        id: "start",
        title: "Welcome to Paisa",
        description: "Add transactions and accounts to unlock automated personal finance insights.",
        type: "success",
        iconType: "trophy",
        severity: "success",
      });
    }

    return insights;
  }, [metrics, rawBills, rawAccounts]);

  // Real Budget vs Actual from getBudgetForMonth
  const budgetVsActual = useMemo(() => {
    const cats = Array.isArray(budgetData?.categories) ? budgetData.categories : [];
    const active = cats.filter((c: any) => c.budget > 0 || c.spent > 0);

    if (active.length > 0) {
      return active.slice(0, 8).map((c: any) => ({
        category: c.name,
        budget: Number(c.budget ?? 0),
        actual: Number(c.spent ?? 0),
        percentage:
          c.budget > 0
            ? Math.round((Number(c.spent ?? 0) / Number(c.budget)) * 100)
            : c.spent > 0
            ? 100
            : 0,
        icon: c.icon || "Tag",
        color: c.color || "#10b981",
      }));
    }

    // If user has recorded transactions but no budget targets set yet, show actual spend with 0 budget
    const d = metrics as any;
    const spendMap = (d?.spendByCat ?? {}) as Record<string, number>;
    const spendEntries = Object.entries(spendMap)
      .filter(([_, amt]) => amt > 0)
      .sort((a, b) => b[1] - a[1]);

    return spendEntries.slice(0, 7).map(([name, amt]) => ({
      category: name,
      budget: 0,
      actual: Number(amt),
      percentage: 100,
      icon: "Tag",
      color: "#10b981",
    }));
  }, [budgetData, metrics]);

  // Real Assets vs Liabilities derived strictly from real account balances
  const assetsVsLiabilities = useMemo(() => {
    const accs = Array.isArray(rawAccounts) ? (rawAccounts as any[]) : [];
    let cash = 0;
    let inv = 0;
    let prop = 0;
    let otherAssets = 0;
    let homeLoan = 0;
    let carLoan = 0;
    let ccDebt = 0;
    let otherDebt = 0;

    for (const a of accs) {
      const bal = Number(a.current_balance ?? 0);
      if (a.is_liability) {
        const absBal = Math.abs(bal);
        const name = (a.name || "").toLowerCase();
        if (a.category === "credit_card") {
          ccDebt += absBal;
        } else if (name.includes("home")) {
          homeLoan += absBal;
        } else if (name.includes("car") || name.includes("auto")) {
          carLoan += absBal;
        } else {
          otherDebt += absBal;
        }
      } else {
        if (["bank", "cash"].includes(a.category)) cash += bal;
        else if (["mutual_fund", "stocks", "etf"].includes(a.category)) inv += bal;
        else if (["real_estate", "gold"].includes(a.category)) prop += bal;
        else otherAssets += bal;
      }
    }

    const totalAssets = cash + inv + prop + otherAssets;
    const totalLiabilities = homeLoan + carLoan + ccDebt + otherDebt;

    const assetsBreakdown = [
      { name: "Savings & Cash", value: cash, color: "#3b82f6" },
      { name: "Investments", value: inv, color: "#06b6d4" },
      { name: "Property & Gold", value: prop, color: "#10b981" },
      { name: "Other Assets", value: otherAssets, color: "#8b5cf6" },
    ].filter((item) => item.value > 0);

    const liabilitiesBreakdown = [
      { name: "Home Loan", value: homeLoan, color: "#f43f5e" },
      { name: "Car Loan", value: carLoan, color: "#f97316" },
      { name: "Credit Card", value: ccDebt, color: "#fb7185" },
      { name: "Other Debt", value: otherDebt, color: "#e11d48" },
    ].filter((item) => item.value > 0);

    return {
      totalAssets,
      totalLiabilities,
      assetsBreakdown: assetsBreakdown.length > 0 ? assetsBreakdown : [{ name: "Assets", value: totalAssets, color: "#3b82f6" }],
      liabilitiesBreakdown: liabilitiesBreakdown.length > 0 ? liabilitiesBreakdown : [{ name: "Liabilities", value: totalLiabilities, color: "#f43f5e" }],
    };
  }, [rawAccounts]);

  // Real Goals from backend goals table
  const goals = useMemo(() => {
    const raw = Array.isArray(rawGoals) ? (rawGoals as any[]) : [];
    return raw.map((g) => {
      const saved = Number(g.current_amount ?? g.saved_amount ?? 0);
      const target = Number(g.target_amount ?? 0);
      const percentage = target > 0 ? Math.round((saved / target) * 100) : 0;
      return {
        id: g.id,
        name: g.name,
        saved,
        target,
        percentage,
        icon: "Target",
        color: "#3b82f6",
      };
    });
  }, [rawGoals]);

  // Real Investments Overview
  const investmentsOverview = useMemo(() => {
    const invAccounts = (rawAccounts as any[]).filter((a) =>
      [
        "mutual_fund",
        "stocks",
        "etf",
        "fixed_deposit",
        "recurring_deposit",
        "ppf",
        "epf",
        "nps",
        "gold",
      ].includes(a.category)
    );
    const sumInv = invAccounts.reduce((s, a) => s + Number(a.current_balance ?? 0), 0);
    const totalValue =
      portfolioData?.totals?.currentValue && portfolioData.totals.currentValue > 0
        ? portfolioData.totals.currentValue
        : sumInv;

    const absRetPct = portfolioData?.totals?.absoluteReturnPct ?? 0;
    const gainLoss = portfolioData?.totals?.totalGainLoss ?? 0;
    const dayGainPct = portfolioData?.totals?.dayGainLossPct ?? 0;
    const dayGainAmt = portfolioData?.totals?.dayGainLoss ?? 0;

    // Real asset class allocation
    const alloc = portfolioData?.allocationByAssetClass;
    let allocationList: Array<{ name: string; percentage: number; color: string }> = [];

    if (Array.isArray(alloc) && alloc.length > 0) {
      const palette = ["#3b82f6", "#06b6d4", "#6366f1", "#8b5cf6", "#64748b", "#f59e0b", "#ec4899"];
      allocationList = alloc.map((item: any, i: number) => ({
        name: item.assetClass,
        percentage: Math.round(Number(item.pct ?? 0) * 100),
        color: palette[i % palette.length],
      }));
    } else if (invAccounts.length > 0) {
      const palette = ["#3b82f6", "#06b6d4", "#6366f1", "#8b5cf6", "#f59e0b"];
      allocationList = invAccounts.map((a: any, i: number) => ({
        name: a.name,
        percentage: totalValue > 0 ? Math.round((Number(a.current_balance ?? 0) / totalValue) * 100) : 0,
        color: palette[i % palette.length],
      }));
    }

    return {
      totalValue,
      totalReturnPercentage: `${absRetPct >= 0 ? "+" : ""}${absRetPct.toFixed(1)}%`,
      totalReturnAmount: `${gainLoss >= 0 ? "+" : "-"} ₹${Math.abs(gainLoss).toLocaleString("en-IN")}`,
      dayChangePercentage: `${dayGainPct >= 0 ? "+" : ""}${dayGainPct.toFixed(1)}%`,
      dayChangeAmount: `${dayGainAmt >= 0 ? "+" : "-"} ₹${Math.abs(dayGainAmt).toLocaleString("en-IN")}`,
      allocation: allocationList,
    };
  }, [rawAccounts, portfolioData]);

  // Real Upcoming Bills from bills table
  const upcomingBills = useMemo(() => {
    const raw = Array.isArray(rawBills) ? (rawBills as any[]) : [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return raw
      .filter((b) => b.status !== "paid")
      .map((b) => {
        const due = new Date(b.due_date);
        const daysUntil = Math.round((due.getTime() - today.getTime()) / 86400000);
        let statusColor = "text-blue-600 bg-blue-50";
        if (daysUntil < 0) statusColor = "text-rose-600 bg-rose-50";
        else if (daysUntil <= 3) statusColor = "text-rose-600 bg-rose-50";
        else if (daysUntil <= 7) statusColor = "text-amber-600 bg-amber-50";

        return {
          id: b.id,
          name: b.name,
          dueDate: due.toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" }),
          amount: Number(b.amount ?? 0),
          autoPay: Boolean(b.auto_pay),
          statusText: daysUntil < 0 ? `${Math.abs(daysUntil)}d overdue` : daysUntil === 0 ? "Today" : `In ${daysUntil} days`,
          statusColor,
        };
      })
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 6);
  }, [rawBills]);

  // Real Subscriptions from bills where is_recurring === true
  const subscriptions = useMemo(() => {
    const raw = Array.isArray(rawBills) ? (rawBills as any[]) : [];
    const recBills = raw.filter(
      (b) => b.is_recurring || (b.category?.name ?? "").toLowerCase().includes("subscription")
    );

    const palette = ["#E50914", "#1DB954", "#00A8E1", "#FF0000", "#0078D4", "#8b5cf6"];
    const items = recBills.map((b, i) => ({
      id: b.id,
      name: b.name,
      amount: Number(b.amount ?? 0),
      cycle: b.frequency ? b.frequency.charAt(0).toUpperCase() + b.frequency.slice(1) : "Monthly",
      brandColor: palette[i % palette.length],
    }));

    const monthlyTotal = items.reduce((s, item) => s + item.amount, 0);
    return {
      monthlyTotal,
      items,
    };
  }, [rawBills]);

  // Real Recent Transactions from database
  const recentTransactions = useMemo(() => {
    const raw = Array.isArray(rawTransactions) ? (rawTransactions as any[]) : [];
    return raw.slice(0, 10).map((t) => {
      const isCredit = t.type === "income";
      const amt = Number(t.amount);
      return {
        id: t.id,
        date: new Date(t.txn_date).toLocaleDateString("en-IN", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        payee: t.payee?.name || t.merchant || t.note || (t as any).category?.name || "Transaction",
        category: (t as any).category?.name || (isCredit ? "Income" : "General"),
        account: (t as any).account?.name || "Primary Account",
        type: isCredit ? "Credit" : "Debit",
        amount: isCredit ? amt : -amt,
        status: t.cleared_status || "Cleared",
        notes: t.note || "—",
      };
    });
  }, [rawTransactions]);

  // Real Financial Health Indicators derived strictly from actual numbers
  const financialHealth = useMemo(() => {
    const accs = Array.isArray(rawAccounts) ? (rawAccounts as any[]) : [];
    const ccAccounts = accs.filter((a) => a.category === "credit_card");
    const ccDebt = ccAccounts.reduce((sum, a) => sum + Math.abs(Number(a.current_balance ?? 0)), 0);

    // Sum credit limits if specified in details, else fallback to 2.5x debt
    let totalLimit = 0;
    for (const cc of ccAccounts) {
      const lim = Number(cc.details?.credit_limit ?? cc.details?.limit ?? 0);
      totalLimit += lim;
    }
    if (totalLimit === 0 && ccDebt > 0) totalLimit = ccDebt * 2;
    const ccUtilPct = totalLimit > 0 ? Math.round((ccDebt / totalLimit) * 100) : 0;

    // Emergency Fund: liquid cash / monthly expense
    const d = metrics as any;
    const monthlyExp = Number(d?.expense ?? 0);
    const bankCash = accs
      .filter((a) => ["bank", "cash"].includes(a.category) && !a.is_liability)
      .reduce((sum, a) => sum + Number(a.current_balance ?? 0), 0);

    const coverageMonths = monthlyExp > 0 ? Number((bankCash / monthlyExp).toFixed(1)) : 0;
    let efStatus = "Building";
    if (coverageMonths >= 6) efStatus = "On track";
    else if (coverageMonths >= 3) efStatus = "Adequate";
    else efStatus = "Needs attention";

    // Dynamic Financial Health Score (0-100) calculated from user's real parameters
    let score = 50; // baseline
    const income = Number(d?.income ?? 0);
    if (income > 0) {
      const sr = (income - monthlyExp) / income;
      if (sr >= 0.2) score += 20;
      else if (sr > 0) score += 10;
      else score -= 15;
    }
    if (coverageMonths >= 6) score += 20;
    else if (coverageMonths >= 3) score += 10;

    if (ccUtilPct <= 30 && ccDebt === 0) score += 10;
    else if (ccUtilPct > 60) score -= 10;

    score = Math.min(Math.max(score, 10), 100);

    let healthStatus = "You're on track for a secure financial future!";
    if (score < 50) healthStatus = "Focus on building your emergency buffer and lowering debt.";
    else if (score < 75) healthStatus = "Good financial discipline! Keep growing your savings buffer.";

    return {
      creditCardUtilization: {
        used: ccDebt,
        limit: totalLimit,
        percentage: ccUtilPct,
      },
      emergencyFund: {
        coverageMonths,
        status: efStatus,
      },
      healthScore: {
        score,
        max: 100,
        status: healthStatus,
      },
    };
  }, [rawAccounts, metrics]);

  const syncAccounts = async () => {
    await qc.invalidateQueries();
  };

  return {
    userName,
    isLoading: metricsLoading,
    kpiData,
    cashFlowTrend,
    spendingByCategory,
    smartInsights,
    budgetVsActual,
    assetsVsLiabilities,
    goals,
    investmentsOverview,
    upcomingBills,
    subscriptions,
    recentTransactions,
    accountsSnapshot,
    financialHealth,
    syncAccounts,
  };
}
