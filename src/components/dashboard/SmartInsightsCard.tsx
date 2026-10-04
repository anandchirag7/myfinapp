import {
  Lightbulb,
  ArrowUp,
  AlertTriangle,
  Calendar,
  Sparkles,
  Star,
  ChevronRight,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Link } from "@tanstack/react-router";

interface SmartInsightsCardProps {
  insights: Array<{
    id: string;
    title: string;
    description: string;
    type: string;
    iconType: string;
    severity: string;
  }>;
}

export function SmartInsightsCard({ insights }: SmartInsightsCardProps) {
  const getIcon = (type: string) => {
    switch (type) {
      case "utensils":
      case "alert":
        return <ArrowUp className="h-3.5 w-3.5 text-rose-600" />;
      case "warning":
        return <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />;
      case "home":
      case "calendar":
        return <Calendar className="h-3.5 w-3.5 text-blue-600" />;
      case "trophy":
      case "success":
        return <Sparkles className="h-3.5 w-3.5 text-emerald-600" />;
      case "star":
      case "subscription":
      default:
        return <Star className="h-3.5 w-3.5 text-purple-600" />;
    }
  };

  const getBgColor = (type: string) => {
    switch (type) {
      case "utensils":
      case "alert":
        return "bg-rose-50 dark:bg-rose-950/40";
      case "warning":
        return "bg-amber-50 dark:bg-amber-950/40";
      case "home":
      case "calendar":
        return "bg-blue-50 dark:bg-blue-950/40";
      case "trophy":
      case "success":
        return "bg-emerald-50 dark:bg-emerald-950/40";
      case "star":
      case "subscription":
      default:
        return "bg-purple-50 dark:bg-purple-950/40";
    }
  };

  return (
    <Card className="flex flex-col rounded-xl border border-border/50 bg-card shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
            <Lightbulb className="h-4 w-4" />
          </div>
          <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
            Smart Insights
          </CardTitle>
          <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-950/50 dark:text-purple-300">
            Powered by AI
          </span>
        </div>

        <Link
          to="/chat"
          className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
        >
          View All
        </Link>
      </CardHeader>

      <CardContent className="flex-1 pb-4 pt-1 px-4">
        <div className="space-y-2.5">
          {insights.map((item) => (
            <div
              key={item.id}
              className="flex items-start gap-2.5 rounded-lg border border-transparent p-1.5 transition hover:border-border/40 hover:bg-muted/30"
            >
              <div
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${getBgColor(
                  item.iconType
                )}`}
              >
                {getIcon(item.iconType)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground">{item.title}</p>
                <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
