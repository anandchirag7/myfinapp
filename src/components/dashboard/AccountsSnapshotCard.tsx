import { Landmark, Wallet, CreditCard, LineChart, ChevronRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Link } from "@tanstack/react-router";
import { formatINR } from "@/lib/format";

interface AccountItem {
  id: string;
  name: string;
  category: string;
  balance: number;
  isLiability: boolean;
  institution: string;
}

interface AccountsSnapshotCardProps {
  accounts: AccountItem[];
}

export function AccountsSnapshotCard({ accounts }: AccountsSnapshotCardProps) {
  const getAccountIcon = (category: string) => {
    switch (category) {
      case "credit_card":
        return <CreditCard className="h-3.5 w-3.5 text-rose-600" />;
      case "mutual_fund":
      case "stocks":
        return <LineChart className="h-3.5 w-3.5 text-purple-600" />;
      case "cash":
        return <Wallet className="h-3.5 w-3.5 text-amber-600" />;
      case "bank":
      default:
        return <Landmark className="h-3.5 w-3.5 text-blue-600" />;
    }
  };

  return (
    <Card className="flex flex-col rounded-xl border border-border/50 bg-card shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
            <Landmark className="h-4 w-4" />
          </div>
          <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
            Accounts Snapshot
          </CardTitle>
        </div>

        <Link
          to="/accounts"
          className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
        >
          View All
        </Link>
      </CardHeader>

      <CardContent className="flex-1 pb-4 pt-1 px-4">
        {accounts.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center text-center">
            <p className="text-xs text-muted-foreground">No accounts connected yet.</p>
            <Link to="/accounts" className="mt-1.5 text-xs font-semibold text-blue-600 hover:underline">
              Add your first account
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-border/20 text-xs">
            {accounts.map((acc) => {
              const isNegative = acc.balance < 0 || acc.isLiability;
              const formatted = `${isNegative ? "- " : ""}₹${Math.abs(acc.balance).toLocaleString(
                "en-IN"
              )}`;
              return (
                <div key={acc.id} className="flex items-center justify-between py-2 text-[11px]">
                  <div className="flex items-center gap-2 truncate pr-2">
                    <span className="shrink-0">{getAccountIcon(acc.category)}</span>
                    <span className="truncate font-medium text-foreground">{acc.name}</span>
                  </div>
                  <span
                    className={`font-semibold tabular-nums shrink-0 ${
                      isNegative ? "text-rose-600 dark:text-rose-400" : "text-foreground"
                    }`}
                  >
                    {formatted}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
