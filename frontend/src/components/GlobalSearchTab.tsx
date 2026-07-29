import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { api } from "@/lib/api";
import type { Meta } from "@/types";
import { ItemCard, useUndoableDelete } from "@/components/ItemCard";
import { Button, Card, EmptyState, Input, Select } from "@/components/ui";
import { SORT_OPTIONS, sortItems } from "@/lib/utils";

const MEAL_SLOT_LABELS: Record<string, string> = {
  breakfast: "🍳 Breakfast",
  lunch: "🥪 Lunch",
  snack: "🍎 Snack",
  dinner: "🍝 Dinner",
  extra: "🍰 Extra",
};

/** Search across everything at once: inventory items (incl. alias matches), the shopping
 * list, and the meal planner - not just items. */
export function GlobalSearchTab({ meta }: { meta: Meta }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const queryClient = useQueryClient();
  const notifyDeleted = useUndoableDelete();

  const q = search.trim();
  const { data: results, isLoading } = useQuery({
    queryKey: ["search", q],
    queryFn: () => api.searchAll(q),
    enabled: q.length > 0,
  });
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: api.settings });

  const sortedItems = useMemo(() => sortItems(results?.items ?? [], sort), [results, sort]);
  const shoppingMatches = results?.shopping_list ?? [];
  const mealMatches = results?.meal_plan ?? [];
  const totalMatches = sortedItems.length + shoppingMatches.length + mealMatches.length;

  // Lazy-render inventory matches in pages to keep a broad search responsive.
  const PAGE_SIZE = 24;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [q, sort]);
  const visibleItems = sortedItems.slice(0, visibleCount);

  function thresholdFor(item: (typeof sortedItems)[number]) {
    if (item.custom_threshold != null) return item.custom_threshold;
    return meta.units[item.category] === "g" ? settings?.weight_threshold ?? 200 : settings?.count_threshold ?? 2;
  }

  return (
    <div className="space-y-5">
      <div className="glass flex flex-col gap-3 rounded-2xl p-4 shadow-md sm:flex-row sm:items-center">
        <div className="relative sm:max-w-md sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <Input
            placeholder="Search items, shopping list, and meal plan..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>
        <Select value={sort} onValueChange={setSort} options={SORT_OPTIONS} className="sm:max-w-[200px]" />
      </div>

      {!q && (
        <EmptyState
          icon="🔍"
          title="Search your whole pantry"
          description="Find anything across your inventory, shopping list, and meal plan - all at once. Aliases are matched too."
        />
      )}

      {isLoading && q && <p className="text-sm text-subtle">Searching...</p>}

      {!isLoading && q && totalMatches === 0 && (
        <EmptyState icon="🤷" title="No matches" description={`Nothing found for "${q}".`} />
      )}

      {sortedItems.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-display text-sm text-content">
            Inventory <span className="text-subtle">({sortedItems.length})</span>
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {visibleItems.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                meta={meta}
                threshold={thresholdFor(item)}
                onDeleted={(deleted) => {
                  notifyDeleted(deleted);
                  queryClient.invalidateQueries({ queryKey: ["items"] });
                  queryClient.invalidateQueries({ queryKey: ["summary"] });
                  queryClient.invalidateQueries({ queryKey: ["search"] });
                }}
              />
            ))}
          </div>
          {sortedItems.length > visibleCount && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
                Load more ({sortedItems.length - visibleCount} remaining)
              </Button>
            </div>
          )}
        </section>
      )}

      {shoppingMatches.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-display text-sm text-content">
            Shopping List <span className="text-subtle">({shoppingMatches.length})</span>
          </h3>
          <div className="space-y-2">
            {shoppingMatches.map((s) => (
              <Card key={s.id} className="flex items-center gap-2 p-3 text-sm">
                <span>{s.category ? meta.icons[s.category] : "🛍️"}</span>
                <span className={s.checked ? "text-subtle line-through" : "text-content"}>
                  {s.title}
                </span>
              </Card>
            ))}
          </div>
        </section>
      )}

      {mealMatches.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-display text-sm text-content">
            Meal Plan <span className="text-subtle">({mealMatches.length})</span>
          </h3>
          <div className="space-y-2">
            {mealMatches.map((m) => (
              <Card key={m.id} className="flex items-center gap-3 p-3 text-sm">
                <span className="shrink-0 text-xs font-bold text-subtle">{m.date}</span>
                <span className="shrink-0 text-xs text-subtle">
                  {MEAL_SLOT_LABELS[m.meal_slot] ?? m.meal_slot}
                </span>
                <span className={m.done ? "text-subtle line-through" : "text-content"}>{m.title}</span>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
