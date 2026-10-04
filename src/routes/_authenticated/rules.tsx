import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import {
  AlertCircle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Loader2,
  Pencil,
  Play,
  Plus,
  Trash2,
  WandSparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  listRuleGroups,
  createRuleGroup,
  saveRule,
  deleteRule,
  applyRulesNow,
} from '@/lib/rules.functions';
import { listCategories } from '@/lib/finance.functions';
import { queryKeys } from '@/lib/query-keys';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  CategorySelectPopover,
  type CategoryItem,
  getCategoryHierarchyLabel,
} from '@/components/category-select-popover';

export const Route = createFileRoute('/_authenticated/rules')({
  head: () => ({ meta: [{ title: 'Rules & Automations — Paisa' }] }),
  component: RulesPage,
});

type Condition = {
  field: string;
  operator: string;
  value: string;
  valueSecondary: string;
  inverted: boolean;
};

type ActionDraft = {
  action: string;
  value: string;
};

type Draft = {
  id?: string;
  title: string;
  kind: 'llm_context' | 'deterministic';
  groupId?: string;
  instruction: string;
  conditions: Condition[];
  strictMode: boolean;
  actions: ActionDraft[];
  triggerMoment: 'create' | 'update' | 'create_and_update' | 'manual_only' | 'scheduled';
  scheduleCron: string;
};

const newCondition = (): Condition => ({
  field: 'merchant',
  operator: 'contains',
  value: '',
  valueSecondary: '',
  inverted: false,
});

const newAction = (): ActionDraft => ({
  action: 'set_category',
  value: '',
});

const makeEmpty = (): Draft => ({
  title: '',
  kind: 'llm_context',
  instruction: '',
  conditions: [newCondition()],
  strictMode: true,
  actions: [newAction()],
  triggerMoment: 'create',
  scheduleCron: '',
});

const TRIGGERS = [
  ['merchant', 'Merchant / description'],
  ['amount', 'Amount'],
  ['account_id', 'Source account'],
  ['transfer_account_id', 'Destination account'],
  ['category_id', 'Category'],
  ['type', 'Transaction type'],
  ['memo', 'Memo'],
  ['note', 'Notes'],
  ['tags', 'Tags'],
  ['payment_method', 'Payment method'],
  ['check_number', 'Check number'],
  ['cleared_status', 'Cleared status'],
  ['is_flagged', 'Flagged'],
  ['is_favorite', 'Favorite'],
  ['is_reviewed', 'Reviewed'],
  ['is_read', 'Read'],
  ['budget_id', 'Budget'],
  ['tax_code', 'Tax code'],
  ['txn_date', 'Transaction date'],
];

const OPERATORS = [
  ['equals', 'Equals'],
  ['contains', 'Contains'],
  ['starts_with', 'Starts with'],
  ['ends_with', 'Ends with'],
  ['greater_than', 'Greater than'],
  ['greater_than_or_equal', 'Greater than or equal'],
  ['less_than', 'Less than'],
  ['less_than_or_equal', 'Less than or equal'],
  ['between', 'Between'],
  ['is_empty', 'Is empty'],
  ['is_not_empty', 'Is not empty'],
  ['in_list', 'Is in comma-separated list'],
  ['matches_regex', 'Matches regular expression'],
];

const ACTIONS = [
  ['set_category', 'Set category'],
  ['clear_category', 'Clear category'],
  ['set_description', 'Set description / merchant'],
  ['append_description', 'Append description with'],
  ['prepend_description', 'Prepend description with'],
  ['set_memo', 'Set memo'],
  ['append_memo', 'Append memo with'],
  ['prepend_memo', 'Prepend memo with'],
  ['set_note', 'Set notes'],
  ['append_note', 'Append notes with'],
  ['prepend_note', 'Prepend notes with'],
  ['clear_note', 'Remove all notes'],
  ['description_to_note', 'Replace notes with description'],
  ['append_description_to_note', 'Append description to notes'],
  ['note_to_description', 'Replace description with notes'],
  ['append_note_to_description', 'Append notes to description'],
  ['add_tag', 'Add tag'],
  ['remove_tag', 'Remove tag'],
  ['remove_all_tags', 'Remove all tags'],
  ['set_source_account', 'Set source account'],
  ['set_transfer_account', 'Set destination account'],
  ['clear_transfer_account', 'Clear destination account'],
  ['swap_accounts', 'Switch source and destination accounts'],
  ['convert_type', 'Convert transaction type'],
  ['set_budget', 'Set budget'],
  ['clear_budget', 'Clear budget'],
  ['set_payment_method', 'Set payment method'],
  ['set_check_number', 'Set check number'],
  ['set_tax_code', 'Set tax code'],
  ['set_cleared_status', 'Set cleared status'],
  ['set_flagged', 'Set flagged'],
  ['set_favorite', 'Set favorite'],
  ['set_reviewed', 'Set reviewed'],
  ['set_read', 'Set read'],
];

type ExecutionState = {
  open: boolean;
  ruleId: string;
  title: string;
  stage: 'preparing' | 'scanning' | 'applying' | 'refreshing' | 'complete' | 'failed';
  processed: number;
  matched: number;
  changed: number;
  error?: string;
};

const EXECUTION_STEPS = [
  ['preparing', 'Preparing rule'],
  ['scanning', 'Scanning and matching transactions'],
  ['applying', 'Applying rule actions'],
  ['refreshing', 'Refreshing transaction data'],
] as const;

function RulesPage() {
  const qc = useQueryClient();
  const list = useServerFn(listRuleGroups);
  const listCat = useServerFn(listCategories);
  const addGroup = useServerFn(createRuleGroup);
  const save = useServerFn(saveRule);
  const remove = useServerFn(deleteRule);
  const run = useServerFn(applyRulesNow);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(makeEmpty);
  const [execution, setExecution] = useState<ExecutionState | null>(null);

  const q = useQuery({ queryKey: queryKeys.rules.groups(), queryFn: () => list() });
  const { data: rawCategories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => listCat(),
    staleTime: 60 * 1000,
  });

  const categories = useMemo(
    () => (Array.isArray(rawCategories) ? (rawCategories as CategoryItem[]) : []),
    [rawCategories]
  );

  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const resolveCategoryLabel = (val: string) => {
    if (!val) return '';
    const byId = categoryMap.get(val);
    if (byId) return getCategoryHierarchyLabel(byId.id, categories);
    const byName = categories.find((c) => c.name.toLowerCase() === val.toLowerCase());
    if (byName) return getCategoryHierarchyLabel(byName.id, categories);
    return val;
  };

  const refresh = () => qc.invalidateQueries({ queryKey: queryKeys.rules.all });

  const saving = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: draft.id,
          title: draft.title,
          groupId: draft.groupId,
          kind: draft.kind,
          naturalLanguageInstruction: draft.kind === 'llm_context' ? draft.instruction : null,
          triggerMoment: draft.triggerMoment,
          scheduleCron: draft.scheduleCron || null,
          strictMode: draft.strictMode,
          stopProcessing: false,
          triggers:
            draft.kind === 'deterministic'
              ? draft.conditions.map((c) => ({
                  field: c.field,
                  operator: c.operator,
                  value: c.value,
                  value_secondary: c.valueSecondary || null,
                  is_inverted: c.inverted,
                }))
              : [],
          actions:
            draft.kind === 'deterministic'
              ? draft.actions.map((a) => ({
                  action_type: a.action,
                  action_value: a.value,
                }))
              : [],
        },
      }),
    onSuccess: () => {
      toast.success(draft.id ? 'Rule updated' : 'Rule saved');
      setOpen(false);
      setDraft(makeEmpty());
      refresh();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const editRule = (rule: any, groupId: string) => {
    const triggers = (rule.rule_triggers ?? []).sort(
      (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
    );
    const actions = (rule.rule_actions ?? []).sort(
      (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
    );
    setDraft({
      id: rule.id,
      title: rule.title ?? '',
      kind: rule.kind,
      groupId,
      instruction: rule.natural_language_instruction ?? '',
      conditions: triggers.length
        ? triggers.map((t: any) => ({
            field: t.field,
            operator: t.operator,
            value: t.value ?? '',
            valueSecondary: t.value_secondary ?? '',
            inverted: !!t.is_inverted,
          }))
        : [newCondition()],
      strictMode: rule.strict_mode !== false,
      actions: actions.length
        ? actions.map((a: any) => ({ action: a.action_type, value: a.action_value ?? '' }))
        : [newAction()],
      triggerMoment: rule.trigger_moment ?? 'create',
      scheduleCron: rule.schedule_cron ?? '',
    });
    setOpen(true);
  };

  const runRule = async (rule: { id: string; title: string }) => {
    setExecution({
      open: true,
      ruleId: rule.id,
      title: rule.title,
      stage: 'preparing',
      processed: 0,
      matched: 0,
      changed: 0,
    });
    try {
      await new Promise((resolve) => setTimeout(resolve, 150));
      setExecution((s) => s && { ...s, stage: 'scanning' });
      const preview = await run({ data: { ruleId: rule.id, dryRun: true } });
      setExecution(
        (s) => s && { ...s, stage: 'applying', processed: preview.processedCount, matched: preview.changedCount }
      );
      const result = preview.changedCount ? await run({ data: { ruleId: rule.id, dryRun: false } }) : preview;
      setExecution(
        (s) =>
          s && {
            ...s,
            stage: 'refreshing',
            processed: result.processedCount,
            matched: preview.changedCount,
            changed: result.changedCount,
          }
      );
      await qc.invalidateQueries({ queryKey: queryKeys.transactions.all });
      await refresh();
      setExecution((s) => s && { ...s, stage: 'complete' });
      toast.success(`Updated ${result.changedCount} of ${result.processedCount} transactions`);
    } catch (error: any) {
      setExecution((s) => s && { ...s, stage: 'failed', error: String(error?.message ?? error) });
      toast.error('Rule execution failed');
    }
  };

  const groups = (q.data ?? []) as any[];

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Rules & Automations</h1>
          <p className="text-sm text-muted-foreground">
            Deterministic rules run before AI. Natural-language rules guide statement classification.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              const title = prompt('Group name');
              if (title) {
                await addGroup({ data: { title } });
                refresh();
              }
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            New group
          </Button>
          <Button
            onClick={() => {
              setDraft(makeEmpty());
              setOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            New rule
          </Button>
        </div>
      </div>

      {q.isLoading && <p>Loading rules…</p>}
      {!q.isLoading && !groups.length && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No rules yet. Add a natural-language preference or a deterministic automation.
          </CardContent>
        </Card>
      )}

      {groups.map((g) => (
        <Card key={g.id}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {g.title}
              <Badge variant="secondary">{g.rules?.length ?? 0} rules</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(g.rules ?? [])
              .sort((a: any, b: any) => a.sort_order - b.sort_order)
              .map((r: any) => {
                const isExecuting =
                  !!execution &&
                  execution.ruleId === r.id &&
                  execution.stage !== 'complete' &&
                  execution.stage !== 'failed';

                return (
                  <div
                    key={r.id}
                    className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2 font-medium">
                        {r.kind === 'llm_context' ? (
                          <Bot className="h-4 w-4 text-primary shrink-0" />
                        ) : (
                          <WandSparkles className="h-4 w-4 text-primary shrink-0" />
                        )}
                        <span className="truncate">{r.title}</span>
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          {r.trigger_moment.replaceAll('_', ' ')}
                        </Badge>
                      </div>

                      {r.kind === 'llm_context' ? (
                        <p className="text-sm text-muted-foreground">
                          {r.natural_language_instruction}
                        </p>
                      ) : (
                        <div className="space-y-1 text-xs text-muted-foreground">
                          <p>
                            <span className="font-semibold text-foreground">WHEN: </span>
                            {(r.rule_triggers ?? [])
                              .map((t: any) => {
                                const valLabel =
                                  t.field === 'category_id'
                                    ? resolveCategoryLabel(t.value)
                                    : `“${t.value}”`;
                                return `${t.is_inverted ? 'NOT ' : ''}${t.field} ${t.operator} ${valLabel}`;
                              })
                              .join(r.strict_mode ? ' AND ' : ' OR ')}
                          </p>
                          {(r.rule_actions ?? []).length > 0 && (
                            <p className="flex items-center gap-1 text-foreground/80 font-medium">
                              <ArrowRight className="h-3 w-3 text-primary shrink-0" />
                              <span>THEN: </span>
                              {(r.rule_actions ?? [])
                                .map((a: any) => {
                                  if (a.action_type === 'set_category') {
                                    return `Set category to “${resolveCategoryLabel(a.action_value)}”`;
                                  }
                                  const def = ACTIONS.find(([act]) => act === a.action_type);
                                  return `${def ? def[1] : a.action_type} ${a.action_value ? `“${a.action_value}”` : ''}`;
                                })
                                .join(', ')}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 self-end sm:self-auto shrink-0">
                      {r.kind === 'deterministic' && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={
                            !!execution &&
                            execution.stage !== 'complete' &&
                            execution.stage !== 'failed'
                          }
                          onClick={() => void runRule(r)}
                        >
                          {isExecuting ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <Play className="mr-1 h-3 w-3" />
                          )}
                          Run now
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => editRule(r, g.id)}>
                        <Pencil className="mr-1 h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={async () => {
                          if (confirm(`Delete ${r.title}?`)) {
                            await remove({ data: { id: r.id } });
                            refresh();
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
          </CardContent>
        </Card>
      ))}

      {execution && (
        <Dialog
          open={execution.open}
          onOpenChange={(v) => {
            if (!v && (execution.stage === 'complete' || execution.stage === 'failed')) {
              setExecution(null);
            }
          }}
        >
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Running “{execution.title}”</DialogTitle>
            </DialogHeader>
            <div className="space-y-5">
              <div>
                <div className="mb-2 flex justify-between text-sm">
                  <span>
                    {execution.stage === 'complete'
                      ? 'Rule completed'
                      : execution.stage === 'failed'
                      ? 'Rule failed'
                      : EXECUTION_STEPS.find((s) => s[0] === execution.stage)?.[1]}
                  </span>
                  <span className="tabular-nums">
                    {execution.stage === 'complete'
                      ? 100
                      : execution.stage === 'failed'
                      ? 100
                      : Math.max(
                          8,
                          (EXECUTION_STEPS.findIndex((s) => s[0] === execution.stage) + 1) * 22
                        )}
                    %
                  </span>
                </div>
                <Progress
                  value={
                    execution.stage === 'complete' || execution.stage === 'failed'
                      ? 100
                      : Math.max(
                          8,
                          (EXECUTION_STEPS.findIndex((s) => s[0] === execution.stage) + 1) * 22
                        )
                  }
                />
              </div>
              <ol className="space-y-3">
                {EXECUTION_STEPS.map(([key, label], index) => {
                  const current = EXECUTION_STEPS.findIndex((s) => s[0] === execution.stage);
                  const done = execution.stage === 'complete' || current > index;
                  const active = current === index && execution.stage !== 'failed';
                  return (
                    <li key={key} className="flex items-start gap-3">
                      <span className="mt-0.5">
                        {done ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        ) : active ? (
                          <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        ) : (
                          <span className="block h-5 w-5 rounded-full border" />
                        )}
                      </span>
                      <div>
                        <p className={done || active ? 'font-medium' : 'text-muted-foreground'}>
                          {label}
                        </p>
                        {key === 'scanning' && execution.processed > 0 && (
                          <p className="text-xs text-muted-foreground">
                            Inspected {execution.processed.toLocaleString()} transactions ·{' '}
                            {execution.matched.toLocaleString()} matched
                          </p>
                        )}
                        {key === 'applying' &&
                          execution.stage !== 'preparing' &&
                          execution.stage !== 'scanning' && (
                            <p className="text-xs text-muted-foreground">
                              {execution.changed.toLocaleString()} transactions updated
                            </p>
                          )}
                      </div>
                    </li>
                  );
                })}
              </ol>
              {execution.stage === 'failed' && (
                <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="h-5 w-5 shrink-0" />
                  <span>{execution.error || 'The rule could not be completed.'}</span>
                </div>
              )}
              {execution.stage === 'complete' && (
                <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
                  <strong>{execution.changed.toLocaleString()}</strong> of{' '}
                  <strong>{execution.processed.toLocaleString()}</strong> inspected transactions
                  were updated.
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                disabled={execution.stage !== 'complete' && execution.stage !== 'failed'}
                onClick={() => setExecution(null)}
              >
                {execution.stage === 'failed' ? 'Close' : 'Done'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Create / Edit Rule Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[min(96vw,76rem)] max-w-none sm:!max-w-6xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{draft.id ? 'Edit rule' : 'Create rule'}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-5">
            <div>
              <Label>Title</Label>
              <Input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="e.g. Categorize Swiggy & Zomato as Dining"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label>Group</Label>
                <Select
                  value={draft.groupId}
                  onValueChange={(v) => setDraft({ ...draft, groupId: v })}
                >
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue placeholder="Default Rules" />
                  </SelectTrigger>
                  <SelectContent className="max-w-[90vw]">
                    {groups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Rule style</Label>
                <Select
                  value={draft.kind}
                  onValueChange={(v: any) => setDraft({ ...draft, kind: v })}
                >
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-w-[90vw]">
                    <SelectItem value="llm_context">Natural language (AI context)</SelectItem>
                    <SelectItem value="deterministic">Deterministic (exact automation)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {draft.kind === 'llm_context' ? (
              <div>
                <Label>Classification instruction</Label>
                <Textarea
                  className="min-h-40 resize-y"
                  placeholder="Example: Treat purchases from pharmacies as Doctor & Hospital, except cosmetic products."
                  value={draft.instruction}
                  onChange={(e) => setDraft({ ...draft, instruction: e.target.value })}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Included in the LLM prompt only for your household. It does not override deterministic rules.
                </p>
              </div>
            ) : (
              <>
                {/* CONDITIONS / TRIGGERS */}
                <div className="space-y-3 rounded-lg border p-3 sm:p-4">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <Label>When transaction…</Label>
                      <p className="text-xs text-muted-foreground">
                        Add as many conditions as needed.
                      </p>
                    </div>
                    <Select
                      value={draft.strictMode ? 'all' : 'any'}
                      onValueChange={(v) => setDraft({ ...draft, strictMode: v === 'all' })}
                    >
                      <SelectTrigger className="w-72 max-w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="min-w-72 max-w-[90vw]">
                        <SelectItem value="all">Match all conditions (AND)</SelectItem>
                        <SelectItem value="any">Match any condition (OR)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    {draft.conditions.map((condition, index) => (
                      <div
                        key={index}
                        className="grid min-w-0 grid-cols-1 items-center gap-2 rounded-md bg-muted/35 p-2 lg:grid-cols-[2rem_minmax(10rem,1fr)_minmax(12rem,1fr)_minmax(12rem,1.3fr)_auto_auto]"
                      >
                        <span className="text-center text-xs font-medium text-muted-foreground">
                          {index + 1}
                        </span>

                        {/* Field Trigger */}
                        <Select
                          value={condition.field}
                          onValueChange={(v) =>
                            setDraft({
                              ...draft,
                              conditions: draft.conditions.map((c, i) =>
                                i === index ? { ...c, field: v, value: '' } : c
                              ),
                            })
                          }
                        >
                          <SelectTrigger className="w-full min-w-0 [&_[data-slot=select-value]]:truncate">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="max-h-[min(60vh,28rem)] min-w-[min(22rem,90vw)]">
                            {TRIGGERS.map(([v, l]) => (
                              <SelectItem key={v} value={v}>
                                {l}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {/* Operator */}
                        <Select
                          value={condition.operator}
                          onValueChange={(v) =>
                            setDraft({
                              ...draft,
                              conditions: draft.conditions.map((c, i) =>
                                i === index ? { ...c, operator: v } : c
                              ),
                            })
                          }
                        >
                          <SelectTrigger className="w-full min-w-0 [&_[data-slot=select-value]]:truncate">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="max-h-[min(60vh,28rem)] min-w-[min(22rem,90vw)]">
                            {OPERATORS.map(([v, l]) => (
                              <SelectItem key={v} value={v}>
                                {l}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {/* Match Value (Dropdown for category_id, text Input otherwise) */}
                        {condition.field === 'category_id' ? (
                          <div className="min-w-0">
                            <CategorySelectPopover
                              categories={categories}
                              value={
                                categories.find((c) => c.id === condition.value)?.id ??
                                categories.find(
                                  (c) => c.name.toLowerCase() === condition.value.toLowerCase()
                                )?.id ??
                                (condition.value || null)
                              }
                              onChange={(catId) =>
                                setDraft({
                                  ...draft,
                                  conditions: draft.conditions.map((c, i) =>
                                    i === index ? { ...c, value: catId ?? '' } : c
                                  ),
                                })
                              }
                              placeholder="Choose category…"
                              className="h-9 w-full min-w-0 justify-between text-xs font-normal"
                            />
                          </div>
                        ) : (
                          <div className="flex min-w-0 gap-2">
                            <Input
                              className="min-w-0"
                              placeholder="Match value"
                              value={condition.value}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  conditions: draft.conditions.map((c, i) =>
                                    i === index ? { ...c, value: e.target.value } : c
                                  ),
                                })
                              }
                            />
                            {condition.operator === 'between' && (
                              <Input
                                className="min-w-0"
                                placeholder="Upper value"
                                value={condition.valueSecondary}
                                onChange={(e) =>
                                  setDraft({
                                    ...draft,
                                    conditions: draft.conditions.map((c, i) =>
                                      i === index ? { ...c, valueSecondary: e.target.value } : c
                                    ),
                                  })
                                }
                              />
                            )}
                          </div>
                        )}

                        {/* NOT toggle */}
                        <label className="flex items-center gap-1.5 whitespace-nowrap text-xs">
                          <input
                            type="checkbox"
                            checked={condition.inverted}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                conditions: draft.conditions.map((c, i) =>
                                  i === index ? { ...c, inverted: e.target.checked } : c
                                ),
                              })
                            }
                          />{' '}
                          NOT
                        </label>

                        {/* Delete condition */}
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          disabled={draft.conditions.length === 1}
                          onClick={() =>
                            setDraft({
                              ...draft,
                              conditions: draft.conditions.filter((_, i) => i !== index),
                            })
                          }
                          aria-label={`Remove condition ${index + 1}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        conditions: [...draft.conditions, newCondition()],
                      })
                    }
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Add condition
                  </Button>
                </div>

                {/* ACTIONS */}
                <div className="space-y-3 rounded-lg border p-3 sm:p-4">
                  <div>
                    <Label>Then…</Label>
                    <p className="text-xs text-muted-foreground">
                      Actions run in order. Select the target category directly from the hierarchical picker.
                    </p>
                  </div>

                  <div className="space-y-2">
                    {draft.actions.map((action, index) => (
                      <div
                        key={index}
                        className="grid min-w-0 grid-cols-1 items-center gap-2 lg:grid-cols-[2rem_minmax(16rem,1fr)_minmax(18rem,1.5fr)_auto]"
                      >
                        <span className="text-center text-xs font-medium text-muted-foreground">
                          {index + 1}
                        </span>

                        {/* Action Type */}
                        <Select
                          value={action.action}
                          onValueChange={(v) =>
                            setDraft({
                              ...draft,
                              actions: draft.actions.map((a, i) =>
                                i === index ? { ...a, action: v, value: '' } : a
                              ),
                            })
                          }
                        >
                          <SelectTrigger className="w-full min-w-0 [&_[data-slot=select-value]]:truncate">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="max-h-[min(60vh,30rem)] min-w-[min(30rem,90vw)]">
                            {ACTIONS.map(([v, l]) => (
                              <SelectItem key={v} value={v}>
                                {l}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {/* Action Value: Category Picker if set_category, Input otherwise */}
                        {action.action === 'set_category' ? (
                          <div className="min-w-0">
                            <CategorySelectPopover
                              categories={categories}
                              value={
                                categories.find((c) => c.id === action.value)?.id ??
                                categories.find(
                                  (c) => c.name.toLowerCase() === action.value.toLowerCase()
                                )?.id ??
                                (action.value || null)
                              }
                              onChange={(catId) =>
                                setDraft({
                                  ...draft,
                                  actions: draft.actions.map((a, i) =>
                                    i === index ? { ...a, value: catId ?? '' } : a
                                  ),
                                })
                              }
                              placeholder="Select category from hierarchy…"
                              className="h-9 w-full min-w-0 justify-between text-xs font-normal"
                            />
                          </div>
                        ) : (
                          <Input
                            className="min-w-0"
                            placeholder="Action value"
                            value={action.value}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                actions: draft.actions.map((a, i) =>
                                  i === index ? { ...a, value: e.target.value } : a
                                ),
                              })
                            }
                          />
                        )}

                        {/* Delete action */}
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          disabled={draft.actions.length === 1}
                          onClick={() =>
                            setDraft({
                              ...draft,
                              actions: draft.actions.filter((_, i) => i !== index),
                            })
                          }
                          aria-label={`Remove action ${index + 1}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        actions: [...draft.actions, newAction()],
                      })
                    }
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Add action
                  </Button>
                </div>
              </>
            )}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <Label>Run</Label>
                <Select
                  value={draft.triggerMoment}
                  onValueChange={(v: any) => setDraft({ ...draft, triggerMoment: v })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-w-[90vw]">
                    <SelectItem value="create">On create/import</SelectItem>
                    <SelectItem value="update">On update</SelectItem>
                    <SelectItem value="create_and_update">Create and update</SelectItem>
                    <SelectItem value="manual_only">Manual only</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {draft.triggerMoment === 'scheduled' && (
                <div>
                  <Label>Cron expression</Label>
                  <Input
                    placeholder="0 2 * * *"
                    value={draft.scheduleCron}
                    onChange={(e) => setDraft({ ...draft, scheduleCron: e.target.value })}
                  />
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="sticky -bottom-4 -mx-4 border-t bg-background px-4 py-4 sm:-bottom-6 sm:-mx-6 sm:px-6">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                !draft.title ||
                saving.isPending ||
                (draft.kind === 'llm_context' && !draft.instruction)
              }
              onClick={() => saving.mutate()}
            >
              Save rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
