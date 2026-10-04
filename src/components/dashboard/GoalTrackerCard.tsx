import {
  Target,
  ShieldCheck,
  Plane,
  Car,
  Home,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Link } from "@tanstack/react-router";

interface GoalTrackerCardProps {
  goals: Array<{
    id: string;
    name: string;
    saved: number;
    target: number;
    percentage: number;
    icon: string;
    color: string;
  }>;
}

export function GoalTrackerCard({ goals }: GoalTrackerCardProps) {
  const getGoalIcon = (name: string) => {
    if (name.toLowerCase().includes("emergency")) {
      return <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />;
    }
    if (name.toLowerCase().includes("vacation") || name.toLowerCase().includes("travel")) {
      return <Plane className="h-3.5 w-3.5 text-sky-600" />;
    }
    if (name.toLowerCase().includes("car")) {
      return <Car className="h-3.5 w-3.5 text-emerald-600" />;
    }
    return <Home className="h-3.5 w-3.5 text-amber-600" />;
  };

  const formatLakh = (val: number) => `₹${(val / 100000).toFixed(1)}L`;

  return (
    <Card className="flex flex-col rounded-xl border border-border/50 bg-card shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
            <Target className="h-4 w-4" />
          </div>
          <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
            Goal Tracker
          </CardTitle>
        </div>

        <Link
          to="/goals"
          className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
        >
          View All
        </Link>
      </CardHeader>

      <CardContent className="flex-1 pb-4 pt-1 px-4">
        {goals.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center text-center">
            <p className="text-xs text-muted-foreground">No savings goals created yet.</p>
            <Link to="/goals" className="mt-1.5 text-xs font-semibold text-blue-600 hover:underline">
              Create your first goal
            </Link>
          </div>
        ) : (
          <>
            {/* Table Header */}
            <div className="grid grid-cols-12 text-[10px] font-medium text-muted-foreground pb-1.5 border-b border-border/40">
              <div className="col-span-5">Goal</div>
              <div className="col-span-4 text-right">Saved / Target</div>
              <div className="col-span-3 text-right">Progress</div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-border/20 text-xs">
              {goals.map((g) => (
                <div key={g.id} className="grid grid-cols-12 items-center py-2.5 text-[11px]">
                  {/* Goal name + icon */}
                  <div className="col-span-5 flex items-center gap-2 truncate pr-1">
                    <span className="shrink-0">{getGoalIcon(g.name)}</span>
                    <span className="truncate font-medium text-foreground">{g.name}</span>
                  </div>

                  {/* Saved / Target */}
                  <div className="col-span-4 text-right text-muted-foreground tabular-nums">
                    <span className="font-semibold text-foreground">{formatLakh(g.saved)}</span>
                    <span> / {formatLakh(g.target)}</span>
                  </div>

                  {/* Progress bar + % */}
                  <div className="col-span-3 flex items-center justify-end gap-1.5 pl-1">
                    <div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${Math.min(g.percentage, 100)}%` }}
                      />
                    </div>
                    <span className="w-7 text-right font-medium text-foreground tabular-nums">
                      {g.percentage}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
