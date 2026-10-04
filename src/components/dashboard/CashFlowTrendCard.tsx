import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { formatINR } from "@/lib/format";

interface CashFlowTrendCardProps {
  data: Array<{ month: string; income: number; expenses: number }>;
}

const formatLakhAxis = (val: number) => {
  if (val === 0) return "0";
  return `₹${(val / 100000).toFixed(0)}L`;
};

export function CashFlowTrendCard({ data }: CashFlowTrendCardProps) {
  return (
    <Card className="flex flex-col rounded-xl border border-border/50 bg-card shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between pb-2 pt-4 px-5">
        <div>
          <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
            Cash Flow Trend
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Monthly income vs expenses over time
          </CardDescription>
        </div>
        <div className="flex items-center gap-3 text-xs font-medium">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            <span className="text-muted-foreground text-[11px]">Income</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            <span className="text-muted-foreground text-[11px]">Expenses</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 pb-4 pt-2 px-3">
        <div className="h-[210px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <defs>
                <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.5)" />
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tickFormatter={formatLakhAxis}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                domain={[0, "auto"]}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const inc = payload.find((p) => p.dataKey === "income")?.value ?? 0;
                    const exp = payload.find((p) => p.dataKey === "expenses")?.value ?? 0;
                    return (
                      <div className="rounded-lg border border-border/60 bg-popover/95 p-2.5 text-xs shadow-lg backdrop-blur">
                        <p className="font-semibold text-foreground mb-1">{label}</p>
                        <div className="flex items-center justify-between gap-4 text-blue-600">
                          <span>Income:</span>
                          <span className="font-semibold tabular-nums">{formatINR(Number(inc))}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4 text-rose-600 mt-0.5">
                          <span>Expenses:</span>
                          <span className="font-semibold tabular-nums">{formatINR(Number(exp))}</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey="income"
                stroke="#3b82f6"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#incomeGradient)"
              />
              <Area
                type="monotone"
                dataKey="expenses"
                stroke="#ef4444"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#expenseGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
