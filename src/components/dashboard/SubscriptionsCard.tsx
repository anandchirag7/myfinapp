import { RefreshCw, PlaySquare, Music, Tv, Shield, Box } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Link } from "@tanstack/react-router";
import { formatINR } from "@/lib/format";

interface SubscriptionsCardProps {
  data: {
    monthlyTotal: number;
    items: Array<{
      id: string;
      name: string;
      amount: number;
      cycle: string;
      brandColor: string;
    }>;
  };
}

export function SubscriptionsCard({ data }: SubscriptionsCardProps) {
  const getBrandLogo = (name: string, color: string) => {
    // Elegant letter/brand avatar badge
    const initial = name.charAt(0);
    return (
      <div
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded font-bold text-white text-[10px]"
        style={{ backgroundColor: color }}
      >
        {initial}
      </div>
    );
  };

  return (
    <Card className="flex flex-col rounded-xl border border-border/50 bg-card shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
            <RefreshCw className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
              Subscriptions
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Total: <strong className="text-foreground font-semibold">₹{data.monthlyTotal.toLocaleString("en-IN")}</strong> / month
            </p>
          </div>
        </div>

        <Link
          to="/bills"
          className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
        >
          Manage
        </Link>
      </CardHeader>

      <CardContent className="flex-1 pb-4 pt-1 px-4">
        {data.items.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center text-center">
            <p className="text-xs text-muted-foreground">No recurring subscriptions detected.</p>
            <Link to="/bills" className="mt-1.5 text-xs font-semibold text-blue-600 hover:underline">
              Add recurring bill
            </Link>
          </div>
        ) : (
          <>
            {/* Table Header */}
            <div className="grid grid-cols-12 text-[10px] font-medium text-muted-foreground pb-1.5 border-b border-border/40">
              <div className="col-span-5">Service</div>
              <div className="col-span-4 text-right">Amount</div>
              <div className="col-span-3 text-right">Billing Cycle</div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-border/20 text-xs">
              {data.items.map((sub) => (
                <div key={sub.id} className="grid grid-cols-12 items-center py-2 text-[11px]">
                  {/* Service */}
                  <div className="col-span-5 flex items-center gap-2 truncate pr-1">
                    {getBrandLogo(sub.name, sub.brandColor)}
                    <span className="truncate font-medium text-foreground">{sub.name}</span>
                  </div>

                  {/* Amount */}
                  <div className="col-span-4 text-right font-medium text-foreground tabular-nums">
                    ₹{sub.amount.toLocaleString("en-IN")}
                  </div>

                  {/* Cycle */}
                  <div className="col-span-3 text-right text-muted-foreground text-[10px]">
                    {sub.cycle}
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
