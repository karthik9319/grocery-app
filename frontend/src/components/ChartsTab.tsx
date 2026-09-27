import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, PackagePlus, ShoppingBag } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/lib/api";
import type { Meta } from "@/types";
import { formatMoney, formatQuantity } from "@/lib/utils";
import { Button, Card, Select } from "@/components/ui";

export function ChartsTab({ meta, onNavigate }: { meta: Meta; onNavigate: (tab: string) => void }) {
  const [category, setCategory] = useState(meta.categories[0]);

  const { data: categoryCounts } = useQuery({
    queryKey: ["charts", "category-counts"],
    queryFn: api.chartCategoryCounts,
  });
  const { data: stockByItem } = useQuery({
    queryKey: ["charts", "stock-by-item", category],
    queryFn: () => api.chartStockByItem(category),
  });
  const { data: addedOverTime } = useQuery({
    queryKey: ["charts", "added-over-time", category],
    queryFn: () => api.chartAddedOverTime(category),
  });
  const { data: spend } = useQuery({
    queryKey: ["purchases", "summary"],
    queryFn: api.purchasesSummary,
  });
  const { data: shopping } = useQuery({
    queryKey: ["shopping-list"],
    queryFn: api.shoppingList,
  });
  const { data: mealHistory } = useQuery({
    queryKey: ["meal-plan-history"],
    queryFn: () => api.mealPlanHistory(),
  });

  const countsData = meta.categories.map((c) => ({
    category: c,
    items: categoryCounts?.[c] ?? 0,
    fill: meta.palette[c],
  }));
  const totalItems = countsData.reduce((sum, entry) => sum + entry.items, 0);

  if (categoryCounts && totalItems === 0) {
    const openShopping = (shopping ?? []).filter((item) => !item.checked);
    const mealCount = (mealHistory ?? []).reduce((sum, meal) => sum + meal.times_used, 0);
    return (
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <EmptyStat icon={<ShoppingBag className="h-5 w-5" />} label="To buy" value={openShopping.length} />
          <EmptyStat icon={<CalendarDays className="h-5 w-5" />} label="Meals recorded" value={mealCount} />
          <EmptyStat icon={<PackagePlus className="h-5 w-5" />} label="Pantry items" value={0} />
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
          <Card className="overflow-hidden">
            <div className="border-b border-line px-5 py-4">
              <h3 className="font-display text-lg text-content">Most repeated meals</h3>
              <p className="text-xs text-subtle">Based on your meal-planner history</p>
            </div>
            {(mealHistory ?? []).length ? (
              <div className="divide-y divide-line">
                {(mealHistory ?? []).slice(0, 6).map((meal) => (
                  <div key={`${meal.meal_slot}-${meal.title}`} className="flex items-center gap-3 px-5 py-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-content">{meal.title}</span>
                    <span className="rounded-full bg-theme-200 px-2 py-1 text-xs font-bold text-content">
                      {meal.times_used}×
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-5 py-8 text-center text-sm text-muted">Plan meals to build your history.</p>
            )}
          </Card>

          <Card className="flex flex-col justify-between p-6">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-subtle">Pantry insights</p>
              <h3 className="mt-2 font-display text-2xl text-content">Your pantry story starts with one item.</h3>
              <p className="mt-2 text-sm leading-6 text-muted">
                Shopping and meal activity already appear here. Stock and freshness charts will join them once items reach your pantry.
              </p>
            </div>
            <Button className="mt-5" onClick={() => onNavigate("add-items")}>Add an item</Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {spend && spend.total_spend > 0 && (
        <Card className="p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="font-semibold text-content">💰 Spending</h3>
            <span className="font-display text-lg text-content">
              {formatMoney(spend.total_spend)} <span className="text-xs text-subtle">total</span>
            </span>
          </div>
          {spend.spend_over_time.length > 0 && (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={spend.spend_over_time}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} label={{ value: "Spend (₹)", angle: -90, position: "insideLeft", fontSize: 12 }} />
                <Tooltip formatter={(v) => formatMoney(Number(v))} />
                <Bar dataKey="total" fill="#1B7A4D" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
          {spend.spend_by_item.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-sm font-semibold text-content">Top items by spend</p>
              <ResponsiveContainer width="100%" height={Math.max(160, spend.spend_by_item.length * 34)}>
                <BarChart data={spend.spend_by_item} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eee" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="title" tick={{ fontSize: 12 }} width={110} />
                  <Tooltip formatter={(v) => formatMoney(Number(v))} />
                  <Bar dataKey="total" fill="#6C63FF" radius={[0, 2, 2, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      )}

      <Card className="p-5">
        <h3 className="mb-3 font-semibold text-content">📁 Items per category</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={countsData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
            <XAxis dataKey="category" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="items" radius={[2, 2, 0, 0]}>
              {countsData.map((entry) => (
                <Cell key={entry.category} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <div className="max-w-xs">
        <Select
          value={category}
          onValueChange={setCategory}
          options={meta.categories.map((c) => ({ value: c, label: `${meta.icons[c]} ${c}` }))}
        />
      </div>

      <Card className="p-5">
        <h3 className="mb-3 font-semibold text-content">
          📦 Stock by item — {meta.icons[category]} {category}
        </h3>
        {stockByItem && stockByItem.length > 0 ? (
          <div className="divide-y divide-line rounded-xl border border-line">
            {stockByItem.map((item, index) => (
              <div key={`${item.title}-${index}`} className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="truncate text-sm font-semibold text-content">{item.title}</span>
                <span className="shrink-0 text-sm tabular-nums text-muted">
                  {formatQuantity(item.quantity, item.unit)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-subtle">No {category.toLowerCase()} yet.</p>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 font-semibold text-content">📈 {category} added over time</h3>
        {addedOverTime && addedOverTime.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={addedOverTime}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} label={{ value: "Items added", angle: -90, position: "insideLeft", fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="items" fill={meta.palette[category]} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-subtle">No data yet.</p>
        )}
      </Card>
    </div>
  );
}

function EmptyStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-theme-200 text-theme-700 dark:text-theme-300">
        {icon}
      </span>
      <span>
        <span className="block text-xs font-bold uppercase tracking-wide text-subtle">{label}</span>
        <span className="font-display text-2xl text-content">{value}</span>
      </span>
    </Card>
  );
}
