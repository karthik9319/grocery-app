import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  Camera,
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
import { formatQuantity } from "@/lib/utils";
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
  const maxSpend = Math.max(1, ...spendSeries.map((s) => s.total));

  const inUseItems = items.filter((i) => i.in_use_quantity > 0);

  // Smart insights from real signals (no fabricated predictions).
  type Insight = { key: string; tone: string; title: string; sub: string; onClick?: () => void };
  const insights: Insight[] = [];
  for (const i of summary.low_stock_items) {
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

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total items" value={String(totalItems)} hint="in your pantry" icon={<PackageOpen className="h-4 w-4" />} />
        <Kpi label="Low stock" value={String(lowCount)} hint={lowCount ? "needs restock" : "all good"} tone="#E8792B" icon={<AlertTriangle className="h-4 w-4" />} />
        <Kpi label="Expiring ≤3d" value={String(expiringCount)} hint={expiringCount ? "use soon" : "nothing soon"} tone="#FB7185" icon={<CalendarClock className="h-4 w-4" />} />
        <Kpi label="Spent (logged)" value={`$${totalSpend.toFixed(2)}`} hint="from receipts" icon={<TrendingUp className="h-4 w-4" />} />
      </div>

      {/* Analytics row */}
      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr]">
        {/* Spend chart */}
        <div className={card}>
          <div className="mb-3 flex items-baseline justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wide text-subtle">Spend by month</p>
            <p className="font-display text-lg font-bold text-content">${totalSpend.toFixed(2)}</p>
          </div>
          {spendSeries.length > 0 ? (
            <div className="flex h-28 items-end gap-3">
              {spendSeries.map((s, idx) => (
                <div key={s.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <div
                    className="w-full rounded-t-md"
                    style={{
                      height: `${Math.max(6, (s.total / maxSpend) * 96)}px`,
                      background: idx === spendSeries.length - 1 ? "var(--theme-500)" : "var(--theme-400)",
                    }}
                    title={`$${s.total.toFixed(2)}`}
                  />
                  <span className="text-[10px] text-subtle">{monthLabel(s.month)}</span>
                </div>
              ))}
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
                  <div
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-base"
                    style={{ background: `${meta.palette[i.category]}22` }}
                  >
                    {meta.icons[i.category]}
                  </div>
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
                  <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-black/5 sm:block dark:bg-white/10">
                    <span className="block h-full rounded-full" style={{ width: `${fill}%`, background: isLow ? "#E8792B" : meta.palette[i.category] }} />
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
                {insights.slice(0, 6).map((ins) => (
                  <button
                    key={ins.key}
                    onClick={ins.onClick}
                    className="w-full rounded-lg bg-black/[0.03] px-3 py-2 text-left dark:bg-white/5"
                    style={{ borderLeft: `3px solid ${ins.tone}` }}
                  >
                    <p className="text-[13px] font-semibold text-content">{ins.title}</p>
                    <p className="text-[11px] text-subtle">{ins.sub}</p>
                  </button>
                ))}
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
                      <span className="w-12 text-right text-subtle">${s.total.toFixed(2)}</span>
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
}: {
  label: string;
  value: string;
  hint: string;
  tone?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-surface-solid p-4 shadow-sm dark:border-white/10">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">{label}</p>
        <span className="text-subtle">{icon}</span>
      </div>
      <p className="font-display text-2xl font-bold leading-tight" style={tone ? { color: tone } : { color: "var(--content)" }}>
        {value}
      </p>
      <p className="text-[11px] text-subtle">{hint}</p>
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
