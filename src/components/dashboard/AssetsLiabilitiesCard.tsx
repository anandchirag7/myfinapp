import { Scale, ChevronDown } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface AssetsLiabilitiesCardProps {
  data: {
    totalAssets: number;
    totalLiabilities: number;
    assetsBreakdown: Array<{ name: string; value: number; color: string }>;
    liabilitiesBreakdown: Array<{ name: string; value: number; color: string }>;
  };
}

export function AssetsLiabilitiesCard({ data }: AssetsLiabilitiesCardProps) {
  // Total chart height in pixels
  const chartHeight = 150;
  const maxVal = 6000000; // 60 Lakhs

  // Assets segments: Property at bottom, Investments, Savings & Cash, Other Assets at top
  const orderedAssets = [
    { name: "Other Assets", value: 250000, color: "#8b5cf6" },
    { name: "Savings & Cash", value: 840000, color: "#3b82f6" },
    { name: "Investments", value: 2140000, color: "#06b6d4" },
    { name: "Property", value: 2500000, color: "#10b981" },
  ];

  // Liabilities segments: Credit Card on top, Car Loan, Home Loan at bottom
  const orderedLiabilities = [
    { name: "Credit Card", value: 70000, color: "#fb7185" },
    { name: "Car Loan", value: 180000, color: "#f97316" },
    { name: "Home Loan", value: 620000, color: "#f43f5e" },
  ];

  const gridLevels = [
    { label: "₹60L", y: 0 },
    { label: "₹45L", y: 0.25 },
    { label: "₹30L", y: 0.5 },
    { label: "₹15L", y: 0.75 },
    { label: "0", y: 1 },
  ];

  return (
    <Card className="flex flex-col rounded-xl border border-border/50 bg-card shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
            <Scale className="h-4 w-4" />
          </div>
          <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
            Assets vs Liabilities
          </CardTitle>
        </div>

        <button className="flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted">
          <span>All Accounts</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </CardHeader>

      <CardContent className="flex-1 pb-4 pt-2 px-5">
        <div className="flex items-start gap-4">
          {/* Chart Plot Area with Grid Lines */}
          <div className="relative flex-1">
            {/* Grid Lines + Y-axis Labels */}
            <div
              className="relative w-full border-b border-border/60"
              style={{ height: `${chartHeight}px` }}
            >
              {gridLevels.map((lvl, i) => (
                <div
                  key={i}
                  className="absolute left-0 right-0 flex items-center"
                  style={{ top: `${lvl.y * chartHeight}px` }}
                >
                  <span className="w-8 shrink-0 text-[10px] text-muted-foreground tabular-nums">
                    {lvl.label}
                  </span>
                  <div className="h-px flex-1 border-t border-dashed border-border/50" />
                </div>
              ))}

              {/* Bars Overlay (positioned over the grid lines) */}
              <div
                className="absolute bottom-0 left-10 right-2 flex items-end justify-around"
                style={{ height: `${chartHeight}px` }}
              >
                {/* Assets Stacked Bar */}
                <div className="flex flex-col items-center">
                  <div
                    className="w-10 overflow-hidden rounded-t-sm flex flex-col justify-end shadow-xs"
                    style={{
                      height: `${(data.totalAssets / maxVal) * chartHeight}px`,
                    }}
                  >
                    {orderedAssets.map((seg, idx) => {
                      const segH = (seg.value / maxVal) * chartHeight;
                      return (
                        <div
                          key={idx}
                          className="w-full transition-all"
                          style={{
                            height: `${segH}px`,
                            backgroundColor: seg.color,
                          }}
                          title={`${seg.name}: ₹${(seg.value / 100000).toFixed(1)}L`}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Liabilities Stacked Bar */}
                <div className="flex flex-col items-center">
                  <div
                    className="w-10 overflow-hidden rounded-t-sm flex flex-col justify-end shadow-xs"
                    style={{
                      height: `${(data.totalLiabilities / maxVal) * chartHeight}px`,
                    }}
                  >
                    {orderedLiabilities.map((seg, idx) => {
                      const segH = (seg.value / maxVal) * chartHeight;
                      return (
                        <div
                          key={idx}
                          className="w-full transition-all"
                          style={{
                            height: `${segH}px`,
                            backgroundColor: seg.color,
                          }}
                          title={`${seg.name}: ₹${(seg.value / 100000).toFixed(1)}L`}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* X-axis Titles under the bars */}
            <div className="mt-1.5 flex justify-around pl-10 pr-2">
              <div className="text-center">
                <span className="text-[11px] font-medium text-muted-foreground">Assets</span>
                <p className="text-xs font-bold text-foreground tabular-nums">
                  ₹{(data.totalAssets / 100000).toFixed(1)}L
                </p>
              </div>
              <div className="text-center">
                <span className="text-[11px] font-medium text-muted-foreground">Liabilities</span>
                <p className="text-xs font-bold text-foreground tabular-nums">
                  ₹{(data.totalLiabilities / 100000).toFixed(1)}L
                </p>
              </div>
            </div>
          </div>

          {/* Legend Area on the Right */}
          <div className="flex flex-col justify-center space-y-1.5 text-[11px] min-w-[130px] pt-1 border-l border-border/30 pl-3">
            {/* Assets List */}
            {data.assetsBreakdown.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 truncate">
                  <span
                    className="h-2 w-2 shrink-0 rounded-xs"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="truncate text-muted-foreground text-[10px]">{item.name}</span>
                </div>
                <span className="text-foreground font-semibold text-[10px] tabular-nums">
                  ₹{(item.value / 100000).toFixed(1)}L
                </span>
              </div>
            ))}

            <div className="my-1 border-t border-border/40" />

            {/* Liabilities List */}
            {data.liabilitiesBreakdown.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 truncate">
                  <span
                    className="h-2 w-2 shrink-0 rounded-xs"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="truncate text-muted-foreground text-[10px]">{item.name}</span>
                </div>
                <span className="text-foreground font-semibold text-[10px] tabular-nums">
                  ₹{(item.value / 100000).toFixed(1)}L
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
