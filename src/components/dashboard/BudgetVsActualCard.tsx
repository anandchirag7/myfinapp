import {
  Target,
  ChevronDown,
  ShoppingCart,
  Utensils,
  Zap,
  Plane,
  ShoppingBag,
  Users,
  HeartPulse,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatINR } from "@/lib/format";

interface BudgetVsActualCardProps {
  data: Array<{
    category: string;
    budget: number;
    actual: number;
    percentage: number;
    icon: string;
    color: string;
  }>;
}

export function BudgetVsActualCard({ data }: BudgetVsActualCardProps) {
  const getIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case "groceries":
        return <ShoppingCart className="h-3.5 w-3.5 text-emerald-600" />;
      case "dining":
        return <Utensils className="h-3.5 w-3.5 text-rose-600" />;
      case "utilities":
        return <Zap className="h-3.5 w-3.5 text-amber-600" />;
      case "travel":
        return <Plane className="h-3.5 w-3.5 text-sky-600" />;
      case "shopping":
        return <ShoppingBag className="h-3.5 w-3.5 text-purple-600" />;
      case "family":
        return <Users className="h-3.5 w-3.5 text-indigo-600" />;
      case "health":
      default:
        return <HeartPulse className="h-3.5 w-3.5 text-teal-600" />;
    }
  };

  return (
    <Card className="flex flex-col rounded-xl border border-border/50 bg-card shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
            <Target className="h-4 w-4" />
          </div>
          <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
            Budget vs Actual
          </CardTitle>
        </div>

        <button className="flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted">
          <span>Last: 30 Days</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </CardHeader>

      <CardContent className="flex-1 pb-4 pt-1 px-4">
        {data.length === 0 ? (
          <div className="flex h-36 flex-col items-center justify-center text-center">
            <p className="text-xs text-muted-foreground">No budget categories or expenses found for this month.</p>
          </div>
        ) : (
          <>
            {/* Table Header */}
            <div className="grid grid-cols-12 text-[10px] font-medium text-muted-foreground pb-1.5 border-b border-border/40">
              <div className="col-span-4">Category</div>
              <div className="col-span-3 text-right">Budget</div>
              <div className="col-span-3 text-right">Actual</div>
              <div className="col-span-2 text-right">Progress</div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-border/20 text-xs">
              {data.map((row, idx) => {
                const isOverBudget = row.percentage > 100;
                return (
                  <div key={idx} className="grid grid-cols-12 items-center py-2 text-[11px]">
                    {/* Category with icon */}
                    <div className="col-span-4 flex items-center gap-1.5 truncate pr-1">
                      <span className="shrink-0">{getIcon(row.category)}</span>
                      <span className="truncate font-medium text-foreground">{row.category}</span>
                    </div>

                    {/* Budget */}
                    <div className="col-span-3 text-right text-muted-foreground tabular-nums">
                      ₹{row.budget.toLocaleString("en-IN")}
                    </div>

                    {/* Actual */}
                    <div
                      className={`col-span-3 text-right font-medium tabular-nums ${
                        isOverBudget ? "text-rose-600 dark:text-rose-400" : "text-foreground"
                      }`}
                    >
                      ₹{row.actual.toLocaleString("en-IN")}
                    </div>

                    {/* Progress bar + % */}
                    <div className="col-span-2 flex items-center justify-end gap-1.5 pl-1">
                      <div className="h-1.5 w-10 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${
                            isOverBudget ? "bg-rose-500" : "bg-emerald-500"
                          }`}
                          style={{ width: `${Math.min(row.percentage, 100)}%` }}
                        />
                      </div>
                      <span
                        className={`w-7 text-right font-medium tabular-nums ${
                          isOverBudget ? "text-rose-600" : "text-muted-foreground"
                        }`}
                      >
                        {row.percentage}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
