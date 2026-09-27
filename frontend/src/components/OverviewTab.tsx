import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  AlertTriangle,
  Camera,
  CalendarDays,
  CheckCircle2,
  PackageSearch,
  PackagePlus,
  Receipt,
  ShoppingBag,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Item, Meta } from "@/types";
import { cn, formatQuantity, imageUrl, thresholdForItem, unitStep } from "@/lib/utils";
import { Button, Card, Spinner } from "@/components/ui";
import { TodayMealsCard } from "@/components/TodayMealsCard";
import { DataConfidenceStatus } from "@/components/DataConfidenceStatus";

/** The task-focused home screen: what needs attention today, meals, and inventory. */
export function OverviewTab({
  meta,
  onNavigate,
}: {
  meta: Meta;
  onNavigate: (tab: string) => void;
}) {
  const queryClient = useQueryClient();
  const [showSetupGuide, setShowSetupGuide] = useState(
    () => localStorage.getItem("pantry-setup-guide-dismissed") !== "1"
  );
  const { data: summary } = useQuery({ queryKey: ["summary"], queryFn: api.summary });
  const { data: counts } = useQuery({ queryKey: ["charts", "category-counts"], queryFn: api.chartCategoryCounts });
  const { data: items } = useQuery({ queryKey: ["items"], queryFn: () => api.items() });
  const { data: shopping } = useQuery({
    queryKey: ["shopping-list"],
    queryFn: api.shoppingList,
  });
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const { data: predictions } = useQuery({ queryKey: ["predictions"], queryFn: api.predictions });

  const thresholdFor = (i: Item) => thresholdForItem(i, settings);

  const consumeMutation = useMutation({
    mutationFn: async ({ item, amount }: { item: Item; amount: number }) => {
      if (item.quantity <= amount) {
        await api.deleteItem(item.id);
        return { item, removed: true };
      }
      await api.patchQuantity(item.id, item.quantity - amount);
      return { item, removed: false };
    },
    onSuccess: ({ item, removed }) => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["predictions"] });
      toast(`Used one ${item.title}`, {
        action: {
          label: "Undo",
          onClick: async () => {
            if (removed) await api.restoreItem(item);
            else await api.patchQuantity(item.id, item.quantity);
            queryClient.invalidateQueries({ queryKey: ["items"] });
            queryClient.invalidateQueries({ queryKey: ["summary"] });
          },
        },
      });
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
  const wellStocked = Math.max(0, totalItems - lowCount);

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
      sub: `${formatQuantity(i.quantity, i.unit)} left · add to list`,
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
      sub: `${formatQuantity(i.in_use_quantity, i.unit)} opened / in use`,
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
  const catCount = meta.categories.filter((c) => (counts?.[c] ?? 0) > 0).length;
  const openShopping = (shopping ?? []).filter((item) => !item.checked);
  const todayLabel = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());

  function dismissSetupGuide() {
    localStorage.setItem("pantry-setup-guide-dismissed", "1");
    setShowSetupGuide(false);
  }

  function leaveSetupGuide(tab: string) {
    dismissSetupGuide();
    onNavigate(tab);
  }

  if (totalItems === 0) {
    return (
      <div className="space-y-5">
        <DataConfidenceStatus onOpenBackups={() => onNavigate("settings")} />
        {showSetupGuide ? (
        <Card className="relative overflow-hidden p-6 sm:p-8">
          <div className="pointer-events-none absolute -right-12 -top-20 h-56 w-56 rounded-full bg-theme-200/70 blur-2xl" />
          <button
            type="button"
            onClick={dismissSetupGuide}
            className="absolute right-4 top-4 z-10 rounded-full p-2 text-subtle hover:bg-surface hover:text-content"
            aria-label="Dismiss pantry setup guide"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="relative max-w-3xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-theme-200 text-2xl">
                🛒
              </div>
              <div>
                <p className={label}>Pantry setup</p>
                <p className="mt-0.5 text-sm font-semibold text-theme-600 dark:text-theme-400">
                  Ready when you are
                </p>
              </div>
            </div>
            <h2 className="max-w-2xl font-display text-3xl font-semibold leading-tight text-content sm:text-4xl">
              Turn what you have—or what you’re buying—into a useful pantry.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">
              Add items directly, scan a receipt, or finish a shopping trip. Once products are in
              your pantry, stock alerts and spending insights will fill this dashboard automatically.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button onClick={() => leaveSetupGuide("add-items")}>
                <PackagePlus className="h-4 w-4" /> Add pantry items
              </Button>
              <Button variant="outline" onClick={() => leaveSetupGuide("shopping")}>
                <ShoppingBag className="h-4 w-4" />
                Shopping list{openShopping.length ? ` (${openShopping.length})` : ""}
              </Button>
            </div>
          </div>
        </Card>
        ) : (
          <Card className="flex flex-wrap items-center gap-3 px-5 py-4">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-theme-200 text-xl">🧺</span>
            <span className="min-w-52 flex-1">
              <span className="block font-display text-lg text-content">Your pantry is ready to fill</span>
              <span className="block text-xs text-muted">Add an item or finish a shopping trip when you’re ready.</span>
            </span>
            <Button size="sm" onClick={() => onNavigate("add-items")}>Add items</Button>
            <button
              type="button"
              onClick={() => setShowSetupGuide(true)}
              className="text-xs font-bold text-theme-600 hover:underline dark:text-theme-400"
            >
              Show guide
            </button>
          </Card>
        )}

        <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr] lg:items-start">
          <Card className="overflow-hidden">
            <div className="flex items-center gap-3 border-b border-line px-5 py-4 sm:px-6">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent-200 text-lg">
                🛍️
              </div>
              <div>
                <p className="font-display text-lg font-semibold text-content">Next shopping trip</p>
                <p className="text-xs text-subtle">
                  {openShopping.length
                    ? `${openShopping.length} ${openShopping.length === 1 ? "item" : "items"} waiting`
                    : "Your list is ready for planning"}
                </p>
              </div>
              <button
                onClick={() => onNavigate("shopping")}
                className="ml-auto flex items-center gap-1 text-sm font-bold text-theme-600 hover:underline dark:text-theme-400"
              >
                Open <ArrowRight className="h-4 w-4" />
              </button>
            </div>
            {openShopping.length ? (
              <ul className="divide-y divide-line">
                {openShopping.slice(0, 5).map((item) => (
                  <li key={item.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                    <span className="text-base">{item.category ? meta.icons[item.category] : "🛒"}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-content">
                      {item.title}
                    </span>
                    <span className="text-xs font-semibold text-subtle">
                      {formatQuantity(item.quantity, item.unit)}
                    </span>
                  </li>
                ))}
                {openShopping.length > 5 && (
                  <li className="px-5 py-3 text-center text-xs font-semibold text-subtle sm:px-6">
                    +{openShopping.length - 5} more on your list
                  </li>
                )}
              </ul>
            ) : (
              <div className="px-6 py-8 text-center">
                <p className="text-sm text-muted">Add products you want to pick up next.</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => onNavigate("shopping")}>
                  Build a list
                </Button>
              </div>
            )}
          </Card>

          <TodayMealsCard onNavigate={onNavigate} />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <EmptyOverviewAction
            icon={<Sparkles className="h-5 w-5" />}
            title="Quick add"
            description="Type an item or use a photo."
            onClick={() => onNavigate("add-items")}
          />
          <EmptyOverviewAction
            icon={<Receipt className="h-5 w-5" />}
            title="Scan a receipt"
            description="Bring a full grocery run in at once."
            onClick={() => onNavigate("add-items")}
          />
          <EmptyOverviewAction
            icon={<CalendarDays className="h-5 w-5" />}
            title="Plan meals"
            description="Keep this week’s cooking in view."
            onClick={() => onNavigate("meal-planner")}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <DataConfidenceStatus onOpenBackups={() => onNavigate("settings")} />
      {/* Today first; longer-term trends live in Insights. */}
      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className={cn(card, "overflow-hidden")}>
          <div className="border-b border-line px-6 py-5">
            <p className={label}>Today</p>
            <h2 className="mt-1 font-display text-2xl font-semibold text-content">{todayLabel}</h2>
            <p className="mt-1 text-sm text-muted">A short list of what is worth doing next.</p>
          </div>
          <div className="divide-y divide-line">
            <TodayPriority
              icon={<AlertTriangle className="h-5 w-5" />}
              tone="amber"
              title={expiringCount ? `${expiringCount} expiring soon` : "Nothing expiring soon"}
              detail={expiringCount ? "Use these first to avoid waste" : "Freshness looks good"}
              onClick={expiringCount ? () => onNavigate(summary.expiring_items[0].item.category) : undefined}
            />
            <TodayPriority
              icon={<PackageSearch className="h-5 w-5" />}
              tone="orange"
              title={lowCount ? `${lowCount} low-stock ${lowCount === 1 ? "item" : "items"}` : "Stock levels look good"}
              detail={lowCount ? "Add everything low to your shopping list" : "No restocking needed"}
              onClick={lowCount ? () => addLowStock.mutate() : undefined}
            />
            <TodayPriority
              icon={openShopping.length ? <ShoppingBag className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
              tone="theme"
              title={openShopping.length ? `${openShopping.length} waiting on your shopping list` : "Shopping list is clear"}
              detail={openShopping.length ? "Review the list or start shopping mode" : "Add items whenever you need them"}
              onClick={() => onNavigate("shopping")}
            />
          </div>
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
              const unit = i.unit;
              const thr = thresholdFor(i);
              const isLow = i.quantity <= thr;
              const fill = Math.max(6, Math.min(100, (i.quantity / (thr * 3)) * 100));
              const step = unitStep(unit);
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
                    onClick={() => consumeMutation.mutate({ item: i, amount: step })}
                    disabled={i.quantity < step}
                    className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-content hover:bg-surface disabled:opacity-40"
                  >
                    Used one
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
          <TodayMealsCard onNavigate={onNavigate} />

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

function TodayPriority({
  icon,
  tone,
  title,
  detail,
  onClick,
}: {
  icon: React.ReactNode;
  tone: "amber" | "orange" | "theme";
  title: string;
  detail: string;
  onClick?: () => void;
}) {
  const tones = {
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    orange: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
    theme: "bg-theme-200 text-theme-700 dark:text-theme-300",
  };
  const content = (
    <>
      <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", tones[tone])}>{icon}</span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-sm font-bold text-content">{title}</span>
        <span className="block text-xs text-muted">{detail}</span>
      </span>
      {onClick && <ArrowRight className="h-4 w-4 shrink-0 text-subtle" />}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-6 py-4 transition-colors hover:bg-surface">
      {content}
    </button>
  ) : (
    <div className="flex items-center gap-3 px-6 py-4">{content}</div>
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

function EmptyOverviewAction({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-3 rounded-2xl border border-line bg-surface-solid p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-theme-200 text-theme-700 dark:text-theme-300">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-content">{title}</span>
        <span className="block text-xs leading-5 text-muted">{description}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}
