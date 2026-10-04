import { useState, useMemo } from "react";
import { ListFilter, Search, ChevronDown, CheckCircle2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatINR } from "@/lib/format";

interface TransactionItem {
  id: string;
  date: string;
  payee: string;
  category: string;
  account: string;
  type: string;
  amount: number;
  status: string;
  notes: string;
}

interface RecentTransactionsTableProps {
  transactions: TransactionItem[];
}

export function RecentTransactionsTable({ transactions }: RecentTransactionsTableProps) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedType, setSelectedType] = useState("all");

  const categories = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((t) => set.add(t.category));
    return Array.from(set);
  }, [transactions]);

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      const matchSearch =
        !search ||
        t.payee.toLowerCase().includes(search.toLowerCase()) ||
        t.notes.toLowerCase().includes(search.toLowerCase()) ||
        t.account.toLowerCase().includes(search.toLowerCase());
      const matchCategory =
        selectedCategory === "all" || t.category === selectedCategory;
      const matchType =
        selectedType === "all" ||
        t.type.toLowerCase() === selectedType.toLowerCase();
      return matchSearch && matchCategory && matchType;
    });
  }, [transactions, search, selectedCategory, selectedType]);

  const getCategoryBadgeClass = (category: string) => {
    switch (category.toLowerCase()) {
      case "income":
        return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400";
      case "housing":
        return "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-400";
      case "groceries":
        return "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/50 dark:text-cyan-400";
      case "transport":
        return "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/50 dark:text-orange-400";
      case "investments":
        return "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-400";
      default:
        return "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300";
    }
  };

  return (
    <Card className="flex flex-col rounded-xl border border-border/50 bg-card shadow-sm">
      <CardHeader className="flex flex-col gap-3 pb-2 pt-4 px-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
            <ListFilter className="h-4 w-4" />
          </div>
          <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
            Recent Transactions
          </CardTitle>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative w-44 sm:w-52">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search transactions..."
              className="h-7 rounded-md pl-7 text-[11px]"
            />
          </div>

          {/* Category Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex h-7 items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2 text-[11px] font-medium text-foreground hover:bg-muted">
                <span>{selectedCategory === "all" ? "All Categories" : selectedCategory}</span>
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40 text-xs">
              <DropdownMenuItem onClick={() => setSelectedCategory("all")}>
                All Categories
              </DropdownMenuItem>
              {categories.map((c) => (
                <DropdownMenuItem key={c} onClick={() => setSelectedCategory(c)}>
                  {c}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Type Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex h-7 items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2 text-[11px] font-medium text-foreground hover:bg-muted">
                <span>{selectedType === "all" ? "All Types" : selectedType}</span>
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-32 text-xs">
              <DropdownMenuItem onClick={() => setSelectedType("all")}>
                All Types
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedType("Credit")}>
                Credit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedType("Debit")}>
                Debit
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-x-auto pb-4 pt-1 px-4">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-border/40 text-[10px] font-medium text-muted-foreground">
              <th className="py-2 pr-2">Date</th>
              <th className="py-2 px-2">Payee</th>
              <th className="py-2 px-2">Category</th>
              <th className="py-2 px-2">Account</th>
              <th className="py-2 px-2">Type</th>
              <th className="py-2 px-2 text-right">Amount</th>
              <th className="py-2 px-2 text-center">Status</th>
              <th className="py-2 pl-2">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-xs text-muted-foreground">
                  No transactions found for this filter.
                </td>
              </tr>
            ) : (
              filtered.map((txn) => {
                const isCredit = txn.type.toLowerCase() === "credit" || txn.amount > 0;
                const formattedAmt = `${isCredit ? "+" : "-"} ₹${Math.abs(txn.amount).toLocaleString(
                  "en-IN"
                )}`;
                return (
                  <tr key={txn.id} className="hover:bg-muted/20 text-[11px]">
                    {/* Date */}
                    <td className="py-2.5 pr-2 text-muted-foreground whitespace-nowrap">
                      {txn.date}
                    </td>

                  {/* Payee */}
                  <td className="py-2.5 px-2 font-medium text-foreground whitespace-nowrap">
                    {txn.payee}
                  </td>

                  {/* Category */}
                  <td className="py-2.5 px-2 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${getCategoryBadgeClass(
                        txn.category
                      )}`}
                    >
                      {txn.category}
                    </span>
                  </td>

                  {/* Account */}
                  <td className="py-2.5 px-2 text-muted-foreground whitespace-nowrap">
                    {txn.account}
                  </td>

                  {/* Type */}
                  <td className="py-2.5 px-2 whitespace-nowrap">
                    <span
                      className={`font-medium ${
                        isCredit
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {txn.type}
                    </span>
                  </td>

                  {/* Amount */}
                  <td
                    className={`py-2.5 px-2 text-right font-semibold tabular-nums whitespace-nowrap ${
                      isCredit
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {formattedAmt}
                  </td>

                  {/* Status */}
                  <td className="py-2.5 px-2 text-center whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {txn.status}
                    </span>
                  </td>

                  {/* Notes */}
                  <td className="py-2.5 pl-2 text-muted-foreground whitespace-nowrap max-w-[150px] truncate">
                    {txn.notes}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
