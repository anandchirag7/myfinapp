import {
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  Percent,
  Receipt,
  Scale,
  Landmark,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatLakhCrore, formatINR } from "@/lib/format";

interface KpiMetricsRowProps {
  data: {
    netWorth: { value: number; delta: string; deltaIsPositive: boolean; comparison: string; label?: string };
    monthlyIncome: { value: number; delta: string; deltaIsPositive: boolean; comparison: string; label?: string };
    monthlyExpenses: { value: number; delta: string; deltaIsPositive: boolean; comparison: string; label?: string };
    savingsRate: { value: number; delta: string; deltaIsPositive: boolean; comparison: string; label?: string };
    investments: { value: number; delta: string; deltaIsPositive: boolean; comparison: string; label?: string };
    liabilities: { value: number; delta: string; deltaIsPositive: boolean; comparison: string; label?: string };
  };
}

function formatCompactINR(val: number): string {
  const abs = Math.abs(val);
  const sign = val < 0 ? "-" : "";
  if (abs >= 1_00_00_000) {
    return `${sign}₹${(abs / 1_00_00_000).toFixed(2).replace(/\.00$/, "")}Cr`;
  }
  if (abs >= 1_00_000) {
    return `${sign}₹${(abs / 1_00_000).toFixed(1).replace(/\.0$/, "")}L`;
  }
  if (abs >= 1_000) {
    return `${sign}₹${(abs / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return `${sign}₹${abs}`;
}

export function KpiMetricsRow({ data }: KpiMetricsRowProps) {
  const cards = [
    {
      title: data.netWorth.label ?? "Net Worth",
      value: formatCompactINR(data.netWorth.value),
      delta: data.netWorth.delta,
      deltaIsPositive: data.netWorth.deltaIsPositive,
      comparison: data.netWorth.comparison,
      icon: Wallet,
      iconBg: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
    },
    {
      title: data.monthlyIncome.label ?? "Monthly Income",
      value: formatCompactINR(data.monthlyIncome.value),
      delta: data.monthlyIncome.delta,
      deltaIsPositive: data.monthlyIncome.deltaIsPositive,
      comparison: data.monthlyIncome.comparison,
      icon: TrendingUp,
      iconBg: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
    },
    {
      title: data.monthlyExpenses.label ?? "Monthly Expenses",
      value: formatCompactINR(data.monthlyExpenses.value),
      delta: data.monthlyExpenses.delta,
      deltaIsPositive: false, // higher expense badge in red
      comparison: data.monthlyExpenses.comparison,
      icon: Receipt,
      iconBg: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400",
    },
    {
      title: "Savings Rate",
      value: `${data.savingsRate.value}%`,
      delta: data.savingsRate.delta,
      deltaIsPositive: data.savingsRate.deltaIsPositive,
      comparison: data.savingsRate.comparison,
      icon: Percent,
      iconBg: "bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-400",
    },
    {
      title: "Investments Portfolio",
      value: formatCompactINR(data.investments.value),
      delta: data.investments.delta,
      deltaIsPositive: data.investments.deltaIsPositive,
      comparison: data.investments.comparison,
      icon: Landmark,
      iconBg: "bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400",
    },
    {
      title: "Total Liabilities",
      value: formatCompactINR(data.liabilities.value),
      delta: data.liabilities.delta,
      deltaIsPositive: false, // negative / neutral delta style
      comparison: data.liabilities.comparison,
      icon: Scale,
      iconBg: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <Card
            key={idx}
            className="overflow-hidden rounded-xl border border-border/50 bg-card p-3.5 shadow-sm transition hover:shadow-md"
          >
            <CardContent className="p-0">
              <div className="flex items-center justify-between">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${card.iconBg}`}
                >
                  <Icon className="h-4 w-4" />
                </div>
              </div>

              <div className="mt-2.5">
                <p className="text-[11px] font-medium text-muted-foreground">{card.title}</p>
                <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-xl font-bold tracking-tight text-foreground tabular-nums">
                    {card.value}
                  </span>
                  <span
                    className={`inline-flex items-center text-[10px] font-semibold px-1 py-0.2 rounded ${
                      card.deltaIsPositive
                        ? "text-emerald-700 bg-emerald-50 dark:bg-emerald-950/50 dark:text-emerald-400"
                        : "text-rose-700 bg-rose-50 dark:bg-rose-950/50 dark:text-rose-400"
                    }`}
                  >
                    {card.deltaIsPositive ? (
                      <ArrowUpRight className="mr-0.5 h-2.5 w-2.5" />
                    ) : (
                      <ArrowDownRight className="mr-0.5 h-2.5 w-2.5" />
                    )}
                    {card.delta}
                  </span>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground truncate">
                  {card.comparison}
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
