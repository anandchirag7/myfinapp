import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import RGL from "react-grid-layout";
import { queryKeys } from "@/lib/query-keys";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  LayoutTemplate,
  MessageCircle,
  Plus,
  Settings2,
  Sparkles,
  Wallet,
} from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { getDashboard } from "@/lib/finance.functions";
import { listDashboards, createDashboard } from "@/lib/dashboards.functions";
import { WIDGET_BY_TYPE } from "@/lib/dashboard-widgets";
import { TEMPLATES } from "@/lib/dashboard-templates";
import { DashboardBuilderDialog } from "@/components/dashboard-builder";
import { formatINR } from "@/lib/format";

const GridLayout: any = (RGL as any).GridLayout ?? (RGL as any).default ?? RGL;

const RANGE_LABELS = {
  "1m": "This month",
  "3m": "Last 3 months",
  "6m": "Last 6 months",
  "1y": "Last 12 months",
  ytd: "Year to date",
} as const;



export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Dashboard — Paisa" }] }),
  component: Dashboard,
});

function Dashboard() {
  const dataFn = useServerFn(getDashboard);
  const listFn = useServerFn(listDashboards);
  const createFn = useServerFn(createDashboard);

  const [range, setRange] = useState<keyof typeof RANGE_LABELS>("1m");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const { data: metrics, isLoading } = useQuery({
    queryKey: queryKeys.dashboard.data(range),
    queryFn: () => dataFn({ data: { range } }),
    staleTime: 60 * 1000,
  });
  const { data: rawDashboards = [], refetch } = useQuery({
    queryKey: ["dashboards"],
    queryFn: async () => {
      const res = await listFn();
      return Array.isArray(res) ? res : [];
    },
  });
  const dashboards = useMemo(() => (Array.isArray(rawDashboards) ? rawDashboards : []), [rawDashboards]);

  const current = useMemo(
    () => dashboards.find((d) => d.id === activeId) ?? dashboards.find((d) => d.is_default) ?? dashboards[0],
    [dashboards, activeId]
  );

  // seed a default dashboard on first visit
  useEffect(() => {
    if (dashboards.length === 0) return;
  }, [dashboards.length]);
  useEffect(() => {
    if (dashboards.length === 0) {
      const t = TEMPLATES[0];
      createFn({ data: { name: t.name, template_key: t.key, layout: t.layout } }).then(() => refetch());
    }
  }, [dashboards.length]);
  const [width, setWidth] = useState(0);
  const roRef = useRef<ResizeObserver | null>(null);
  const containerRef = (node: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    if (!node) return;
    const measure = () => setWidth(node.clientWidth || 0);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    roRef.current = ro;
  };






  if (isLoading && !metrics) {
    return (
      <div className="dashboard-canvas grid min-h-[calc(100vh-3.5rem)] place-items-center px-6">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          Bringing your money picture together…
        </div>
      </div>
    );
  }

  const d = metrics as any;
  const empty = !d || d.accountsCount === 0;
  if (empty) {
    return (
      <div className="dashboard-canvas grid min-h-[calc(100vh-3.5rem)] place-items-center px-4 py-16">
        <div className="w-full max-w-xl rounded-[2rem] border bg-card p-8 text-center shadow-[0_24px_80px_-40px_rgba(20,64,48,0.45)] md:p-12">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
          <Wallet className="h-7 w-7" />
        </div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">Start with the essentials</p>
        <h2 className="font-display text-3xl font-semibold">See your whole money story</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          Add your bank accounts, investments, and loans. Paisa will turn them into one calm, useful view.
        </p>
        <Button asChild className="mt-7 h-11 rounded-full px-6" size="lg"><Link to="/accounts"><Plus className="mr-2 h-4 w-4" />Add your first account</Link></Button>
        </div>
      </div>
    );
  }

  const layout = current?.layout ?? [];
  const savingsRate = d.income > 0 ? Math.round((d.savings / d.income) * 100) : 0;
  const cashFlowPositive = d.savings >= 0;
  const today = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  let mobileY = 0;
  const resolvedLayout = layout.map((item: any) => {
    if (width >= 768) return { i: item.i, x: item.x, y: item.y, w: item.w, h: item.h, static: true };
    const mobileItem = { i: item.i, x: 0, y: mobileY, w: 1, h: item.h, static: true };
    mobileY += item.h;
    return mobileItem;
  });

  return (
    <div className="dashboard-canvas min-h-[calc(100vh-3.5rem)]">
      <div className="mx-auto max-w-[1440px] space-y-6 px-4 py-5 md:px-7 md:py-7">
      <section className="relative isolate overflow-hidden rounded-[2rem] bg-[linear-gradient(125deg,#123d30_0%,#1c5842_64%,#2b6d50_100%)] px-5 py-6 text-white shadow-[0_28px_70px_-38px_rgba(14,57,42,0.8)] md:px-8 md:py-8">
        <div aria-hidden="true" className="absolute -right-20 -top-28 -z-10 h-80 w-80 rounded-full border border-white/10 bg-white/[0.04]" />
        <div aria-hidden="true" className="absolute -bottom-36 right-44 -z-10 h-72 w-72 rounded-full border border-white/10" />
        <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <div className="mb-5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-100/75"><Sparkles className="h-3.5 w-3.5" /> Financial pulse · {today}</div>
            <h1 className="font-display text-3xl font-semibold leading-tight md:text-[2.65rem]">Your money, in one clear view.</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-emerald-50/75 md:text-base">
              {cashFlowPositive ? `You kept ${formatINR(d.savings)} after expenses in ${RANGE_LABELS[range].toLowerCase()}.` : `Spending is ${formatINR(Math.abs(d.savings))} above income in ${RANGE_LABELS[range].toLowerCase()}.`}
              {d.upcomingBills?.length ? ` ${d.upcomingBills.length} upcoming ${d.upcomingBills.length === 1 ? "bill needs" : "bills need"} your attention.` : " You have no bills due in the next 30 days."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary" className="h-10 rounded-full border border-white/10 bg-white text-[#173f32] hover:bg-emerald-50"><Link to="/transactions"><Plus className="mr-2 h-4 w-4" />Add transaction</Link></Button>
            <Button asChild variant="ghost" className="h-10 rounded-full border border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"><Link to="/chat"><MessageCircle className="mr-2 h-4 w-4" />Ask Paisa</Link></Button>
          </div>
        </div>
      </section>

      <section aria-label="Financial highlights" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <PulseCard label="Cash flow" value={formatINR(d.savings)} hint={cashFlowPositive ? "Left after expenses" : "Income gap"} icon={cashFlowPositive ? ArrowUpRight : ArrowDownRight} tone={cashFlowPositive ? "positive" : "negative"} />
        <PulseCard label="Savings rate" value={`${savingsRate}%`} hint={`${RANGE_LABELS[range]} of income`} icon={Sparkles} />
        <PulseCard label="Bills ahead" value={formatINR(d.upcomingBillsTotal ?? 0)} hint={`${d.upcomingBills?.length ?? 0} due in 30 days`} icon={CalendarClock} tone="warm" />
        <PulseCard label="Connected" value={`${d.accountsCount} accounts`} hint="Included in your view" icon={Wallet} />
      </section>

      <section>
        <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Your workspace</p>
            <div className="mt-1 flex items-center gap-2"><h2 className="font-display text-2xl font-semibold">{current?.name ?? "Dashboard"}</h2>{current?.is_default && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">Default</span>}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup type="single" size="sm" value={range} onValueChange={(value) => value && setRange(value as keyof typeof RANGE_LABELS)} className="rounded-full border bg-card p-1 shadow-sm" aria-label="Dashboard date range">
              {Object.keys(RANGE_LABELS).map((value) => <ToggleGroupItem key={value} value={value} className="h-7 rounded-full px-2.5 text-[11px] data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">{value.toUpperCase()}</ToggleGroupItem>)}
            </ToggleGroup>
            <Button variant="outline" size="sm" className="h-9 rounded-full bg-card" onClick={() => setBuilderOpen(true)}><Settings2 className="mr-1.5 h-4 w-4" />Customize</Button>
            <Button size="sm" className="h-9 rounded-full" onClick={() => setBuilderOpen(true)}><LayoutTemplate className="mr-1.5 h-4 w-4" />Dashboards</Button>
          </div>
        </div>

      {layout.length === 0 ? (
        <div className="grid place-items-center rounded-[2rem] border border-dashed bg-card/60 p-14 text-center">
          <div>
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-primary/10">
              <LayoutTemplate className="h-5 w-5 text-primary" />
            </div>
            <h3 className="font-medium">Make this space yours</h3>
            <p className="mt-1 text-sm text-muted-foreground">Add the money widgets you want to see every day.</p>
            <Button className="mt-4 rounded-full" onClick={() => setBuilderOpen(true)}>Open builder</Button>
          </div>
        </div>
      ) : (
        <div ref={containerRef}>
          {width > 0 && <GridLayout
            width={width}

            gridConfig={{ cols: width < 768 ? 1 : 12, rowHeight: 48, margin: [16, 16], containerPadding: [0, 0] }}
            dragConfig={{ isDraggable: false }}
            resizeConfig={{ isResizable: false }}
            layout={resolvedLayout}
          >
            {layout.map((item: any) => {
              const def = WIDGET_BY_TYPE[item.type];
              return (
                <div key={item.i} className="h-full w-full">
                  {def ? def.render({ data: metrics, settings: item.settings }) : (
                    <div className="grid h-full place-items-center rounded-3xl border bg-card text-sm text-muted-foreground">Unknown: {item.type}</div>
                  )}
                </div>
              );
            })}
          </GridLayout>}


        </div>



      )}

      </section>
      </div>

      <DashboardBuilderDialog
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        dashboardId={current?.id ?? null}
        onDashboardIdChange={setActiveId}
      />
    </div>
  );
}

function PulseCard({ label, value, hint, icon: Icon, tone = "neutral" }: {
  label: string;
  value: string;
  hint: string;
  icon: typeof Wallet;
  tone?: "neutral" | "positive" | "negative" | "warm";
}) {
  const toneClass = {
    neutral: "bg-primary/8 text-primary",
    positive: "bg-success/10 text-success",
    negative: "bg-destructive/10 text-destructive",
    warm: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  }[tone];

  return (
    <div className="group flex items-center gap-4 rounded-3xl border bg-card/90 p-4 shadow-[0_12px_36px_-30px_rgba(20,64,48,0.55)] transition-transform duration-200 hover:-translate-y-0.5">
      <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${toneClass}`}><Icon className="h-5 w-5" /></div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        <p className="mt-0.5 truncate text-lg font-semibold tabular-nums">{value}</p>
        <p className="truncate text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}
