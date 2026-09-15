import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { api } from "@/lib/api";
import type { MealPlanEntry } from "@/types";
import { MEAL_SLOTS } from "@/components/mealPlanner.constants";
import { cn } from "@/lib/utils";

/** Glanceable "what's cooking today" card for the Overview tab - the meal planner is
 * this app's most-used feature, so it earns a spot on the home screen instead of only
 * being visible after navigating to the Meal Planner tab. */
export function TodayMealsCard({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const { data: entries } = useQuery({
    queryKey: ["meal-plan", todayStr, todayStr],
    queryFn: () => api.mealPlan(todayStr, todayStr),
  });

  const bySlot = (entries ?? []).reduce((map, e) => {
    if (!map.has(e.meal_slot)) map.set(e.meal_slot, []);
    map.get(e.meal_slot)!.push(e);
    return map;
  }, new Map<string, MealPlanEntry[]>());

  const hasAny = (entries ?? []).length > 0;

  return (
    <div className={cn("rounded-2xl border border-line bg-surface-solid shadow-sm", "p-6")}>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-subtle">
          Today's Meals
        </p>
        <button
          onClick={() => onNavigate("meal-planner")}
          className="text-[13px] font-semibold text-theme-600 hover:underline dark:text-theme-400"
        >
          Plan
        </button>
      </div>

      {hasAny ? (
        <div className="space-y-2.5">
          {MEAL_SLOTS.map((slot) => {
            const items = bySlot.get(slot.value);
            if (!items?.length) return null;
            return (
              <div key={slot.value} className="flex items-start gap-2.5">
                <span className="mt-0.5 text-base leading-none">{slot.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">
                    {slot.label}
                  </p>
                  <p className="truncate text-[14px] font-semibold text-content">
                    {items.map((i) => i.title).join(", ")}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <CalendarDays className="h-6 w-6 text-subtle" />
          <p className="text-sm text-muted">Nothing planned for today yet.</p>
          <button
            onClick={() => onNavigate("meal-planner")}
            className="text-[13px] font-semibold text-theme-600 hover:underline dark:text-theme-400"
          >
            Add a meal
          </button>
        </div>
      )}
    </div>
  );
}
