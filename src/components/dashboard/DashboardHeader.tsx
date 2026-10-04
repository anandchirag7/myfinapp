import { useState } from "react";
import {
  Calendar,
  Search,
  Plus,
  Upload,
  RefreshCw,
  Bell,
  ChevronDown,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { DashboardFilterState } from "@/hooks/use-revamped-dashboard";

interface DashboardHeaderProps {
  filters: DashboardFilterState;
  onFilterChange: (filters: Partial<DashboardFilterState>) => void;
  accounts: Array<{ id: string; name: string }>;
  userName: string;
  onAddTransaction: () => void;
  onImportStatement: () => void;
  onSyncAccounts: () => Promise<void>;
}

export function DashboardHeader({
  filters,
  onFilterChange,
  accounts,
  userName,
  onAddTransaction,
  onImportStatement,
  onSyncAccounts,
}: DashboardHeaderProps) {
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await onSyncAccounts();
      toast.success("Accounts synchronized successfully");
    } catch {
      toast.error("Failed to sync accounts");
    } finally {
      setSyncing(false);
    }
  };

  const rangeLabels: Record<string, string> = {
    "1m": "Last 30 Days",
    "3m": "Last 3 Months",
    "6m": "Last 6 Months",
    "1y": "Last 12 Months",
    ytd: "Year to Date",
  };

  const selectedAccountName =
    filters.accountId === "all"
      ? "All Accounts"
      : accounts.find((a) => a.id === filters.accountId)?.name || "All Accounts";

  return (
    <div className="flex flex-col gap-4 border-b border-border/40 pb-5 pt-1 lg:flex-row lg:items-center lg:justify-between">
      {/* Title & Tagline */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          Personal Finance Dashboard
        </h1>
        <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
          Track. Plan. Grow. A smarter you, richer tomorrow.
        </p>
      </div>

      {/* Action Controls & Filters */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
        {/* Date Range Selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 rounded-lg border-border/60 bg-card px-2.5 text-xs font-medium text-foreground shadow-sm hover:bg-accent"
            >
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{rangeLabels[filters.range] || "Last 30 Days"}</span>
              <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={() => onFilterChange({ range: "1m" })}>
              Last 30 Days
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onFilterChange({ range: "3m" })}>
              Last 3 Months
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onFilterChange({ range: "6m" })}>
              Last 6 Months
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onFilterChange({ range: "1y" })}>
              Last 12 Months
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onFilterChange({ range: "ytd" })}>
              Year to Date
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Account Selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9 max-w-[150px] gap-1.5 truncate rounded-lg border-border/60 bg-card px-2.5 text-xs font-medium text-foreground shadow-sm hover:bg-accent"
            >
              <span className="truncate">{selectedAccountName}</span>
              <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => onFilterChange({ accountId: "all" })}>
              All Accounts
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {accounts.map((a) => (
              <DropdownMenuItem
                key={a.id}
                onClick={() => onFilterChange({ accountId: a.id })}
                className="truncate"
              >
                {a.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Search Input */}
        <div className="relative min-w-[200px] flex-1 sm:w-64 sm:flex-initial">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.searchQuery}
            onChange={(e) => onFilterChange({ searchQuery: e.target.value })}
            placeholder="Search transactions, accounts, or anything..."
            className="h-9 rounded-lg border-border/60 bg-card pl-8 text-xs placeholder:text-muted-foreground/70"
          />
        </div>

        {/* Primary Action: + Add Transaction */}
        <Button
          onClick={onAddTransaction}
          size="sm"
          className="h-9 gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-medium text-white shadow-sm hover:bg-blue-700"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add Transaction</span>
        </Button>

        {/* Secondary Action: Import Statement */}
        <Button
          onClick={onImportStatement}
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 rounded-lg border-border/60 bg-card px-2.5 text-xs font-medium text-foreground shadow-sm hover:bg-accent"
        >
          <Upload className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="hidden sm:inline">Import Statement</span>
        </Button>

        {/* Sync Accounts Button */}
        <Button
          onClick={handleSync}
          disabled={syncing}
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 rounded-lg border-border/60 bg-card px-2.5 text-xs font-medium text-foreground shadow-sm hover:bg-accent"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 text-muted-foreground ${syncing ? "animate-spin text-blue-600" : ""}`}
          />
          <span className="hidden sm:inline">Sync Accounts</span>
        </Button>

        {/* Notifications Icon with Badge */}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
          </Button>
          <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
          </span>
        </div>

        {/* User Profile Pill */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-lg border border-border/40 bg-card p-1 pr-2.5 shadow-sm transition hover:bg-accent">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-tr from-amber-500 to-indigo-600 font-semibold text-white text-[11px]">
                {userName.charAt(0).toUpperCase()}
              </div>
              <span className="hidden text-xs font-medium text-foreground md:inline">
                {userName}
              </span>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="text-xs">Signed in as {userName}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href="/settings" className="cursor-pointer">Settings</a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
