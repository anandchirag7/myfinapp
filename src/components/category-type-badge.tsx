import { cn } from "@/lib/utils";
import { getCategoryTypeLabel, type ResolvedCategoryType } from "@/lib/category-type";

const KIND_CLASSES = {
  income: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  expense: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300",
  transfer: "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
  investment: "border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-300",
  mixed: "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300",
} as const;

export function CategoryTypeBadge({ resolved, className }: { resolved: ResolvedCategoryType; className?: string }) {
  if (!resolved.kind) {
    return <span className={cn("text-xs text-muted-foreground", className)} title="Category type unavailable">—</span>;
  }

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium",
        KIND_CLASSES[resolved.kind],
        resolved.inferred && "border-dashed bg-transparent opacity-80",
        className,
      )}
      title={resolved.kind === "mixed" ? "Split categories have different types" : resolved.inferred ? "Inferred from transaction direction" : "From assigned category"}
    >
      {getCategoryTypeLabel(resolved)}
    </span>
  );
}
