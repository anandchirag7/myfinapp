import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { ChevronDown, PieChart as PieIcon } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { formatINR } from "@/lib/format";

interface SpendingCategoryCardProps {
  data: {
    totalSpent: number;
    categories: Array<{
      name: string;
      amount: number;
      percentage: number;
      color: string;
    }>;
  };
}

export function SpendingCategoryCard({ data }: SpendingCategoryCardProps) {
  const compactTotal = `₹${(data.totalSpent / 100000).toFixed(2).replace(/\.00$/, "")}L`;

  return (
    <Card className="flex flex-col rounded-xl border border-border/50 bg-card shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between pb-2 pt-4 px-5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
            <PieIcon className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
              Spending by Category
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Total expenses: {formatINR(data.totalSpent)}
            </CardDescription>
          </div>
        </div>

        <button className="flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted">
          <span>Last 30 Days</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </CardHeader>

      <CardContent className="flex-1 pb-4 pt-1 px-4">
        {data.categories.length === 0 ? (
          <div className="flex h-44 flex-col items-center justify-center text-center">
            <p className="text-xs text-muted-foreground">No expenses recorded for this period.</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            {/* Donut Chart with Centered Metric */}
            <div className="relative h-[190px] w-[180px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const item = payload[0].payload;
                        return (
                          <div className="rounded-lg border border-border/60 bg-popover/95 p-2 text-xs shadow-lg backdrop-blur">
                            <p className="font-semibold text-foreground">{item.name}</p>
                            <p className="text-muted-foreground">
                              {formatINR(item.amount)} ({item.percentage}%)
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Pie
                    data={data.categories}
                    dataKey="amount"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={74}
                    paddingAngle={2}
                  >
                    {data.categories.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              {/* Center Text */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-sm font-bold tracking-tight text-foreground tabular-nums">
                  {compactTotal}
                </span>
                <span className="text-[10px] text-muted-foreground">Total Spent</span>
              </div>
            </div>

            {/* Breakdown List */}
            <div className="grid flex-1 grid-cols-1 gap-x-3 gap-y-1.5 overflow-hidden text-xs">
              {data.categories.map((cat, idx) => (
                <div key={idx} className="flex items-center justify-between gap-1 text-[11px]">
                  <div className="flex items-center gap-1.5 truncate">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="truncate text-foreground font-medium">{cat.name}</span>
                  </div>
                  <div className="flex items-center gap-2 tabular-nums">
                    <span className="text-muted-foreground">₹{cat.amount.toLocaleString("en-IN")}</span>
                    <span className="w-7 text-right font-medium text-foreground">{cat.percentage}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
