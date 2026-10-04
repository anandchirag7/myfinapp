import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { TrendingUp, ArrowUpRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Link } from "@tanstack/react-router";
import { formatINR } from "@/lib/format";

interface InvestmentsOverviewCardProps {
  data: {
    totalValue: number;
    totalReturnPercentage: string;
    totalReturnAmount: string;
    dayChangePercentage: string;
    dayChangeAmount: string;
    allocation: Array<{ name: string; percentage: number; color: string }>;
  };
}

export function InvestmentsOverviewCard({ data }: InvestmentsOverviewCardProps) {
  const compactTotal = `₹${(data.totalValue / 100000).toFixed(1)}L`;

  return (
    <Card className="flex flex-col rounded-xl border border-border/50 bg-card shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                Investments Overview
              </CardTitle>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
              <span>Total Value: <strong className="text-foreground font-semibold">{compactTotal}</strong></span>
              <span className="inline-flex items-center text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded dark:bg-emerald-950/50 dark:text-emerald-400">
                <ArrowUpRight className="mr-0.5 h-2.5 w-2.5" />
                {data.totalReturnPercentage} ({data.totalReturnAmount})
              </span>
            </div>
          </div>
        </div>

        <Link
          to="/investments"
          className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
        >
          View Portfolio
        </Link>
      </CardHeader>

      <CardContent className="flex-1 pb-4 pt-1 px-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* Mini Donut Chart */}
          <div className="relative h-[130px] w-[130px] shrink-0 mx-auto sm:mx-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const item = payload[0].payload;
                      return (
                        <div className="rounded-md border border-border/60 bg-popover/95 p-1.5 text-xs shadow-md">
                          <p className="font-semibold">{item.name}</p>
                          <p className="text-muted-foreground">{item.percentage}%</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Pie
                  data={data.allocation}
                  dataKey="percentage"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={36}
                  outerRadius={56}
                  paddingAngle={2}
                >
                  {data.allocation.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-xs font-bold text-foreground tabular-nums">{compactTotal}</span>
              <span className="text-[9px] text-muted-foreground">Total Value</span>
            </div>
          </div>

          {/* Allocation List (2-column grid) */}
          <div className="grid flex-1 grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
            {data.allocation.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1.5 truncate">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="truncate text-muted-foreground text-[10px]">{item.name}</span>
                </div>
                <span className="font-medium text-foreground text-[10px] tabular-nums">
                  {item.percentage}%
                </span>
              </div>
            ))}
          </div>

          {/* Returns Cards on right */}
          <div className="flex sm:flex-col gap-2 shrink-0">
            <div className="flex-1 rounded-lg border border-border/50 bg-muted/20 p-2 text-center">
              <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Total Return</p>
              <div className="mt-0.5 flex items-center justify-center gap-1 font-bold text-emerald-600 text-xs">
                <span>{data.totalReturnPercentage}</span>
                <span className="text-[10px] font-medium">{data.totalReturnAmount}</span>
              </div>
            </div>
            <div className="flex-1 rounded-lg border border-border/50 bg-muted/20 p-2 text-center">
              <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Day Change</p>
              <div className="mt-0.5 flex items-center justify-center gap-1 font-bold text-emerald-600 text-xs">
                <span>{data.dayChangePercentage}</span>
                <span className="text-[10px] font-medium">{data.dayChangeAmount}</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
