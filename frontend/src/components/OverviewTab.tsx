import { useId, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  Camera,
  ChevronRight,
  FileText,
  PackageOpen,
  Receipt,
  ShoppingBag,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Item, Meta } from "@/types";
import { formatMoney, formatQuantity, imageUrl } from "@/lib/utils";
import { Spinner } from "@/components/ui";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthLabel(ym: string): string {
  const m = parseInt(ym.slice(5, 7), 10);
  return MONTHS[m - 1] ?? ym;
}

/** Rich analytics-forward dashboard: KPIs, spend + category + stock-health charts, a
 * smart-insights rail, and an inventory preview. Uses only real data already tracked. */
export function OverviewTab({
  meta,
  onNavigate,
}: {
  meta: Meta;
  onNavigate: (tab: string) => void;
}) {
  const queryClient = useQueryClient();
  const { data: summary } = useQuery({ queryKey: ["summary"], queryFn: api.summary });
  const { data: spend } = useQuery({ queryKey: ["purchases", "summary"], queryFn: api.purchasesSummary });
  const { data: counts } = useQuery({ queryKey: ["charts", "category-counts"], queryFn: api.chartCategoryCounts });
  const { data: items } = useQuery({ queryKey: ["items"], queryFn: () => api.items() });
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const { data: predictions } = useQuery({ queryKey: ["predictions"], queryFn: api.predictions });

  const thresholdFor = (i: Item) =>
    i.custom_threshold ?? (meta.units[i.category] === "g" ? settings?.weight_threshold ?? 200 : settings?.count_threshold ?? 2);

  const useMutation_ = useMutation({
    mutationFn: ({ id, amount }: { id: number; amount: number }) => api.useItem(id, amount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
    },
  });

  const addLowStock = useMutation({
    mutationFn: api.addLowStockToShoppingList,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["shopping-list"] });
      toast.success(`Added ${res.added} low-stock item(s) to the shopping list`, { icon: "🛍️" });
    },
  });

  const donut = useMemo(() => {
    const cats = meta.categories;
    const total = cats.reduce((s, c) => s + (counts?.[c] ?? 0), 0) || 1;
    let acc = 0;
    const stops = cats
      .filter((c) => (counts?.[c] ?? 0) > 0)
      .map((c) => {
        const start = (acc / total) * 100;
        acc += counts?.[c] ?? 0;
        const end = (acc / total) * 100;
        return `${meta.palette[c]} ${start}% ${end}%`;
      });
    return { total, background: stops.length ? `conic-gradient(${stops.join(", ")})` : "var(--line)" };
  }, [counts, meta]);

  if (!summary || !items) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const totalItems = summary.total_rows;
  const lowCount = summary.low_stock_items.length;
  const expiringCount = summary.expiring_items.length;
  const totalSpend = spend?.total_spend ?? 0;
  const wellStocked = Math.max(0, totalItems - lowCount);

  const spendSeries = (spend?.spend_over_time ?? []).slice(-6);

  const inUseItems = items.filter((i) => i.in_use_quantity > 0);

  // Smart insights: real run-out predictions (from consumption history) first, then
  // current-state signals (low stock, expiring, in use).
  type Insight = { key: string; tone: string; title: string; sub: string; onClick?: () => void };
  const insights: Insight[] = [];
  const predictedIds = new Set<number>();
  for (const p of (predictions ?? []).slice(0, 3)) {
    predictedIds.add(p.item.id);
    const days = p.days_left;
    insights.push({
      key: `pred-${p.item.id}`,
      tone: "#38BDF8",
      title: `${p.item.title} runs out in ~${days < 1 ? "<1" : Math.round(days)}d`,
      sub: `~${p.rate_per_day}/day used · restock soon`,
      onClick: () => addLowStock.mutate(),
    });
  }
  for (const i of summary.low_stock_items) {
    if (predictedIds.has(i.id)) continue;
    insights.push({
      key: `low-${i.id}`,
      tone: "#E8792B",
      title: `${i.title} is low`,
      sub: `${formatQuantity(i.quantity, meta.units[i.category])} left · add to list`,
      onClick: () => addLowStock.mutate(),
    });
  }
  for (const e of summary.expiring_items) {
    insights.push({
      key: `exp-${e.item.id}`,
      tone: "#FB7185",
      title: `Use ${e.item.title} soon`,
      sub: e.days_left < 0 ? "expired" : e.days_left === 0 ? "expires today" : `expires in ${e.days_left}d`,
    });
  }
  for (const i of inUseItems) {
    insights.push({
      key: `use-${i.id}`,
      tone: "#6C63FF",
      title: `Finish ${i.title}`,
      sub: `${formatQuantity(i.in_use_quantity, meta.units[i.category])} opened / in use`,
    });
  }

  const previewItems = [...items]
    .sort((a, b) => {
      const aLow = a.quantity <= thresholdFor(a) ? 0 : 1;
      const bLow = b.quantity <= thresholdFor(b) ? 0 : 1;
      if (aLow !== bLow) return aLow - bLow;
      return b.created_at.localeCompare(a.created_at);
    })
    .slice(0, 8);

  const card = "rounded-2xl border border-black/10 bg-surface-solid p-4 shadow-sm dark:border-white/10";

  const catSegments = meta.categories.map((c) => ({ color: meta.palette[c], value: counts?.[c] ?? 0 }));
  const spendPoints = spendSeries.map((s) => s.total);

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total items" value={String(totalItems)} hint="in your pantry" icon={<PackageOpen className="h-4 w-4" />} footer={<StackBar segments={catSegments} />} />
        <Kpi label="Low stock" value={String(lowCount)} hint={lowCount ? "needs restock" : "all good"} tone="#E8792B" icon={<AlertTriangle className="h-4 w-4" />} footer={<MiniBar pct={totalItems ? (lowCount / totalItems) * 100 : 0} color="#E8792B" />} />
        <Kpi label="Expiring ≤3d" value={String(expiringCount)} hint={expiringCount ? "use soon" : "nothing soon"} tone="#FB7185" icon={<CalendarClock className="h-4 w-4" />} footer={<MiniBar pct={totalItems ? (expiringCount / totalItems) * 100 : 0} color="#FB7185" />} />
        <Kpi label="Spent (logged)" value={formatMoney(totalSpend)} hint="from receipts" icon={<TrendingUp className="h-4 w-4" />} footer={spendPoints.length > 1 ? <AreaChart data={spendPoints} color="var(--theme-500)" className="h-7 w-full" /> : <MiniBar pct={totalSpend > 0 ? 100 : 0} color="var(--theme-500)" />} />
      </div>

      {/* Analytics row */}
      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr]">
        {/* Spend chart */}
        <div className={card}>
          <div className="mb-3 flex items-baseline justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wide text-subtle">Spend by month</p>
            <p className="font-display text-lg font-bold text-content">{formatMoney(totalSpend)}</p>
          </div>
          {spendSeries.length > 0 ? (
            <div>
              <AreaChart data={spendSeries.map((s) => s.total)} color="var(--theme-500)" className="h-28 w-full" />
              <div className="mt-1 flex justify-between">
                {spendSeries.map((s) => (
                  <span key={s.month} className="text-[10px] text-subtle">
                    {monthLabel(s.month)}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex h-28 items-center justify-center text-center text-xs text-subtle">
              No spend logged yet — add prices when scanning a receipt to see this.
            </div>
          )}
        </div>

        {/* Category donut */}
        <div className={card}>
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-subtle">Items by category</p>
          <div className="flex items-center gap-3">
            <div className="grid h-20 w-20 place-items-center rounded-full" style={{ background: donut.background }}>
              <div className="grid h-11 w-11 place-items-center rounded-full bg-surface-solid font-display text-sm font-bold text-content">
                {donut.total}
              </div>
            </div>
            <ul className="space-y-1 text-[13px]">
              {meta.categories.map((c) => (
                <li key={c} className="flex items-center gap-1.5 text-content">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.palette[c] }} />
                  {c} <span className="text-subtle">{counts?.[c] ?? 0}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Stock health */}
        <div className={card}>
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-subtle">Stock health</p>
          <div className="space-y-2.5 text-[13px]">
            <HealthBar label="Well stocked" count={wellStocked} total={totalItems} color="var(--theme-500)" />
            <HealthBar label="Low" count={lowCount} total={totalItems} color="#E8792B" />
            <HealthBar label="Expiring soon" count={expiringCount} total={totalItems} color="#FB7185" />
          </div>
        </div>
      </div>

      {/* Inventory + insights */}
      <div className="grid gap-3 lg:grid-cols-[1fr_300px] lg:items-start">
        {/* Inventory preview */}
        <section className="overflow-hidden rounded-2xl border border-black/10 bg-surface-solid shadow-sm dark:border-white/10">
          <div className="flex items-center gap-3 border-b border-black/10 px-4 py-3 dark:border-white/10">
            <h2 className="font-display text-sm font-bold text-content">Inventory</h2>
            <span className="text-xs text-subtle">{totalItems} items</span>
            <button
              onClick={() => onNavigate(meta.categories[0])}
              className="ml-auto text-xs font-semibold text-theme-600 hover:underline"
            >
              View all →
            </button>
          </div>
          <ul className="divide-y divide-black/5 dark:divide-white/10">
            {previewItems.map((i) => {
              const unit = meta.units[i.category];
              const thr = thresholdFor(i);
              const isLow = i.quantity <= thr;
              const fill = Math.max(6, Math.min(100, (i.quantity / (thr * 3)) * 100));
              const step = unit === "g" ? 50 : 1;
              return (
                <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                  {imageUrl(i.image_path) ? (
                    <img
                      src={imageUrl(i.image_path)!}
                      alt=""
                      className="h-9 w-9 shrink-0 rounded-lg border border-black/5 object-cover dark:border-white/10"
                    />
                  ) : (
                    <div
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-base"
                      style={{ background: `${meta.palette[i.category]}22` }}
                    >
                      {meta.icons[i.category]}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-content">
                      {i.title}
                      {i.in_use_quantity > 0 && (
                        <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: "#6C63FF" }}>
                          in use
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[11px] text-subtle">{i.category}</p>
                  </div>
                  <div className="hidden h-2 w-24 overflow-hidden rounded-full bg-black/5 sm:block dark:bg-white/10">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${fill}%`,
                        background: isLow
                          ? "linear-gradient(90deg,#E8792B,#f0a35e)"
                          : `linear-gradient(90deg, ${meta.palette[i.category]}, ${meta.palette[i.category]}aa)`,
                      }}
                    />
                  </div>
                  <span className="w-12 text-right text-sm font-semibold text-content">{formatQuantity(i.quantity, unit)}</span>
                  <button
                    onClick={() => useMutation_.mutate({ id: i.id, amount: step })}
                    disabled={i.quantity < step}
                    className="rounded-lg border border-black/10 px-2 py-1 text-xs font-semibold text-content hover:bg-surface disabled:opacity-40 dark:border-white/10"
                  >
                    Use
                  </button>
                </li>
              );
            })}
            {previewItems.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-subtle">
                No items yet — add some from the Add Items tab.
              </li>
            )}
          </ul>
        </section>

        {/* Right rail */}
        <div className="space-y-3">
          <div className={card}>
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-theme-600">
              <Sparkles className="h-3.5 w-3.5" /> Needs attention
            </p>
            {insights.length === 0 ? (
              <p className="py-2 text-sm text-subtle">All good — nothing needs attention right now. ✅</p>
            ) : (
              <div className="space-y-2">
                {insights.slice(0, 6).map((ins) =>
                  ins.onClick ? (
                    <button
                      key={ins.key}
                      onClick={ins.onClick}
                      className="group flex w-full items-start gap-2.5 rounded-xl border border-black/5 bg-black/[0.02] p-2.5 text-left transition-colors hover:bg-black/[0.05] dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                    >
                      <span className="mt-0.5 h-9 w-1 shrink-0 rounded-full" style={{ background: ins.tone }} />
                      <span className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-content">{ins.title}</p>
                        <p className="text-[11px] text-subtle">{ins.sub}</p>
                      </span>
                      <ChevronRight className="mt-1.5 h-4 w-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" />
                    </button>
                  ) : (
                    <div
                      key={ins.key}
                      className="flex items-start gap-2.5 rounded-xl border border-black/5 bg-black/[0.02] p-2.5 dark:border-white/10 dark:bg-white/5"
                    >
                      <span className="mt-0.5 h-9 w-1 shrink-0 rounded-full" style={{ background: ins.tone }} />
                      <span className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-content">{ins.title}</p>
                        <p className="text-[11px] text-subtle">{ins.sub}</p>
                      </span>
                    </div>
                  )
                )}
              </div>
            )}
          </div>

          <div className={card}>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-subtle">Quick actions</p>
            <div className="grid grid-cols-2 gap-2 text-[13px]">
              <QuickAction icon={<Camera className="h-4 w-4" />} label="Scan" onClick={() => onNavigate("add-items")} />
              <QuickAction icon={<Sparkles className="h-4 w-4" />} label="Quick add" onClick={() => onNavigate("add-items")} />
              <QuickAction icon={<Receipt className="h-4 w-4" />} label="Receipt" onClick={() => onNavigate("add-items")} />
              <QuickAction icon={<ShoppingBag className="h-4 w-4" />} label="+ Low stock" onClick={() => addLowStock.mutate()} />
            </div>
          </div>

          {spend && spend.spend_by_item.length > 0 && (
            <div className={card}>
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-subtle">
                <FileText className="h-3.5 w-3.5" /> Top spend
              </p>
              <div className="space-y-1.5 text-[13px]">
                {spend.spend_by_item.slice(0, 4).map((s) => {
                  const max = spend.spend_by_item[0]?.total || 1;
                  return (
                    <div key={s.title} className="flex items-center gap-2">
                      <span className="flex-1 truncate text-content">{s.title}</span>
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
                        <span className="block h-full rounded-full" style={{ width: `${(s.total / max) * 100}%`, background: "#6C63FF" }} />
                      </div>
                      <span className="w-12 text-right text-subtle">{formatMoney(s.total)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone,
  icon,
  footer,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: string;
  icon: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-black/10 bg-surface-solid p-3 shadow-sm dark:border-white/10">
      <div className="mb-0.5 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-subtle">{label}</p>
        <span className="text-subtle">{icon}</span>
      </div>
      <p className="font-display text-xl font-bold leading-tight" style={tone ? { color: tone } : { color: "var(--content)" }}>
        {value}
      </p>
      <p className="text-[10px] text-subtle">{hint}</p>
      {footer && <div className="mt-2">{footer}</div>}
    </div>
  );
}

/** Lightweight gradient area/sparkline chart (pure SVG, no chart lib). */
function AreaChart({ data, color, className }: { data: number[]; color: string; className?: string }) {
  const gradientId = useId();
  const pts = data.length === 1 ? [data[0], data[0]] : data;
  if (pts.length < 2) return null;
  const w = 100;
  const h = 32;
  const max = Math.max(...pts);
  const min = Math.min(...pts, 0);
  const range = max - min || 1;
  const coords = pts.map((v, i) => {
    const x = (i / (pts.length - 1)) * w;
    const y = h - 3 - ((v - min) / range) * (h - 6);
    return [x, y] as const;
  });
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Single-value proportion bar (e.g. low-stock share of total). */
function MiniBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
      <span className="block h-full rounded-full" style={{ width: `${Math.max(3, Math.min(100, pct))}%`, background: color }} />
    </div>
  );
}

/** Stacked proportion bar of category segments. */
function StackBar({ segments }: { segments: { color: string; value: number }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const visible = segments.filter((s) => s.value > 0);
  if (visible.length === 0) return <div className="h-1.5 w-full rounded-full bg-black/5 dark:bg-white/10" />;
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
      {visible.map((s, i) => (
        <span key={i} className="block h-full" style={{ width: `${(s.value / total) * 100}%`, background: s.color }} />
      ))}
    </div>
  );
}

function HealthBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between">
        <span className="text-content">{label}</span>
        <span className="text-subtle">{count}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
        <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function QuickAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center gap-1.5 rounded-lg border border-black/10 bg-surface px-2 py-2 font-medium text-content hover:bg-surface-solid dark:border-white/10"
    >
      {icon}
      {label}
    </button>
  );
}
