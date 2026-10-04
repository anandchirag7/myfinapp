import { CreditCard, ShieldCheck, HeartPulse } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface HealthIndicatorsCardProps {
  data: {
    creditCardUtilization: { used: number; limit: number; percentage: number };
    emergencyFund: { coverageMonths: number; status: string };
    healthScore: { score: number; max: number; status: string };
  };
}

export function HealthIndicatorsCard({ data }: HealthIndicatorsCardProps) {
  // Arc parameters for semi-circular gauge
  // Arc sweeps 180 degrees from (11, 52) to (99, 52) with radius 44
  const radius = 44;
  const arcLength = Math.PI * radius; // ~138.23
  const scoreFraction = Math.min(Math.max(data.healthScore.score / data.healthScore.max, 0), 1);
  const strokeDashoffset = arcLength * (1 - scoreFraction);

  return (
    <div className="flex flex-col gap-3">
      {/* 1. Credit Card Utilization */}
      <Card className="rounded-xl border border-border/50 bg-card p-3.5 shadow-sm">
        <CardContent className="p-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <CreditCard className="h-3.5 w-3.5 text-blue-600" />
              <span className="text-xs font-semibold text-foreground">
                Credit Card Utilization
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              ₹{data.creditCardUtilization.used.toLocaleString("en-IN")} of ₹
              {data.creditCardUtilization.limit.toLocaleString("en-IN")}
            </span>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm font-bold text-foreground tabular-nums">
              {data.creditCardUtilization.percentage}%
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-500"
                style={{ width: `${data.creditCardUtilization.percentage}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Emergency Fund Coverage */}
      <Card className="rounded-xl border border-border/50 bg-card p-3.5 shadow-sm">
        <CardContent className="p-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-xs font-semibold text-foreground">
                Emergency Fund Coverage
              </span>
            </div>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
              {data.emergencyFund.status}
            </span>
          </div>

          <div className="mt-1.5 flex items-baseline gap-1">
            <span className="text-base font-bold text-foreground tabular-nums">
              {data.emergencyFund.coverageMonths} months
            </span>
            <span className="text-[10px] text-muted-foreground">target</span>
          </div>
        </CardContent>
      </Card>

      {/* 3. Financial Health Score */}
      <Card className="rounded-xl border border-border/50 bg-card p-3.5 shadow-sm">
        <CardContent className="p-0">
          <div className="flex items-center gap-1.5">
            <HeartPulse className="h-3.5 w-3.5 text-emerald-600" />
            <span className="text-xs font-semibold text-foreground">
              Financial Health Score
            </span>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            {/* Speedometer semi-circular gauge */}
            <div className="relative h-14 w-28 shrink-0">
              <svg className="h-14 w-28 overflow-visible" viewBox="0 0 110 58">
                {/* Background arc track */}
                <path
                  d="M 11 52 A 44 44 0 0 1 99 52"
                  fill="none"
                  stroke="hsl(var(--muted))"
                  strokeWidth="8"
                  strokeLinecap="round"
                />
                {/* Active progress arc */}
                <path
                  d="M 11 52 A 44 44 0 0 1 99 52"
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={arcLength}
                  strokeDashoffset={strokeDashoffset}
                  className="transition-all duration-700 ease-out"
                />
              </svg>

              {/* Centered Score */}
              <div className="absolute inset-0 flex flex-col items-center justify-end pb-0.5">
                <div className="flex items-baseline leading-none">
                  <span className="text-xl font-bold tracking-tight text-foreground tabular-nums">
                    {data.healthScore.score}
                  </span>
                  <span className="text-[10px] font-medium text-muted-foreground">
                    /{data.healthScore.max}
                  </span>
                </div>
              </div>
            </div>

            {/* Status Message Bubble */}
            <div className="flex-1 rounded-lg border border-emerald-100 bg-emerald-50/70 p-2 text-left dark:border-emerald-950/60 dark:bg-emerald-950/20">
              <p className="text-[10px] font-medium leading-tight text-emerald-800 dark:text-emerald-300">
                {data.healthScore.status}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
