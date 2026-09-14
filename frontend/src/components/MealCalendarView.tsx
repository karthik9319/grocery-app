import { format } from "date-fns";
import { Plus } from "lucide-react";
import type { MealPlanEntry } from "@/types";
import { Card, Checkbox } from "@/components/ui";
import { cn } from "@/lib/utils";
import { DATE_FMT, MEAL_SLOTS, type EditingState } from "@/components/mealPlanner.constants";

export function MealCalendarView({
  days,
  byDaySlot,
  todayStr,
  weekStart,
  setEditing,
  onToggleDone,
}: {
  days: Date[];
  byDaySlot: Map<string, MealPlanEntry[]>;
  todayStr: string;
  weekStart: Date;
  setEditing: (state: EditingState) => void;
  onToggleDone: (data: { id: number; done: boolean }) => void;
}) {
  return (
    <>
      <p className="hidden text-center font-display text-lg text-content print:block">
        Weekly Meal Plan &middot; {format(weekStart, "MMM d")} – {format(days[6], "MMM d, yyyy")}
      </p>

      <div className="flex gap-3 overflow-x-auto pb-2 print:grid print:grid-cols-7 print:gap-2 print:overflow-visible print:pb-0">
        {days.map((day) => {
          const dateStr = format(day, DATE_FMT);
          const isToday = dateStr === todayStr;
          return (
            <Card
              key={dateStr}
              className={cn(
                "w-[210px] shrink-0 p-3 print:w-auto print:shrink",
                isToday && "border-theme-500 shadow-md"
              )}
            >
              <p className="font-display text-sm text-content print:text-base">{format(day, "EEEE")}</p>
              <p className="mb-2 text-xs text-subtle print:text-sm">{format(day, "MMM d")}</p>
              <div className="space-y-2.5">
                {MEAL_SLOTS.map((slot) => {
                  const key = `${dateStr}|${slot.value}`;
                  const slotEntries = byDaySlot.get(key) ?? [];
                  return (
                    <div key={slot.value}>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-subtle print:text-xs">
                        {slot.icon} {slot.label}
                      </p>
                      <div className="mt-1 space-y-1">
                        {slotEntries.map((e) => (
                          <div
                            key={e.id}
                            role="button"
                            tabIndex={0}
                            aria-label={`Edit ${e.title} (${slot.label} ${dateStr})`}
                            onClick={() => setEditing({ date: dateStr, slot: slot.value, entry: e })}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setEditing({ date: dateStr, slot: slot.value, entry: e });
                              }
                            }}
                            className={cn(
                              "group flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-surface-solid px-2 py-1 text-left text-xs font-semibold text-content hover:bg-theme-200 cursor-pointer print:items-start print:text-sm print:py-1.5",
                              e.done && "opacity-70"
                            )}
                          >
                            <span
                              className={cn(
                                "truncate print:min-w-0 print:whitespace-normal print:overflow-visible print:text-clip",
                                e.done && "line-through text-subtle"
                              )}
                            >
                              {e.title}
                            </span>
                            <label
                              className="flex shrink-0 items-center gap-1"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <Checkbox
                                checked={e.done}
                                onCheckedChange={(checked) =>
                                  onToggleDone({ id: e.id, done: checked === true })
                                }
                              />
                            </label>
                          </div>
                        ))}
                        <button
                          onClick={() => setEditing({ date: dateStr, slot: slot.value })}
                          className="flex w-full items-center justify-center gap-1 rounded-lg border-2 border-dashed border-line/40 py-1 text-[10px] font-semibold text-subtle hover:border-line hover:text-content cursor-pointer print:hidden"
                        >
                          <Plus className="h-3 w-3" /> Add
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
