import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { api } from "@/lib/api";
import type { MealHistoryEntry, MealSlot } from "@/types";
import { Card } from "@/components/ui";
import { MEAL_SLOTS } from "@/components/mealPlanner.constants";

export function MealHistoryView({
  onQuickAdd,
}: {
  onQuickAdd: (slot: MealSlot, title: string) => void;
}) {
  const { data: history } = useQuery({
    queryKey: ["meal-history"],
    queryFn: () => api.mealPlanHistory(),
  });

  const bySlot = useMemo(() => {
    const map = new Map<MealSlot, MealHistoryEntry[]>();
    for (const h of history ?? []) {
      if (!map.has(h.meal_slot)) map.set(h.meal_slot, []);
      map.get(h.meal_slot)!.push(h);
    }
    return map;
  }, [history]);

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {MEAL_SLOTS.map((slot) => {
        const entries = bySlot.get(slot.value) ?? [];
        return (
          <Card key={slot.value} className="p-3">
            <p className="font-display text-sm text-content">
              {slot.icon} {slot.label}
            </p>
            <p className="mb-2 text-xs text-subtle">
              {entries.length ? `${entries.length} item(s) tracked` : "Nothing tracked yet"}
            </p>
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {entries.map((e) => (
                <button
                  key={e.title}
                  type="button"
                  onClick={() => onQuickAdd(slot.value, e.title)}
                  title={`Add "${e.title}" to today's ${slot.label}`}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-surface-solid px-2 py-1.5 text-left text-xs font-semibold text-content hover:bg-theme-200 cursor-pointer"
                >
                  <span className="truncate">{e.title}</span>
                  <span className="shrink-0 text-[10px] font-medium text-subtle">
                    {e.times_used}x &middot; {format(new Date(e.last_used), "MMM d")}
                  </span>
                </button>
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
