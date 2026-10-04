import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useRevampedDashboard, DashboardFilterState } from "@/hooks/use-revamped-dashboard";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { KpiMetricsRow } from "@/components/dashboard/KpiMetricsRow";
import { CashFlowTrendCard } from "@/components/dashboard/CashFlowTrendCard";
import { SpendingCategoryCard } from "@/components/dashboard/SpendingCategoryCard";
import { SmartInsightsCard } from "@/components/dashboard/SmartInsightsCard";
import { BudgetVsActualCard } from "@/components/dashboard/BudgetVsActualCard";
import { AssetsLiabilitiesCard } from "@/components/dashboard/AssetsLiabilitiesCard";
import { GoalTrackerCard } from "@/components/dashboard/GoalTrackerCard";
import { InvestmentsOverviewCard } from "@/components/dashboard/InvestmentsOverviewCard";
import { UpcomingBillsCard } from "@/components/dashboard/UpcomingBillsCard";
import { SubscriptionsCard } from "@/components/dashboard/SubscriptionsCard";
import { RecentTransactionsTable } from "@/components/dashboard/RecentTransactionsTable";
import { AccountsSnapshotCard } from "@/components/dashboard/AccountsSnapshotCard";
import { HealthIndicatorsCard } from "@/components/dashboard/HealthIndicatorsCard";
import { FastEntryDialog } from "@/components/fast-entry-dialog";
import { StatementImportDialog } from "@/components/statement-import-dialog";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Dashboard — Paisa Finance" }] }),
  component: Dashboard,
});

function Dashboard() {
  const [filters, setFilters] = useState<DashboardFilterState>({
    range: "1m",
    accountId: "all",
    searchQuery: "",
  });

  const [addTxnOpen, setAddTxnOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const {
    userName,
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
  } = useRevampedDashboard(filters);

  const handleFilterChange = (next: Partial<DashboardFilterState>) => {
    setFilters((prev) => ({ ...prev, ...next }));
  };

  return (
    <div className="min-h-screen bg-slate-50/60 p-4 sm:p-6 lg:p-7 space-y-4 sm:space-y-5 dark:bg-background">
      {/* 1. Dashboard Header */}
      <DashboardHeader
        filters={filters}
        onFilterChange={handleFilterChange}
        accounts={accountsSnapshot}
        userName={userName}
        onAddTransaction={() => setAddTxnOpen(true)}
        onImportStatement={() => setImportOpen(true)}
        onSyncAccounts={syncAccounts}
      />

      {/* 2. Row 1: 6 KPI Metric Cards */}
      <KpiMetricsRow data={kpiData} />

      {/* 3. Row 2: Analytics & AI Insights (3 Columns) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <CashFlowTrendCard data={cashFlowTrend} />
        <SpendingCategoryCard data={spendingByCategory} />
        <SmartInsightsCard insights={smartInsights} />
      </div>

      {/* 4. Row 3: Budgets, Assets/Liabilities, Goals (3 Columns) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <BudgetVsActualCard data={budgetVsActual} />
        <AssetsLiabilitiesCard data={assetsVsLiabilities} />
        <GoalTrackerCard goals={goals} />
      </div>

      {/* 5. Row 4: Investments, Upcoming Bills, Subscriptions (3 Columns) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <InvestmentsOverviewCard data={investmentsOverview} />
        <UpcomingBillsCard bills={upcomingBills} />
        <SubscriptionsCard data={subscriptions} />
      </div>

      {/* 6. Row 5: Recent Transactions & Account Snapshot / Health (Split Grid) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <RecentTransactionsTable transactions={recentTransactions} />
        </div>
        <div className="space-y-4 lg:col-span-4">
          <AccountsSnapshotCard accounts={accountsSnapshot} />
          <HealthIndicatorsCard data={financialHealth} />
        </div>
      </div>

      {/* Controlled Dialogs triggered from header */}
      <FastEntryDialog
        open={addTxnOpen}
        onOpenChange={setAddTxnOpen}
        hideTrigger
      />
      <StatementImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        trigger={null}
      />
    </div>
  );
}
