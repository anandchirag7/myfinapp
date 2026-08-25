/**
 * Centralized React Query Keys Factory
 * Provides type-safe and tenant/household-scoped query keys with consistent invalidation patterns.
 */

export const queryKeys = {
  categories: {
    all: ["categories"] as const,
    full: () => [...queryKeys.categories.all, "full"] as const,
    list: () => [...queryKeys.categories.all, "list"] as const,
    detail: (id: string) => [...queryKeys.categories.all, "detail", id] as const,
  },
  accounts: {
    all: ["accounts"] as const,
    list: () => [...queryKeys.accounts.all, "list"] as const,
    detail: (id: string) => [...queryKeys.accounts.all, "detail", id] as const,
  },
  transactions: {
    all: ["transactions"] as const,
    rich: (filters?: Record<string, unknown>) =>
      [...queryKeys.transactions.all, "rich", filters ?? {}] as const,
    detail: (id: string) => [...queryKeys.transactions.all, "detail", id] as const,
    views: () => [...queryKeys.transactions.all, "views"] as const,
  },
  dashboard: {
    all: ["dashboard"] as const,
    data: (range?: string) => [...queryKeys.dashboard.all, range ?? "default"] as const,
  },
  budgets: {
    all: ["budgets"] as const,
    month: (month: string) => [...queryKeys.budgets.all, month] as const,
  },
  bills: {
    all: ["bills"] as const,
    list: () => [...queryKeys.bills.all, "list"] as const,
  },
  reports: {
    all: ["reports"] as const,
    data: (from: string, to: string, owner?: string) =>
      [...queryKeys.reports.all, { from, to, owner }] as const,
  },
  investments: {
    all: ["investments"] as const,
    portfolio: (range?: string) =>
      [...queryKeys.investments.all, "portfolio", range ?? "all"] as const,
    holding: (id: string) => [...queryKeys.investments.all, "holding", id] as const,
    prices: () => [...queryKeys.investments.all, "prices"] as const,
  },
};
