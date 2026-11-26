import {
  Profiler,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  ProcessingStatus,
  TransactionFooter,
  TransactionTableHeader,
  TransactionToolbar,
} from "./review/toolbar";
import { BulkEditBar } from "./review/bulk-bar";
import { VirtualizedTransactionList } from "./review/virtualized-list";
import { TransactionDetailDrawer } from "./review/detail-drawer";
import { useEditHistory, type ReviewSnapshot } from "./review/history";
import { ProfilerOverlay, recordCommit, setProfiling } from "./review/profiler";
import type { RowCallbacks } from "./review/transaction-row";
import type { Category, ReviewRow, RowFilter } from "./review/types";
import { AlertTriangle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { EconomicType } from "@/lib/statement-domain";
import type { CorrectionScope } from "@/lib/statement-corrections";
import { Button } from "@/components/ui/button";
import { AccountFormDialog } from "@/components/account-form-dialog";

export type { ReviewRow } from "./review/types";

const PAGE_SIZE = 400;

/**
 * Final review step.
 *
 * State is normalized (`byId` + `orderedIds` + a `selectedIds` Set) so a single
 * inline edit only touches one map entry and only that memoized row rerenders.
 * The parent is never updated per keystroke — the final array is handed back
 * once, on save. Bulk edits, undo/redo and cursor prefetching all operate on
 * the same normalized store.
 */
export function ReviewStep({
  rows: initialRows,
  categories,
  accounts,
  saving,
  onBack,
  onSave,
}: {
  rows: ReviewRow[];
  categories: Category[];
  accounts: Array<{ id: string; name: string; category: string }>;
  saving: boolean;
  onBack: () => void;
  onSave: (rows: ReviewRow[]) => void;
}) {
  const [byId, setById] = useState<Record<string, ReviewRow>>({});
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RowFilter>("all");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [loadedCount, setLoadedCount] = useState(PAGE_SIZE);
  const [profiling, setProfilingState] = useState(false);
  const [addingCard, setAddingCard] = useState(false);
  const [addedAccounts, setAddedAccounts] = useState<
    Array<{ id: string; name: string; category: string }>
  >([]);
  const [correctionScopeByGroup, setCorrectionScopeByGroup] = useState<
    Record<string, CorrectionScope>
  >({});
  const [, startTransition] = useTransition();
  const seeded = useRef<ReviewRow[] | null>(null);

  // Latest store, readable from callbacks without re-creating them.
  const latest = useRef({ byId, selectedIds });
  latest.current = { byId, selectedIds };

  const applySnapshot = useCallback((snap: ReviewSnapshot) => {
    setById(snap.byId);
    setSelectedIds(snap.selectedIds);
  }, []);
  const history = useEditHistory(applySnapshot);

  const snapshot = useCallback(
    (label: string): ReviewSnapshot => ({
      byId: latest.current.byId,
      selectedIds: new Set(latest.current.selectedIds),
      label,
    }),
    [],
  );

  // Seed the normalized store once per parsed batch.
  useEffect(() => {
    if (seeded.current === initialRows) return;
    seeded.current = initialRows;
    const map: Record<string, ReviewRow> = {};
    const ids: string[] = [];
    const sel = new Set<string>();
    for (const r of initialRows) {
      map[r.key] = r;
      ids.push(r.key);
      if (r.include) sel.add(r.key);
    }
    setById(map);
    setOrderedIds(ids);
    setSelectedIds(sel);
    setLoadedCount(PAGE_SIZE);
    history.reset();
  }, [initialRows, history]);

  // Debounced + deferred search so typing never blocks scrolling.
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => startTransition(() => setDebouncedQuery(query)), 200);
    return () => clearTimeout(t);
  }, [query]);
  const deferredQuery = useDeferredValue(debouncedQuery);

  const payees = useMemo(() => {
    const set = new Set<string>();
    for (const r of initialRows) {
      const p = r.payee?.trim();
      if (p) set.add(p);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [initialRows]);

  const filteredIds = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (!q && filter === "all") return orderedIds;
    return orderedIds.filter((id) => {
      const r = byId[id];
      if (!r) return false;
      if (filter === "included" && !selectedIds.has(id)) return false;
      if (filter === "excluded" && selectedIds.has(id)) return false;
      if (filter === "lowConfidence" && r.confidence >= 0.6) return false;
      if (filter === "duplicates" && !r.duplicate) return false;
      if (!q) return true;
      return (
        r.description.toLowerCase().includes(q) ||
        r.payee.toLowerCase().includes(q) ||
        String(r.amount).includes(q)
      );
    });
  }, [orderedIds, byId, filter, deferredQuery, selectedIds]);

  /** Rows a bulk action applies to: currently shown AND included. */
  const bulkTargets = useMemo(
    () => filteredIds.filter((id) => selectedIds.has(id)),
    [filteredIds, selectedIds],
  );

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const id of selectedIds) {
      const r = byId[id];
      if (!r) continue;
      if (r.type === "income") income += Math.abs(r.amount);
      else if (r.type === "expense") expense += Math.abs(r.amount);
    }
    return { income, expense };
  }, [selectedIds, byId]);

  const exceptionGroups = useMemo(() => {
    const unknown = new Map<string, string[]>();
    const cards = new Map<string, string[]>();
    for (const id of selectedIds) {
      const row = byId[id];
      if (!row) continue;
      if (row.economic_type === "UNKNOWN") {
        const key = row.pattern || row.payee || "Unknown credit";
        const ids = unknown.get(key) ?? [];
        ids.push(id);
        unknown.set(key, ids);
      }
      if (row.economic_type === "CREDIT_CARD_PAYMENT" && !row.destination_account_id) {
        const identity = row.pattern || row.payee || "Credit card payment";
        const reference = (row.original_reference ?? "").replace(/[^a-zA-Z0-9]/g, "").slice(-12);
        const key = `${identity} · ₹${row.amount.toLocaleString("en-IN")}${reference ? ` · ${reference}` : ""}`;
        const ids = cards.get(key) ?? [];
        ids.push(id);
        cards.set(key, ids);
      }
    }
    return { unknown: [...unknown.entries()], cards: [...cards.entries()] };
  }, [selectedIds, byId]);
  const reviewQuestionCount = exceptionGroups.unknown.length + exceptionGroups.cards.length;
  const visibleUnknownGroups = exceptionGroups.unknown.slice(0, 5);
  const visibleCardGroups = exceptionGroups.cards.slice(0, 5);
  const hiddenReviewCount = Math.max(
    0,
    reviewQuestionCount - visibleUnknownGroups.length - visibleCardGroups.length,
  );
  const creditCards = useMemo(() => {
    const byId = new Map([...accounts, ...addedAccounts].map((account) => [account.id, account]));
    return [...byId.values()].filter((account) => account.category === "credit_card");
  }, [accounts, addedAccounts]);

  const answerEconomicGroup = useCallback(
    (ids: string[], economicType: EconomicType, scope: CorrectionScope) => {
      history.record(snapshot("answer economic question"));
      setById((prev) => {
        const next = { ...prev };
        for (const id of ids) {
          const row = next[id];
          if (!row) continue;
          next[id] = {
            ...row,
            economic_type: economicType,
            economic_confidence: 1,
            economic_source: "user_confirmed",
            economic_reasons: ["The user answered the grouped import question."],
            economic_correction_scope: scope,
          };
        }
        return next;
      });
    },
    [history, snapshot],
  );

  const answerCardGroup = useCallback(
    (ids: string[], destinationAccountId: string) => {
      history.record(snapshot("select destination card"));
      setById((prev) => {
        const next = { ...prev };
        for (const id of ids) {
          const row = next[id];
          if (!row) continue;
          next[id] = {
            ...row,
            type: "transfer",
            transfer_account_id: destinationAccountId,
            destination_account_id: destinationAccountId,
            economic_type: "CREDIT_CARD_PAYMENT",
            economic_confidence: 1,
            economic_source: "user_confirmed_card",
            economic_reasons: ["The user selected the destination credit-card account."],
          };
        }
        return next;
      });
    },
    [history, snapshot],
  );

  const callbacks = useMemo<RowCallbacks>(
    () => ({
      onToggleSelect: (id) => {
        history.record(snapshot("include toggle"));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      },
      onPayeeChange: (id, payee) => {
        history.record(snapshot("payee edit"));
        setById((prev) =>
          prev[id] ? { ...prev, [id]: { ...prev[id]!, payee, source: "manual" } } : prev,
        );
      },
      onCategoryChange: (id, category_id) => {
        history.record(snapshot("category edit"));
        setById((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id]!, category_id } } : prev));
      },
      onOpenDetail: (id) => setDetailId(id),
    }),
    [history, snapshot],
  );

  const visibleAllIncluded = useMemo(
    () => filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id)),
    [filteredIds, selectedIds],
  );

  const setVisibleIncluded = useCallback(
    (on: boolean) => {
      history.record(snapshot(on ? "include shown" : "exclude shown"));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of filteredIds) {
          if (on) next.add(id);
          else next.delete(id);
        }
        return next;
      });
    },
    [filteredIds, history, snapshot],
  );

  const toggleVisible = useCallback(() => {
    setVisibleIncluded(!filteredIds.every((id) => selectedIds.has(id)));
  }, [filteredIds, selectedIds, setVisibleIncluded]);

  /** Apply a patch to every bulk target in a single state commit. */
  const bulkPatch = useCallback(
    (label: string, patch: (row: ReviewRow) => Partial<ReviewRow>) => {
      if (bulkTargets.length === 0) return;
      history.record(snapshot(label));
      startTransition(() => {
        setById((prev) => {
          const next = { ...prev };
          for (const id of bulkTargets) {
            const row = next[id];
            if (row) next[id] = { ...row, ...patch(row) };
          }
          return next;
        });
      });
    },
    [bulkTargets, history, snapshot],
  );

  const loadMore = useCallback(() => {
    startTransition(() => setLoadedCount((n) => n + PAGE_SIZE));
  }, []);

  const undo = useCallback(() => history.undo(snapshot("")), [history, snapshot]);
  const redo = useCallback(() => history.redo(snapshot("")), [history, snapshot]);

  // Keyboard undo/redo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const toggleProfiling = useCallback(() => {
    setProfilingState((v) => {
      setProfiling(!v);
      return !v;
    });
  }, []);

  const handleSave = useCallback(() => {
    const final = orderedIds
      .map((id) => byId[id])
      .filter((r): r is ReviewRow => !!r)
      .map((r) => ({ ...r, include: selectedIds.has(r.key) }));
    onSave(final);
  }, [orderedIds, byId, selectedIds, onSave]);

  const detailRow = detailId
    ? { ...(byId[detailId] as ReviewRow), include: selectedIds.has(detailId) }
    : null;

  const grid = (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border">
      <TransactionTableHeader />
      {filteredIds.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6 text-xs text-muted-foreground">
          No transactions match this filter.
        </div>
      ) : (
        <VirtualizedTransactionList
          ids={filteredIds}
          byId={byId}
          selectedIds={selectedIds}
          categories={categories}
          payees={payees}
          callbacks={callbacks}
          loadedCount={loadedCount}
          onLoadMore={loadMore}
        />
      )}
      {profiling && (
        <ProfilerOverlay
          rowsRendered={Math.min(filteredIds.length, loadedCount)}
          onClose={toggleProfiling}
        />
      )}
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
      {reviewQuestionCount > 0 && (
        <section className="max-h-52 space-y-2 overflow-y-auto rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            {reviewQuestionCount} grouped item{reviewQuestionCount === 1 ? "" : "s"} need review
          </div>
          <p className="text-muted-foreground">
            Optional: answer the highest-priority items now, or save all transactions and finish
            them later in Settings.
          </p>
          {visibleUnknownGroups.map(([label, ids]) => (
            <div key={`unknown:${label}`} className="flex items-center justify-between gap-3">
              <span className="min-w-0 flex-1 truncate">
                What are the {ids.length} credit{ids.length === 1 ? "" : "s"} from {label}?
              </span>
              <Select
                value={correctionScopeByGroup[label] ?? "future"}
                onValueChange={(value) =>
                  setCorrectionScopeByGroup((current) => ({
                    ...current,
                    [label]: value as CorrectionScope,
                  }))
                }
              >
                <SelectTrigger className="h-8 w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="transaction">This import only</SelectItem>
                  <SelectItem value="future">Future similar</SelectItem>
                  <SelectItem value="existing_future">Existing + future</SelectItem>
                </SelectContent>
              </Select>
              <Select
                onValueChange={(value) =>
                  answerEconomicGroup(
                    ids,
                    value as EconomicType,
                    correctionScopeByGroup[label] ?? "future",
                  )
                }
              >
                <SelectTrigger className="h-8 w-52">
                  <SelectValue placeholder="Choose meaning" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INCOME">Income / reimbursement</SelectItem>
                  <SelectItem value="REFUND">Refund</SelectItem>
                  <SelectItem value="INVESTMENT_REDEMPTION">Investment redemption</SelectItem>
                  <SelectItem value="BROKERAGE_SETTLEMENT">Brokerage settlement</SelectItem>
                  <SelectItem value="INVESTMENT_INCOME">Dividend / investment income</SelectItem>
                  <SelectItem value="CASH_DEPOSIT">Cash deposit</SelectItem>
                  <SelectItem value="VERIFICATION_TRANSACTION">Verification transaction</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
          {visibleCardGroups.map(([label, ids]) => (
            <div key={`card:${label}`} className="flex items-center justify-between gap-3">
              <span className="min-w-0 flex-1 truncate">
                Which card received the {ids.length} payment{ids.length === 1 ? "" : "s"} to {label}
                ?
              </span>
              <Select onValueChange={(value) => answerCardGroup(ids, value)}>
                <SelectTrigger className="h-8 w-52">
                  <SelectValue placeholder="Choose credit card" />
                </SelectTrigger>
                <SelectContent>
                  {creditCards.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="px-0"
                onClick={() => setAddingCard(true)}
              >
                Add card
              </Button>
            </div>
          ))}
          {exceptionGroups.cards.length > 0 && creditCards.length === 0 && (
            <p className="text-amber-700">
              No card account exists yet.{" "}
              <button type="button" className="underline" onClick={() => setAddingCard(true)}>
                Add one now
              </button>
              , or save and answer later.
            </p>
          )}
          {hiddenReviewCount > 0 && (
            <p className="text-muted-foreground">
              {hiddenReviewCount} lower-priority group{hiddenReviewCount === 1 ? "" : "s"} will be
              saved to the review inbox.
            </p>
          )}
        </section>
      )}
      <ProcessingStatus
        included={selectedIds.size}
        excluded={orderedIds.length - selectedIds.size}
        income={totals.income}
        expense={totals.expense}
      />
      <TransactionToolbar
        query={query}
        onQueryChange={setQuery}
        filter={filter}
        onFilterChange={setFilter}
        visibleCount={filteredIds.length}
        allVisibleIncluded={visibleAllIncluded}
        onToggleVisible={toggleVisible}
      />
      <BulkEditBar
        targetCount={bulkTargets.length}
        categories={categories}
        payees={payees}
        onSetCategory={(id) => bulkPatch("set category", () => ({ category_id: id }))}
        onSetPayee={(name) => bulkPatch("merge payees", () => ({ payee: name, source: "manual" }))}
        onIncludeAll={() => setVisibleIncluded(true)}
        onExcludeAll={() => setVisibleIncluded(false)}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={undo}
        onRedo={redo}
        profiling={profiling}
        onToggleProfiling={toggleProfiling}
      />
      {profiling ? (
        <Profiler id="review-grid" onRender={(_id, _phase, actual) => recordCommit(actual)}>
          {grid}
        </Profiler>
      ) : (
        grid
      )}
      <TransactionFooter
        includedCount={selectedIds.size}
        saving={saving}
        blocked={false}
        onBack={onBack}
        onSave={handleSave}
      />
      <TransactionDetailDrawer
        row={detailRow?.key ? detailRow : null}
        categories={categories}
        onClose={() => setDetailId(null)}
      />
      <AccountFormDialog
        open={addingCard}
        onOpenChange={setAddingCard}
        initial={{ category: "credit_card", is_liability: true }}
        onSaved={(account) => setAddedAccounts((current) => [...current, account])}
      />
    </div>
  );
}
