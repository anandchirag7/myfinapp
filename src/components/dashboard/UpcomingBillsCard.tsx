import {
  CalendarDays,
  Home,
  CreditCard,
  Zap,
  Smartphone,
  Wifi,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Link } from "@tanstack/react-router";
import { formatINR } from "@/lib/format";

interface UpcomingBillsCardProps {
  bills: Array<{
    id: string;
    name: string;
    dueDate: string;
    amount: number;
    autoPay: boolean;
    statusText: string;
    statusColor: string;
  }>;
}

export function UpcomingBillsCard({ bills }: UpcomingBillsCardProps) {
  const getBillIcon = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes("home") || n.includes("loan")) {
      return <Home className="h-3.5 w-3.5 text-rose-600" />;
    }
    if (n.includes("card")) {
      return <CreditCard className="h-3.5 w-3.5 text-blue-600" />;
    }
    if (n.includes("electricity") || n.includes("power")) {
      return <Zap className="h-3.5 w-3.5 text-amber-600" />;
    }
    if (n.includes("mobile") || n.includes("phone")) {
      return <Smartphone className="h-3.5 w-3.5 text-indigo-600" />;
    }
    return <Wifi className="h-3.5 w-3.5 text-sky-600" />;
  };

  return (
    <Card className="flex flex-col rounded-xl border border-border/50 bg-card shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
            <CalendarDays className="h-4 w-4" />
          </div>
          <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
            Upcoming Bills & EMIs
          </CardTitle>
        </div>

        <Link
          to="/bills"
          className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
        >
          View All
        </Link>
      </CardHeader>

      <CardContent className="flex-1 pb-4 pt-1 px-4">
        {bills.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center text-center">
            <p className="text-xs text-muted-foreground">No upcoming bills due in the next 30 days.</p>
            <Link to="/bills" className="mt-1.5 text-xs font-semibold text-blue-600 hover:underline">
              Add a bill or reminder
            </Link>
          </div>
        ) : (
          <>
            {/* Table Header */}
            <div className="grid grid-cols-12 text-[10px] font-medium text-muted-foreground pb-1.5 border-b border-border/40">
              <div className="col-span-4">Bill / EMI</div>
              <div className="col-span-2 text-left">Due Date</div>
              <div className="col-span-3 text-right">Amount</div>
              <div className="col-span-1 text-center">AutoPay</div>
              <div className="col-span-2 text-right">Status</div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-border/20 text-xs">
              {bills.map((b) => (
                <div key={b.id} className="grid grid-cols-12 items-center py-2 text-[11px]">
                  {/* Bill name + icon */}
                  <div className="col-span-4 flex items-center gap-1.5 truncate pr-1">
                    <span className="shrink-0">{getBillIcon(b.name)}</span>
                    <span className="truncate font-medium text-foreground">{b.name}</span>
                  </div>

                  {/* Due Date */}
                  <div className="col-span-2 text-muted-foreground text-[10px] truncate">
                    {b.dueDate}
                  </div>

                  {/* Amount */}
                  <div className="col-span-3 text-right font-medium text-foreground tabular-nums">
                    ₹{b.amount.toLocaleString("en-IN")}
                  </div>

                  {/* AutoPay badge */}
                  <div className="col-span-1 flex justify-center">
                    <span
                      className={`inline-block rounded px-1.5 py-0.2 text-[9px] font-semibold ${
                        b.autoPay
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {b.autoPay ? "Yes" : "No"}
                    </span>
                  </div>

                  {/* Status */}
                  <div className="col-span-2 text-right">
                    <span className={`text-[10px] font-medium ${b.statusColor} px-1.5 py-0.5 rounded-full inline-flex items-center gap-1`}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {b.statusText}
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
