import { useEffect, useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  Receipt,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Item, Meta } from "@/types";
import { cn, formatMoney, formatQuantity, imageUrl } from "@/lib/utils";
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

  const card = "rounded-2xl border border-line bg-surface-solid shadow-sm";
  const label = "text-[11px] font-semibold uppercase tracking-[0.12em] text-subtle";
  const spendPoints = spendSeries.map((s) => s.total);
  const catCount = meta.categories.filter((c) => (counts?.[c] ?? 0) > 0).length;

  return (
    <div className="space-y-5">
      {/* Hero stats */}
      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className={cn(card, "p-7")}>
          <p className={label}>Spent this month</p>
          <div className="mt-2 flex items-end gap-3">
            <span className="font-display text-[42px] font-semibold leading-none tabular-nums text-content">
              <CountUp value={totalSpend} format={formatMoney} />
            </span>
          </div>
          {spendSeries.length > 0 ? (
            <>
              <AreaChart data={spendPoints} color="var(--theme-500)" className="mt-5 h-24 w-full" animate />
              <div className="mt-2 flex justify-between text-[12px] text-subtle">
                {spendSeries.map((s) => (
                  <span key={s.month}>{monthLabel(s.month)}</span>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-6 text-sm text-muted">No spend logged yet — add prices when scanning a receipt to see this.</p>
          )}
        </div>

        <div className={cn(card, "flex flex-col justify-between p-7")}>
          <div>
            <p className={label}>In your pantry</p>
            <p className="mt-2 font-display text-[42px] font-semibold leading-none tabular-nums text-content">
              <CountUp value={totalItems} />
            </p>
            <p className="mt-2 text-[13px] text-muted">
              {totalItems === 1 ? "item" : "items"} across {catCount} {catCount === 1 ? "category" : "categories"}
            </p>
          </div>
          <div className="mt-6 space-y-3 text-sm">
            <StatRow dot="#E8792B" label="Low stock" value={lowCount} />
            <StatRow dot="#C2554A" label="Expiring soon" value={expiringCount} />
            <StatRow dot="var(--theme-500)" label="Well stocked" value={wellStocked} />
          </div>
        </div>
      </div>

      {/* Inventory + right rail */}
      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        {/* Inventory */}
        <section className={cn(card, "overflow-hidden")}>
          <div className="flex items-center gap-3 border-b border-line px-6 py-4">
            <h2 className="font-display text-[18px] font-semibold text-content">Inventory</h2>
            <span className="text-[13px] tabular-nums text-subtle">{totalItems} items</span>
            <button
              onClick={() => onNavigate(meta.categories[0])}
              className="ml-auto text-[13px] font-semibold text-theme-600 hover:underline dark:text-theme-400"
            >
              View all
            </button>
          </div>
          <ul className="divide-y divide-line">
            {previewItems.map((i) => {
              const unit = meta.units[i.category];
              const thr = thresholdFor(i);
              const isLow = i.quantity <= thr;
              const fill = Math.max(6, Math.min(100, (i.quantity / (thr * 3)) * 100));
              const step = unit === "g" ? 50 : 1;
              return (
                <li key={i.id} className="flex items-center gap-4 px-6 py-4">
                  {imageUrl(i.image_path) ? (
                    <img
                      src={imageUrl(i.image_path)!}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-xl border border-line object-cover"
                    />
                  ) : (
                    <div
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg"
                      style={{ background: `${meta.palette[i.category]}1f` }}
                    >
                      {meta.icons[i.category]}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-[15px] font-semibold text-content">
                      {i.title}
                      {i.in_use_quantity > 0 && (
                        <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: "#6C63FF" }}>
                          in use
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[13px] text-muted">{i.category}</p>
                  </div>
                  <div className="hidden h-1.5 w-28 overflow-hidden rounded-full sm:block" style={{ background: "var(--surface)" }}>
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${fill}%`, background: isLow ? "#E8792B" : "var(--theme-500)" }}
                    />
                  </div>
                  <span className="w-12 text-right text-[15px] font-semibold tabular-nums text-content">{formatQuantity(i.quantity, unit)}</span>
                  <button
                    onClick={() => useMutation_.mutate({ id: i.id, amount: step })}
                    disabled={i.quantity < step}
                    className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-content hover:bg-surface disabled:opacity-40"
                  >
                    Use
                  </button>
                </li>
              );
            })}
            {previewItems.length === 0 && (
              <li className="px-6 py-10 text-center text-sm text-subtle">
                No items yet — add some from the Add Items tab.
              </li>
            )}
          </ul>
        </section>

        {/* Right rail */}
        <div className="space-y-5">
          <div className={cn(card, "p-6")}>
            <p className={cn(label, "mb-4")}>Needs attention</p>
            {insights.length === 0 ? (
              <p className="text-sm text-muted">All good — nothing needs attention right now.</p>
            ) : (
              <div className="space-y-4">
                {insights.slice(0, 4).map((ins, idx) => {
                  const num = String(idx + 1).padStart(2, "0");
                  const body = (
                    <>
                      <span className="font-display text-[15px] font-semibold tabular-nums" style={{ color: ins.tone }}>
                        {num}
                      </span>
                      <span className="min-w-0 flex-1">
                        <p className="text-[14px] font-semibold text-content">{ins.title}</p>
                        <p className="text-[13px] text-muted">{ins.sub}</p>
                      </span>
                    </>
                  );
                  return ins.onClick ? (
                    <button key={ins.key} onClick={ins.onClick} className="flex w-full items-start gap-3 text-left">
                      {body}
                    </button>
                  ) : (
                    <div key={ins.key} className="flex items-start gap-3">
                      {body}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className={cn(card, "p-6")}>
            <p className={cn(label, "mb-4")}>Quick actions</p>
            <div className="grid grid-cols-2 gap-2.5">
              <QuickAction icon={<Camera className="h-4 w-4" />} label="Scan" onClick={() => onNavigate("add-items")} />
              <QuickAction icon={<Receipt className="h-4 w-4" />} label="Receipt" onClick={() => onNavigate("add-items")} />
              <QuickAction icon={<Sparkles className="h-4 w-4" />} label="Quick add" onClick={() => onNavigate("add-items")} />
              <QuickAction icon={<ShoppingBag className="h-4 w-4" />} label="Restock" onClick={() => addLowStock.mutate()} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatRow({ dot, label, value }: { dot: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-content">
        <span className="h-[7px] w-[7px] rounded-full" style={{ background: dot }} />
        {label}
      </span>
      <span className="font-semibold tabular-nums text-content">{value}</span>
    </div>
  );
}

/** Lightweight gradient area/sparkline chart (pure SVG, no chart lib). */
function AreaChart({ data, color, className, animate }: { data: number[]; color: string; className?: string; animate?: boolean }) {
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
        pathLength={animate ? 1 : undefined}
        style={animate ? { strokeDasharray: 1, strokeDashoffset: 1, animation: "draw-line 1.4s ease-out forwards" } : undefined}
      />
    </svg>
  );
}

/** Animated count-up number (eases from 0 to the target on mount / change). */
function CountUp({ value, format }: { value: number; format?: (n: number) => string }) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || document.hidden) {
      setV(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const dur = 700;
    const from = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(from + (value - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else setV(value);
    };
    setV(from);
    raf = requestAnimationFrame(tick);
    // Safety: rAF is paused in background tabs, so guarantee the final value lands.
    const safety = setTimeout(() => setV(value), dur + 150);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(safety);
    };
  }, [value]);
  return <>{format ? format(v) : Math.round(v).toString()}</>;
}

/** Left-aligned quick-action pill. */
function QuickAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-[13px] font-semibold text-content hover:bg-surface"
    >
      {icon}
      {label}
    </button>
  );
}
