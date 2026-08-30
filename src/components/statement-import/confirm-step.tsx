import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { toast } from "sonner";
import {
  Search,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Merge,
  Scissors,
  EyeOff,
  Check,
  Users,
  Loader2,
  Grid,
  Layers,
  Zap,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Cluster,
  ClusterStatus,
  clusterTotal,
  clusterTxnCount,
  memberCohesion,
  mergeClusters,
  moveMembers,
  splitCluster,
  summarize,
  getClusterTier,
  groupClustersByCategory,
} from "@/lib/statement-clusters";
import { buildCategoryIndex, categorizeByKeywords } from "@/lib/category-resolver";
import { MatchSourceBadge, StatusBadge, ConfidenceMeter } from "./badges";
import { cn } from "@/lib/utils";
import { CategorySelectPopover, type CategoryItem } from "@/components/category-select-popover";

type Category = { id: string; name: string; kind?: string; parent_id?: string | null };

const money = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "INR", maximumFractionDigits: 0 });

type FilterKey =
  | "all"
  | "review"
  | "approved"
  | "ai"
  | "existing"
  | "new"
  | "ignored"
  | "tier1"
  | "tier2"
  | "tier3";

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "review", label: "Needs review" },
  { key: "approved", label: "Approved" },
  { key: "ai", label: "AI suggested" },
  { key: "existing", label: "Existing" },
  { key: "new", label: "New" },
  { key: "ignored", label: "Ignored" },
];

function StatTile({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: string | number;
  tone?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "rounded-[10px] border bg-card px-2 py-1.5 text-left transition-colors",
        onClick && "hover:bg-muted/60",
        active && "border-primary/50 bg-primary/5",
      )}
    >
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-sm font-semibold tabular-nums", tone)}>{value}</div>
    </button>
  );
}

function CategorySelect({
  categories,
  value,
  onChange,
  onCategoryCreated,
}: {
  categories: Category[];
  value: string | null;
  onChange: (v: string | null) => void;
  onCategoryCreated?: (c: CategoryItem) => void;
}) {
  return (
    <CategorySelectPopover
      categories={categories}
      value={value}
      onChange={onChange}
      onCategoryCreated={onCategoryCreated}
    />
  );
}

/** Lightweight lazy payee picker that opens a search popover instead of rendering N SelectItem components */
const ClusterPickPopover = memo(function ClusterPickPopover({
  clusters,
  currentId,
  onSelect,
}: {
  clusters: Cluster[];
  currentId: string;
  onSelect: (target: Cluster) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const trigger = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 w-7 p-0 shrink-0"
      aria-label="Pick existing cluster payee"
      onClick={() => {
        if (!open) {
          setOpen(true);
          setSearch("");
        }
      }}
    >
      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
    </Button>
  );

  if (!open) return trigger;

  const q = search.trim().toLowerCase();
  const filtered = clusters
    .filter((c) => c.id !== currentId && (!q || c.name.toLowerCase().includes(q)))
    .slice(0, 40);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-60 p-0" align="start">
        <div className="flex items-center border-b px-2 py-1.5">
          <Search className="mr-1.5 h-3 w-3 shrink-0 text-muted-foreground" />
          <Input
            placeholder="Search payees..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 text-xs border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-0"
            autoFocus
          />
        </div>
        <div className="max-h-48 overflow-y-auto p-1 text-xs">
          {filtered.length === 0 ? (
            <p className="py-2 text-center text-xs text-muted-foreground">No matching payees</p>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                className="flex w-full items-center justify-between rounded px-2 py-1 text-left hover:bg-muted/70 truncate text-xs"
                onClick={() => {
                  onSelect(c);
                  setOpen(false);
                }}
              >
                <span className="truncate">{c.name}</span>
                <span className="text-[10px] text-muted-foreground shrink-0 ml-1">
                  {clusterTxnCount(c)} txns
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
});

/** Lightweight lazy merge picker */
const ClusterMergePopover = memo(function ClusterMergePopover({
  clusters,
  currentId,
  memberDesc,
  onMerge,
  isSmall,
}: {
  clusters: Cluster[];
  currentId: string;
  memberDesc?: string;
  onMerge: (targetId: string, memberDesc?: string) => void;
  isSmall?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const trigger = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn(
        "gap-1 border-dashed",
        isSmall ? "h-5 px-1.5 text-[10px] w-auto" : "h-7 px-2 text-xs w-auto",
      )}
      aria-label="Merge cluster"
      onClick={() => {
        if (!open) {
          setOpen(true);
          setSearch("");
        }
      }}
    >
      <Merge className={isSmall ? "h-2.5 w-2.5 mr-0.5" : "h-3 w-3"} />
      <span>Merge</span>
    </Button>
  );

  if (!open) return trigger;

  const q = search.trim().toLowerCase();
  const filtered = clusters
    .filter((c) => c.id !== currentId && (!q || c.name.toLowerCase().includes(q)))
    .slice(0, 40);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-60 p-0" align="start">
        <div className="flex items-center border-b px-2 py-1.5">
          <Search className="mr-1.5 h-3 w-3 shrink-0 text-muted-foreground" />
          <Input
            placeholder="Merge into payee..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 text-xs border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-0"
            autoFocus
          />
        </div>
        <div className="max-h-48 overflow-y-auto p-1 text-xs">
          {filtered.length === 0 ? (
            <p className="py-2 text-center text-xs text-muted-foreground">No matching payees</p>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                className="flex w-full items-center justify-between rounded px-2 py-1 text-left hover:bg-muted/70 truncate text-xs"
                onClick={() => {
                  onMerge(c.id, memberDesc);
                  setOpen(false);
                }}
              >
                <span className="truncate">
                  {memberDesc ? `Move to “${c.name}”` : `Merge into “${c.name}”`}
                </span>
                <span className="text-[10px] text-muted-foreground shrink-0 ml-1">
                  {clusterTxnCount(c)} txns
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
});

const ClusterCard = memo(function ClusterCard({
  cluster,
  clusters,
  categories,
  accounts,
  currentAccountId,
  selected,
  expanded,
  onToggleSelect,
  onToggleExpand,
  onPatch,
  onSplit,
  onMergeWith,
  onSaveToBackend,
  onCategoryCreated,
}: {
  cluster: Cluster;
  clusters: Cluster[];
  categories: Category[];
  accounts?: Array<{ id: string; name: string }>;
  currentAccountId?: string;
  selected: boolean;
  expanded: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onPatch: (patch: Partial<Cluster>) => void;
  onSplit: () => void;
  onMergeWith: (targetId: string, memberDesc?: string) => void;
  onSaveToBackend?: (cluster: Cluster) => void;
  onCategoryCreated?: (c: CategoryItem) => void;
}) {
  const count = clusterTxnCount(cluster);
  const total = clusterTotal(cluster);
  const ignored = cluster.status === "ignored";

  return (
    <div
      className={cn(
        "rounded-xl border bg-card px-2.5 py-2 shadow-xs transition-colors",
        selected && "border-primary/50 bg-primary/5",
        ignored && "opacity-55",
      )}
    >
      <div className="flex items-start gap-2">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggleSelect}
          aria-label={`Select ${cluster.name}`}
          className="mt-1"
        />
        <button
          type="button"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${cluster.members.length} descriptions`}
          className="mt-0.5 rounded p-0.5 text-muted-foreground hover:bg-muted"
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Payee Dropdown / Editable Input */}
            <div className="flex items-center gap-1 min-w-[220px] max-w-[320px] flex-1">
              <Input
                value={cluster.name}
                onChange={(e) => onPatch({ name: e.target.value, source: "manual", confidence: 1 })}
                aria-label="Payee name"
                className="h-7 text-xs font-medium"
              />
              <ClusterPickPopover
                clusters={clusters}
                currentId={cluster.id}
                onSelect={(target) => {
                  onPatch({
                    name: target.name,
                    category_id: target.category_id ?? cluster.category_id,
                    source: "manual",
                    confidence: 1,
                  });
                }}
              />
            </div>

            <MatchSourceBadge source={cluster.pendingAi ? "pending" : cluster.source} />
            <StatusBadge status={cluster.status} />
            <ConfidenceMeter value={cluster.confidence} />
            {cluster.isExisting && (
              <span className="inline-flex items-center gap-1 rounded-full border border-info/30 bg-info/12 px-1.5 py-px text-[10px] font-medium text-info">
                <Users className="h-2.5 w-2.5" aria-hidden />
                Saved
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="tabular-nums">
              <strong className="text-foreground">{count.toLocaleString()}</strong> txns
            </span>
            <span className="tabular-nums">
              <strong className="text-foreground">{cluster.members.length}</strong> descriptions
            </span>
            <span className="tabular-nums">{money(total)}</span>
            <span className="capitalize">{cluster.type}</span>
            {cluster.tokens.slice(0, 3).map((t) => (
              <span key={t} className="rounded bg-muted px-1 py-px font-mono text-[10px]">
                {t}
              </span>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <div className="w-[200px]">
              <CategorySelect
                categories={categories}
                value={cluster.category_id}
                onChange={(v) => onPatch({ category_id: v })}
                onCategoryCreated={onCategoryCreated}
              />
            </div>
            <div className="w-[110px]">
              <Select
                value={cluster.type}
                onValueChange={(v) =>
                  onPatch({ type: v as Cluster["type"], isTransfer: v === "transfer" })
                }
              >
                <SelectTrigger className="h-7 text-xs" aria-label="Transaction type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="income">Income</SelectItem>
                  <SelectItem value="transfer">Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {cluster.type === "transfer" && (
              <div className="w-[170px]">
                <Select
                  value={cluster.transfer_account_id ?? ""}
                  onValueChange={(v) => onPatch({ transfer_account_id: v || null })}
                >
                  <SelectTrigger className="h-7 text-xs" aria-label="Transfer counterparty account">
                    <SelectValue placeholder="Counterparty account…" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts
                      ?.filter((a) => a.id !== currentAccountId)
                      .map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-1">
              {cluster.status === "approved" ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
                  onClick={() => onPatch({ status: "review" })}
                  title="Move back to Needs Review pane to edit name, type, or category"
                >
                  <RotateCcw className="mr-1 h-3 w-3" aria-hidden />
                  Move to Review
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    onPatch({ status: "approved", pendingAi: false });
                    onSaveToBackend?.(cluster);
                  }}
                >
                  <Check className="mr-1 h-3 w-3" aria-hidden />
                  Approve & Save
                </Button>
              )}

              {/* Merge Cluster Dropdown */}
              <ClusterMergePopover
                clusters={clusters}
                currentId={cluster.id}
                onMerge={onMergeWith}
              />

              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onSplit}>
                <Scissors className="mr-1 h-3 w-3" aria-hidden />
                Split
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => onPatch({ status: ignored ? "review" : "ignored" })}
              >
                <EyeOff className="mr-1 h-3 w-3" aria-hidden />
                {ignored ? "Restore" : "Ignore"}
              </Button>
            </div>
          </div>

          {expanded && (
            <ul className="mt-1 space-y-px rounded-[10px] border bg-muted/25 p-1">
              {cluster.members.slice(0, 60).map((m) => (
                <li
                  key={m.description}
                  className="flex items-center gap-2 rounded px-1.5 py-1 text-[11px] hover:bg-background"
                >
                  <span className="min-w-0 flex-1 truncate font-mono" title={m.description}>
                    {m.description}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {m.count}× · {money(m.total)}
                  </span>
                  {/* Per-transaction description merge */}
                  <ClusterMergePopover
                    clusters={clusters}
                    currentId={cluster.id}
                    memberDesc={m.description}
                    onMerge={onMergeWith}
                    isSmall
                  />
                </li>
              ))}
              {cluster.members.length > 60 && (
                <li className="px-1.5 py-1 text-[11px] text-muted-foreground">
                  +{cluster.members.length - 60} more descriptions
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
});

export function ConfirmStep({
  clusters,
  setClusters,
  categories,
  accounts,
  currentAccountId,
  aiRemaining,
  polishing,
  onPolish,
  onCategorizeRemaining,
  onSavePayee,
  onCategoryCreated,
  onBack,
  onContinue,
}: {
  clusters: Cluster[];
  setClusters: (next: Cluster[]) => void;
  categories: Category[];
  accounts?: Array<{ id: string; name: string }>;
  currentAccountId?: string;
  aiRemaining: number;
  polishing: boolean;
  onPolish: () => void;
  onCategorizeRemaining: (clusters: Cluster[]) => Promise<Record<string, string | null>>;
  onSavePayee?: (cluster: Cluster) => void;
  onCategoryCreated?: (c: CategoryItem) => void;
  onBack: () => void;
  onContinue: (clusters?: Cluster[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("review");
  const [viewMode, setViewMode] = useState<"payee" | "category">("payee");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [catExpanded, setCatExpanded] = useState<Record<string, boolean>>({});
  const [splitId, setSplitId] = useState<string | null>(null);
  const [splitPicked, setSplitPicked] = useState<string[]>([]);
  const [moveTargetId, setMoveTargetId] = useState<string>("");
  const [showHighConfModal, setShowHighConfModal] = useState(false);
  const [categorizing, setCategorizing] = useState(false);

  const parentRef = useRef<HTMLDivElement>(null);

  const stats = useMemo(() => summarize(clusters), [clusters]);

  const tierSummary = useMemo(() => {
    const active = clusters.filter((cluster) => cluster.status !== "ignored");
    const tiers = {
      tier1: [] as Cluster[],
      tier2: [] as Cluster[],
      tier3: [] as Cluster[],
    };
    for (const cluster of active) tiers[getClusterTier(cluster)].push(cluster);
    const summarizeTier = (items: Cluster[]) => ({
      count: items.length,
      transactions: items.reduce((total, cluster) => total + clusterTxnCount(cluster), 0),
    });
    return {
      tier1: summarizeTier(tiers.tier1),
      tier2: summarizeTier(tiers.tier2),
      tier3: summarizeTier(tiers.tier3),
      uncategorized: active.filter((cluster) => !cluster.category_id).length,
    };
  }, [clusters]);

  const categorySummary = useMemo(() => {
    const active = clusters.filter((cluster) => cluster.status !== "ignored");
    const totalTransactions = active.reduce(
      (total, cluster) => total + clusterTxnCount(cluster),
      0,
    );
    return groupClustersByCategory(active, categories)
      .filter((group) => group.categoryId)
      .slice(0, 3)
      .map((group) => ({
        name: group.categoryName,
        percent: totalTransactions ? Math.round((group.totalTxns / totalTransactions) * 100) : 0,
      }));
  }, [categories, clusters]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const highConfUnapproved = useMemo(() => {
    return clusters.filter((c) => {
      if (c.status === "approved" || c.status === "ignored") return false;
      const tier = getClusterTier(c);
      return tier === "tier1" || tier === "tier2";
    });
  }, [clusters]);

  const highConfUnapprovedTxns = useMemo(() => {
    return highConfUnapproved.reduce((acc, c) => acc + clusterTxnCount(c), 0);
  }, [highConfUnapproved]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clusters
      .filter((c) => {
        if (filter === "review" && c.status !== "review") return false;
        if (filter === "approved" && c.status !== "approved") return false;
        if (filter === "ai" && c.source !== "ai") return false;
        if (filter === "existing" && !c.isExisting) return false;
        if (filter === "new" && c.isExisting) return false;
        if (filter === "ignored" && c.status !== "ignored") return false;
        if (filter === "tier1" && getClusterTier(c) !== "tier1") return false;
        if (filter === "tier2" && getClusterTier(c) !== "tier2") return false;
        if (filter === "tier3" && getClusterTier(c) !== "tier3") return false;
        if (filter !== "ignored" && filter !== "approved" && c.status === "ignored") return false;
        if (!q) return true;
        return (
          c.name.toLowerCase().includes(q) ||
          c.members.some((m) => m.description.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => clusterTxnCount(b) - clusterTxnCount(a));
  }, [clusters, filter, query]);

  const categoryGroups = useMemo(() => {
    return groupClustersByCategory(visible, categories);
  }, [visible, categories]);

  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 120,
    getItemKey: (index) => visible[index]?.id ?? index,
    overscan: 6,
  });

  const patch = useCallback(
    (id: string, p: Partial<Cluster>) => {
      setClusters(clusters.map((c) => (c.id === id ? { ...c, ...p } : c)));
    },
    [clusters, setClusters],
  );

  const bulk = useCallback(
    (p: Partial<Cluster>) => {
      const set = new Set(selectedIds);
      setClusters(clusters.map((c) => (set.has(c.id) ? { ...c, ...p } : c)));
    },
    [clusters, selectedIds, setClusters],
  );

  const handleMergeWith = useCallback(
    (sourceId: string, targetId: string, memberDesc?: string) => {
      if (memberDesc) {
        setClusters(moveMembers(clusters, sourceId, [memberDesc], targetId));
      } else {
        setClusters(mergeClusters(clusters, [sourceId, targetId]));
      }
    },
    [clusters, setClusters],
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpanded((p) => ({ ...p, [id]: !p[id] }));
  }, []);

  const autoAssignByKeywords = useCallback(() => {
    const categoryIndex = buildCategoryIndex(
      categories.map((category) => ({
        id: category.id,
        name: category.name,
        kind: category.kind ?? "expense",
        parent_id: category.parent_id ?? null,
      })),
    );
    let assigned = 0;
    const next = clusters.map((cluster) => {
      if (cluster.status === "ignored" || cluster.category_id) return cluster;
      const categoryId = categorizeByKeywords(
        cluster.patterns.join(" "),
        cluster.members[0]?.description ?? cluster.name,
        categoryIndex,
      );
      if (!categoryId) return cluster;
      assigned++;
      return {
        ...cluster,
        category_id: categoryId,
        source: "rule" as const,
        confidence: Math.max(cluster.confidence, 0.9),
        status: "suggested" as const,
      };
    });
    setClusters(next);
    toast[assigned ? "success" : "info"](
      assigned
        ? `Assigned categories to ${assigned} clusters using keyword rules`
        : "No additional keyword matches found",
    );
  }, [categories, clusters, setClusters]);

  const askAiForRemaining = useCallback(async () => {
    const unresolved = clusters.filter(
      (cluster) => cluster.status !== "ignored" && !cluster.category_id,
    );
    if (!unresolved.length) {
      toast.info("Every active cluster already has a category");
      return;
    }
    setCategorizing(true);
    try {
      const assignments = await onCategorizeRemaining(unresolved);
      let assigned = 0;
      const next = clusters.map((cluster) => {
        const categoryId = assignments[cluster.id];
        if (!categoryId) return cluster;
        assigned++;
        return {
          ...cluster,
          category_id: categoryId,
          source: "ai" as const,
          confidence: Math.max(cluster.confidence, 0.75),
          status: "suggested" as const,
        };
      });
      setClusters(next);
      toast[assigned ? "success" : "info"](
        assigned
          ? `AI assigned categories to ${assigned} clusters`
          : "AI could not confidently assign the remaining clusters",
      );
    } catch (error: any) {
      toast.error(error?.message ?? "AI categorization failed");
    } finally {
      setCategorizing(false);
    }
  }, [clusters, onCategorizeRemaining, setClusters]);

  const useUncategorizedDefault = useCallback(() => {
    const defaultCategory = categories.find((category) =>
      ["uncategorized", "uncategorised", "other"].includes(category.name.trim().toLowerCase()),
    );
    const next = clusters.map((cluster) =>
      cluster.status !== "ignored" && !cluster.category_id
        ? { ...cluster, category_id: defaultCategory?.id ?? null, status: "approved" as const }
        : cluster,
    );
    setClusters(next);
    toast.success(
      defaultCategory
        ? `Assigned remaining clusters to ${defaultCategory.name}`
        : "Approved the remaining clusters without a category",
    );
  }, [categories, clusters, setClusters]);

  const approveAllAndContinue = useCallback(() => {
    const next = clusters.map((cluster) =>
      cluster.status === "ignored"
        ? cluster
        : { ...cluster, status: "approved" as const, pendingAi: false },
    );
    setClusters(next);
    onContinue(next);
  }, [clusters, onContinue, setClusters]);

  const splitTarget = clusters.find((c) => c.id === splitId) ?? null;
  const cohesion = useMemo(
    () => (splitTarget ? memberCohesion(splitTarget) : new Map<string, number>()),
    [splitTarget],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
      {/* Summary-first view: high-confidence groups stay collapsed until requested. */}
      <div className="rounded-xl border bg-card p-3 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Import summary</p>
            <p className="text-[11px] text-muted-foreground">
              Review exceptions first, or approve the categorized result in one click.
            </p>
          </div>
          <Button size="sm" className="h-8 gap-1.5" onClick={approveAllAndContinue}>
            <Check className="h-3.5 w-3.5" /> Approve all &amp; continue
          </Button>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_220px]">
          <div className="grid gap-1.5 sm:grid-cols-3">
            {[
              {
                key: "tier1" as const,
                label: "Auto-matched",
                summary: tierSummary.tier1,
                tone: "text-emerald-700 dark:text-emerald-300",
              },
              {
                key: "tier2" as const,
                label: "AI / rule suggested",
                summary: tierSummary.tier2,
                tone: "text-ai",
              },
              {
                key: "tier3" as const,
                label: "Needs review",
                summary: tierSummary.tier3,
                tone: "text-warning",
              },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilter(item.key)}
                className={cn(
                  "rounded-lg border px-2.5 py-2 text-left transition-colors hover:bg-muted/50",
                  filter === item.key && "border-primary/50 bg-primary/5",
                )}
              >
                <p className={cn("text-xs font-semibold", item.tone)}>{item.label}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {item.summary.count} payees · {item.summary.transactions.toLocaleString()} txns
                </p>
                <span className="mt-1 inline-block text-[10px] font-medium text-primary">
                  Expand
                </span>
              </button>
            ))}
          </div>
          <div className="space-y-1.5 rounded-lg border bg-muted/20 p-2.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-medium">Top categories</span>
              <span
                className={cn(
                  "tabular-nums",
                  tierSummary.uncategorized ? "text-warning" : "text-muted-foreground",
                )}
              >
                {tierSummary.uncategorized} uncategorized
              </span>
            </div>
            {categorySummary.length ? (
              categorySummary.map((category) => (
                <div key={category.name} className="space-y-0.5">
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span className="truncate">{category.name}</span>
                    <span>{category.percent}%</span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary/70"
                      style={{ width: `${category.percent}%` }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-[10px] text-muted-foreground">No categories assigned yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* 1-Click High Confidence Approval Banner */}
      {highConfUnapproved.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 shadow-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 font-bold text-xs">
              ⚡
            </div>
            <div>
              <p className="text-xs font-semibold text-emerald-950 dark:text-emerald-100">
                {highConfUnapproved.length} high-confidence payees recognized (
                {highConfUnapprovedTxns.toLocaleString()} transactions)
              </p>
              <p className="text-[11px] text-emerald-800/80 dark:text-emerald-300/80">
                Rules, memorized payees & high AI confidence matches ready for 1-click approval
              </p>
            </div>
          </div>
          <Button
            size="sm"
            className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs px-3 shadow-xs"
            onClick={() => setShowHighConfModal(true)}
          >
            ⚡ Review & Approve {highConfUnapproved.length} High-Confidence
          </Button>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-7">
        <StatTile label="Transactions" value={stats.transactions.toLocaleString()} />
        <StatTile
          label="Clusters"
          value={stats.clusters}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        <StatTile
          label="Auto matched"
          value={stats.autoMatched}
          active={filter === "ai"}
          onClick={() => setFilter("ai")}
        />
        <StatTile
          label="Needs review"
          value={stats.needsReview}
          tone="text-warning"
          active={filter === "review"}
          onClick={() => setFilter("review")}
        />
        <StatTile
          label="Approved"
          value={stats.approved}
          tone="text-emerald-600 dark:text-emerald-400"
          active={filter === "approved"}
          onClick={() => setFilter("approved")}
        />
        <StatTile
          label="New payees"
          value={stats.newPayees}
          active={filter === "new"}
          onClick={() => setFilter("new")}
        />
        <StatTile
          label="Ignored"
          value={stats.ignored}
          active={filter === "ignored"}
          onClick={() => setFilter("ignored")}
        />
      </div>

      {aiRemaining > 0 && (
        <div
          className="flex items-center gap-2 rounded-[10px] border border-ai/30 bg-ai/8 px-2.5 py-1.5 text-[11px]"
          role="status"
        >
          <Loader2 className="h-3 w-3 animate-spin text-ai" aria-hidden />
          Naming {aiRemaining.toLocaleString()} unresolved patterns in the background — you can keep
          editing, names fill in live.
        </div>
      )}

      {tierSummary.uncategorized > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-warning/30 bg-warning/5 px-2.5 py-2">
          <div>
            <p className="text-xs font-medium">
              {tierSummary.uncategorized} clusters still need a category
            </p>
            <p className="text-[10px] text-muted-foreground">
              Resolve only the exceptions before continuing.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={autoAssignByKeywords}
            >
              <Zap className="mr-1 h-3 w-3" /> Auto-assign by keywords
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => void askAiForRemaining()}
              disabled={categorizing}
            >
              {categorizing ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="mr-1 h-3 w-3" />
              )}
              {categorizing ? "Asking AI…" : "Ask AI for remaining"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={useUncategorizedDefault}
            >
              Use Uncategorized
            </Button>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative min-w-[180px] flex-1">
          <Search
            className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search payees or raw descriptions"
            aria-label="Search clusters"
            className="h-8 pl-7 text-xs"
          />
        </div>
        <div className="flex items-center gap-px rounded-lg border bg-muted/40 p-px">
          <button
            type="button"
            onClick={() => setViewMode("payee")}
            className={cn(
              "flex items-center gap-1 rounded-[7px] px-2 py-1 text-[11px] font-medium transition-colors",
              viewMode === "payee"
                ? "bg-background shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Grid className="h-3 w-3" /> By Payee ({visible.length})
          </button>
          <button
            type="button"
            onClick={() => setViewMode("category")}
            className={cn(
              "flex items-center gap-1 rounded-[7px] px-2 py-1 text-[11px] font-medium transition-colors",
              viewMode === "category"
                ? "bg-background shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Layers className="h-3 w-3" /> By Category ({categoryGroups.length})
          </button>
        </div>
        <div className="flex items-center gap-px rounded-lg border bg-muted/40 p-px">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-[7px] px-2 py-1 text-[11px] font-medium transition-colors",
                filter === f.key
                  ? "bg-background shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          onClick={onPolish}
          disabled={polishing}
        >
          <Sparkles className="mr-1 h-3 w-3" aria-hidden />
          {polishing ? "Polishing…" : "AI polish names"}
        </Button>
      </div>

      {/* Bulk bar */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-[10px] border border-primary/40 bg-primary/5 px-2 py-1.5">
          <span className="text-[11px] font-medium">{selectedIds.length} selected</span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => bulk({ status: "approved" })}
          >
            <Check className="mr-1 h-3 w-3" aria-hidden /> Approve
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
            onClick={() => bulk({ status: "review" })}
          >
            <RotateCcw className="mr-1 h-3 w-3" aria-hidden /> Move to Review
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            disabled={selectedIds.length < 2}
            onClick={() => {
              setClusters(mergeClusters(clusters, selectedIds));
              setSelectedIds([]);
            }}
          >
            <Merge className="mr-1 h-3 w-3" aria-hidden /> Merge
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => bulk({ status: "ignored" })}
          >
            <EyeOff className="mr-1 h-3 w-3" aria-hidden /> Ignore
          </Button>
          <div className="w-[180px]">
            <CategorySelect
              categories={categories}
              value={null}
              onChange={(v) => bulk({ category_id: v })}
              onCategoryCreated={onCategoryCreated}
            />
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7 text-xs"
            onClick={() => setSelectedIds([])}
          >
            Clear
          </Button>
        </div>
      )}

      {/* Main content list */}
      {viewMode === "category" ? (
        <div className="min-h-[240px] flex-1 overflow-auto space-y-2 rounded-xl border bg-muted/15 p-2">
          {categoryGroups.map((group) => {
            const isCatOpen = catExpanded[group.categoryName] ?? !group.categoryId;
            return (
              <div
                key={group.categoryName}
                className="rounded-xl border bg-card p-3 shadow-xs space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setCatExpanded((p) => ({ ...p, [group.categoryName]: !isCatOpen }))
                      }
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                    >
                      {isCatOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                    <span className="font-semibold text-sm">{group.categoryName}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {group.clusters.length} payees · {group.totalTxns} txns
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {money(group.totalAmount)}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 border-emerald-500/40 hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    onClick={() => {
                      const ids = new Set(group.clusters.map((c) => c.id));
                      setClusters(
                        clusters.map((c) => (ids.has(c.id) ? { ...c, status: "approved" } : c)),
                      );
                    }}
                  >
                    <Check className="h-3 w-3" /> Approve Category ({group.clusters.length})
                  </Button>
                </div>

                {isCatOpen && (
                  <div className="space-y-2 pt-1">
                    {group.clusters.map((c) => (
                      <ClusterCard
                        key={c.id}
                        cluster={c}
                        clusters={clusters}
                        categories={categories}
                        accounts={accounts}
                        currentAccountId={currentAccountId}
                        selected={selectedSet.has(c.id)}
                        expanded={!!expanded[c.id]}
                        onToggleSelect={() => toggleSelect(c.id)}
                        onToggleExpand={() => toggleExpand(c.id)}
                        onPatch={(p) => patch(c.id, p)}
                        onSplit={() => {
                          setSplitId(c.id);
                          setSplitPicked([]);
                        }}
                        onMergeWith={(targetId, memberDesc) =>
                          handleMergeWith(c.id, targetId, memberDesc)
                        }
                        onSaveToBackend={onSavePayee}
                        onCategoryCreated={onCategoryCreated}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* Virtualized payee list */
        <div
          ref={parentRef}
          className="min-h-[240px] flex-1 overflow-auto rounded-xl border bg-muted/15 p-1.5 overscroll-contain"
        >
          {visible.length === 0 ? (
            <p className="p-6 text-center text-xs text-muted-foreground">
              No clusters match this view.
            </p>
          ) : (
            <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
              {virtualizer.getVirtualItems().map((v) => {
                const c = visible[v.index]!;
                return (
                  <div
                    key={c.id}
                    ref={virtualizer.measureElement}
                    data-index={v.index}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${v.start}px)`,
                      padding: "3px",
                      willChange: "transform",
                    }}
                  >
                    <ClusterCard
                      cluster={c}
                      clusters={clusters}
                      categories={categories}
                      accounts={accounts}
                      currentAccountId={currentAccountId}
                      selected={selectedSet.has(c.id)}
                      expanded={!!expanded[c.id]}
                      onToggleSelect={() => toggleSelect(c.id)}
                      onToggleExpand={() => toggleExpand(c.id)}
                      onPatch={(p) => patch(c.id, p)}
                      onSplit={() => {
                        setSplitId(c.id);
                        setSplitPicked([]);
                      }}
                      onMergeWith={(targetId, memberDesc) =>
                        handleMergeWith(c.id, targetId, memberDesc)
                      }
                      onSaveToBackend={onSavePayee}
                      onCategoryCreated={onCategoryCreated}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between border-t pt-2.5">
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">
            {stats.needsReview > 0
              ? `${stats.needsReview} cluster${stats.needsReview === 1 ? "" : "s"} still need review`
              : "All clusters resolved"}
          </span>
          <Button size="sm" onClick={() => onContinue()}>
            Review transactions
          </Button>
          <Button size="sm" variant="secondary" onClick={approveAllAndContinue}>
            Approve all &amp; continue
          </Button>
        </div>
      </div>

      {/* Split drawer */}
      <Sheet open={!!splitTarget} onOpenChange={(o) => !o && setSplitId(null)}>
        <SheetContent className="flex w-full flex-col gap-3 sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="text-sm">Reassign from “{splitTarget?.name}”</SheetTitle>
            <SheetDescription className="text-xs">
              Pick the raw descriptions that were grouped wrongly, then split them into a new payee
              or move them into an existing payee group. Similarity shows how close each description
              is to the group representative.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-px overflow-auto rounded-[10px] border p-1">
            {splitTarget?.members.map((m) => {
              const sim = Math.round((cohesion.get(m.description) ?? 0) * 100);
              const picked = splitPicked.includes(m.description);
              return (
                <label
                  key={m.description}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[11px] hover:bg-muted/60",
                    picked && "bg-primary/5",
                  )}
                >
                  <Checkbox
                    checked={picked}
                    onCheckedChange={() =>
                      setSplitPicked((prev) =>
                        prev.includes(m.description)
                          ? prev.filter((d) => d !== m.description)
                          : [...prev, m.description],
                      )
                    }
                    aria-label={`Split out ${m.description}`}
                  />
                  <span className="min-w-0 flex-1 truncate font-mono">{m.description}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{m.count}×</span>
                  <span
                    className={cn(
                      "shrink-0 tabular-nums",
                      sim >= 80 ? "text-success" : sim >= 55 ? "text-warning" : "text-destructive",
                    )}
                  >
                    {sim}%
                  </span>
                </label>
              );
            })}
          </div>
          <div className="space-y-2 rounded-[10px] border bg-muted/30 p-2">
            <p className="text-[11px] font-medium">
              Move the picked descriptions into another payee
            </p>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <Select value={moveTargetId} onValueChange={setMoveTargetId}>
                  <SelectTrigger className="h-7 w-full text-xs" aria-label="Target payee group">
                    <SelectValue placeholder="Choose a payee group" />
                  </SelectTrigger>
                  <SelectContent>
                    {clusters
                      .filter((c) => c.id !== splitId)
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} · {clusterTxnCount(c)}×
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={splitPicked.length === 0 || !moveTargetId}
                onClick={() => {
                  setClusters(moveMembers(clusters, splitId!, splitPicked, moveTargetId));
                  setSplitId(null);
                  setSplitPicked([]);
                  setMoveTargetId("");
                }}
              >
                <Merge className="mr-1 h-3 w-3" aria-hidden /> Move {splitPicked.length}
              </Button>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSplitId(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={splitPicked.length === 0}
              onClick={() => {
                setClusters(splitCluster(clusters, splitId!, splitPicked));
                setSplitId(null);
                setSplitPicked([]);
              }}
            >
              Split {splitPicked.length} into new payee
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <HighConfApprovalModal
        open={showHighConfModal}
        onOpenChange={setShowHighConfModal}
        clustersToApprove={highConfUnapproved}
        categories={categories}
        onCategoryCreated={onCategoryCreated}
        onMoveToReview={(id) => patch(id, { status: "review" })}
        onConfirmApprove={(approvedItems) => {
          const approvedMap = new Map(approvedItems.map((item) => [item.id, item.category_id]));
          setClusters(
            clusters.map((c) => {
              if (approvedMap.has(c.id)) {
                return {
                  ...c,
                  status: "approved" as ClusterStatus,
                  category_id: approvedMap.get(c.id) ?? c.category_id,
                };
              }
              return c;
            }),
          );
        }}
      />
    </div>
  );
}

function HighConfApprovalModal({
  open,
  onOpenChange,
  clustersToApprove,
  categories,
  onConfirmApprove,
  onMoveToReview,
  onCategoryCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clustersToApprove: Cluster[];
  categories: CategoryItem[];
  onConfirmApprove: (approvedClusters: Array<{ id: string; category_id: string | null }>) => void;
  onMoveToReview?: (id: string) => void;
  onCategoryCreated?: (c: CategoryItem) => void;
}) {
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [clusterCategoryMap, setClusterCategoryMap] = useState<Record<string, string | null>>({});

  // Auto-resolve fallback categories based on keyword rules if unassigned
  const catMapByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) {
      map.set(c.name.toLowerCase().trim(), c.id);
    }
    return map;
  }, [categories]);

  const getAutoCategory = useCallback(
    (c: Cluster): string | null => {
      if (c.category_id) return c.category_id;
      const text =
        `${c.name} ${c.patterns.join(" ")} ${c.members.map((m) => m.description).join(" ")}`.toLowerCase();

      const rules: Array<[string[], string]> = [
        [
          [
            "swiggy",
            "zomato",
            "blinkit",
            "zepto",
            "instamart",
            "mcdonald",
            "dominos",
            "kfc",
            "starbucks",
            "bakery",
            "cafe",
            "restaurant",
            "dining",
            "food",
          ],
          "Food & Dining",
        ],
        [["grocery", "supermarket", "mart", "more retail", "nature basket"], "Groceries"],
        [
          [
            "uber",
            "ola",
            "rapido",
            "namma",
            "petrol",
            "hpcl",
            "bpcl",
            "iocl",
            "fuel",
            "shell",
            "parking",
            "metro",
            "irctc",
            "redbus",
            "indigo",
            "akasa",
            "airindia",
            "flight",
            "toll",
            "fastag",
          ],
          "Transport",
        ],
        [
          [
            "amazon",
            "flipkart",
            "myntra",
            "ajio",
            "meesho",
            "decathlon",
            "zara",
            "h&m",
            "retail",
            "shopping",
          ],
          "Shopping",
        ],
        [
          [
            "airtel",
            "jio",
            "vi ",
            "vodafone",
            "bescom",
            "tseb",
            "msedcl",
            "electricity",
            "water",
            "gas",
            "broadband",
            "netflix",
            "spotify",
            "youtube",
            "prime",
            "hotstar",
            "apple",
            "google",
          ],
          "Bills & Utilities",
        ],
        [
          [
            "zerodha",
            "groww",
            "coin",
            "angelone",
            "upstox",
            "indmoney",
            "mutual fund",
            "sip",
            "ppf",
            "nps",
            "lic",
            "hdfc life",
            "icici pru",
            "sbi life",
          ],
          "Investments",
        ],
        [["rent", "society", "maintenance"], "Housing"],
        [["salary", "payroll"], "Salary & Income"],
      ];

      for (const [keywords, catName] of rules) {
        if (keywords.some((k) => text.includes(k))) {
          const matchId = catMapByName.get(catName.toLowerCase());
          if (matchId) return matchId;
        }
      }
      return null;
    },
    [catMapByName],
  );

  // Initialize/sync categories for clusters when modal opens
  useEffect(() => {
    if (open) {
      const initial: Record<string, string | null> = {};
      for (const c of clustersToApprove) {
        initial[c.id] = c.category_id || getAutoCategory(c);
      }
      setClusterCategoryMap(initial);
      setExcludedIds(new Set());
    }
  }, [open, clustersToApprove, getAutoCategory]);

  const selectedClusters = useMemo(
    () => clustersToApprove.filter((c) => !excludedIds.has(c.id)),
    [clustersToApprove, excludedIds],
  );

  const totalTxns = useMemo(
    () => selectedClusters.reduce((acc, c) => acc + clusterTxnCount(c), 0),
    [selectedClusters],
  );

  const totalMoney = useMemo(
    () => selectedClusters.reduce((acc, c) => acc + clusterTotal(c), 0),
    [selectedClusters],
  );

  const toggleExclude = (id: string) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCategoryChange = (clusterId: string, newCategoryId: string | null) => {
    setClusterCategoryMap((prev) => ({ ...prev, [clusterId]: newCategoryId }));
  };

  const handleApprove = () => {
    const approved = selectedClusters.map((c) => ({
      id: c.id,
      category_id: clusterCategoryMap[c.id] ?? c.category_id,
    }));
    onConfirmApprove(approved);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-base">
            <Zap className="h-5 w-5 fill-current" />
            Approve High-Confidence Payees & Categories
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-3 py-1 text-xs">
          {/* Summary Strip */}
          <div className="grid grid-cols-3 gap-2 rounded-xl border bg-emerald-500/10 border-emerald-500/30 p-3 text-center">
            <div>
              <p className="text-[10px] uppercase font-medium text-muted-foreground">
                Payees Selected
              </p>
              <p className="text-base font-bold text-emerald-950 dark:text-emerald-100">
                {selectedClusters.length} / {clustersToApprove.length}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-medium text-muted-foreground">
                Transactions
              </p>
              <p className="text-base font-bold text-emerald-950 dark:text-emerald-100">
                {totalTxns.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-medium text-muted-foreground">Total Value</p>
              <p className="text-base font-bold text-emerald-950 dark:text-emerald-100">
                {money(totalMoney)}
              </p>
            </div>
          </div>

          <p className="text-muted-foreground text-[11px]">
            Review payees and assigned categories below. You can change categories or uncheck any
            payee before approving:
          </p>

          {/* Scrollable Payee List */}
          <div className="flex-1 overflow-auto rounded-xl border bg-card p-2 space-y-2 max-h-[380px]">
            {clustersToApprove.map((c) => {
              const isChecked = !excludedIds.has(c.id);
              const currentCatId = clusterCategoryMap[c.id] ?? c.category_id;
              const count = clusterTxnCount(c);
              const total = clusterTotal(c);

              return (
                <div
                  key={c.id}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-3 rounded-lg border p-2.5 transition-colors",
                    isChecked
                      ? "bg-background border-emerald-500/30 shadow-xs"
                      : "bg-muted/40 opacity-60 border-border",
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-[240px] flex-1">
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => toggleExclude(c.id)}
                      aria-label={`Include ${c.name}`}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs truncate">{c.name}</span>
                        <MatchSourceBadge source={c.source} />
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {c.members[0]?.description}
                      </p>
                    </div>
                  </div>

                  {/* Category Selector Dropdown */}
                  <div className="w-[190px] shrink-0">
                    <CategorySelect
                      categories={categories}
                      value={currentCatId}
                      onChange={(v) => handleCategoryChange(c.id, v)}
                      onCategoryCreated={onCategoryCreated}
                    />
                  </div>

                  <div className="text-right shrink-0 text-xs min-w-[80px]">
                    <p className="font-semibold tabular-nums">{money(total)}</p>
                    <p className="text-[10px] text-muted-foreground">{count} txns</p>
                  </div>

                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px] text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 shrink-0"
                    onClick={() => {
                      onMoveToReview?.(c.id);
                      toggleExclude(c.id);
                    }}
                    title="Move back to Needs Review pane for manual editing"
                  >
                    <RotateCcw className="mr-1 h-3 w-3" aria-hidden />
                    Move to Review
                  </Button>
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2.5 border-t">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs gap-1.5 shadow"
            disabled={selectedClusters.length === 0}
            onClick={handleApprove}
          >
            <Check className="h-3.5 w-3.5" />
            Approve {selectedClusters.length} Payees ({totalTxns} txns)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
