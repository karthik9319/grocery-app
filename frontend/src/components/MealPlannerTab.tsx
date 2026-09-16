import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { addDays, format, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight, CopyPlus, MessageCircle, Printer, ShoppingBag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { MealPlanEntry, MealSlot } from "@/types";
import { Button } from "@/components/ui";
import { MealCalendarView } from "@/components/MealCalendarView";
import { MealHistoryView } from "@/components/MealHistoryView";
import { MealEntryDialog } from "@/components/MealEntryDialog";
import { DATE_FMT, formatMealPlanForShare, type EditingState } from "@/components/mealPlanner.constants";
import { shareText } from "@/lib/utils";

type DropData = { type: "entry"; entry: MealPlanEntry } | { type: "slot"; date: string; slot: MealSlot };

export function MealPlannerTab() {
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [view, setView] = useState<"calendar" | "history">("calendar");
  const [draggingEntry, setDraggingEntry] = useState<MealPlanEntry | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const startStr = format(weekStart, DATE_FMT);
  const endStr = format(days[6], DATE_FMT);
  const todayStr = format(new Date(), DATE_FMT);

  const { data: entries } = useQuery({
    queryKey: ["meal-plan", startStr, endStr],
    queryFn: () => api.mealPlan(startStr, endStr),
  });

  const byDaySlot = useMemo(() => {
    const map = new Map<string, MealPlanEntry[]>();
    for (const e of entries ?? []) {
      const key = `${e.date}|${e.meal_slot}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [entries]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["meal-plan"] });
    queryClient.invalidateQueries({ queryKey: ["meal-history"] });
  };

  const addMutation = useMutation({
    mutationFn: (data: { date: string; slot: MealSlot; title: string; notes?: string; done?: boolean }) =>
      api.addMealPlanEntry(data.date, data.slot, data.title, data.notes, data.done),
    onSuccess: () => {
      invalidate();
      setEditing(null);
      toast.success("Added to meal plan");
    },
  });
  const updateMutation = useMutation({
    mutationFn: (data: { id: number; date: string; slot: MealSlot; title: string; notes?: string; done?: boolean }) =>
      api.updateMealPlanEntry(data.id, data.date, data.slot, data.title, data.notes, data.done),
    onSuccess: () => {
      invalidate();
      setEditing(null);
      toast.success("Meal plan updated");
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteMealPlanEntry(id),
    onSuccess: () => {
      invalidate();
      setEditing(null);
      toast.success("Removed from meal plan");
    },
  });

  const toggleDoneMutation = useMutation({
    mutationFn: ({ id, done }: { id: number; done: boolean }) => api.patchMealPlanDone(id, done),
    onSuccess: () => {
      invalidate();
    },
  });

  const addToShoppingListMutation = useMutation({
    mutationFn: (title: string) => api.addShoppingItem(title),
    onSuccess: (_res, title) => {
      queryClient.invalidateQueries({ queryKey: ["shopping-list"] });
      toast.success(`Added "${title}" to shopping list`, { icon: "🛍️" });
    },
  });

  const copyToNextWeekMutation = useMutation({
    mutationFn: async () => {
      const current = entries ?? [];
      await Promise.all(
        current.map((e) =>
          api.addMealPlanEntry(
            format(addDays(new Date(e.date), 7), DATE_FMT),
            e.meal_slot,
            e.title,
            e.notes ?? undefined,
            e.done
          )
        )
      );
      return current.length;
    },
    onSuccess: (count) => {
      invalidate();
      toast.success(
        count > 0 ? `Copied ${count} meal(s) to next week` : "Nothing this week to copy",
        { icon: "📋" }
      );
    },
  });

  const addWeekToShoppingListMutation = useMutation({
    mutationFn: async () => {
      const titles = Array.from(new Set((entries ?? []).map((e) => e.title)));
      await Promise.all(titles.map((title) => api.addShoppingItem(title)));
      return titles.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["shopping-list"] });
      toast.success(
        count > 0 ? `Added ${count} meal(s) to the shopping list` : "Nothing this week to add",
        { icon: "🛍️" }
      );
    },
  });

  const clearWeekMutation = useMutation({
    mutationFn: async () => {
      const current = entries ?? [];
      await Promise.all(current.map((e) => api.deleteMealPlanEntry(e.id)));
      return current;
    },
    onSuccess: (deleted) => {
      invalidate();
      if (deleted.length === 0) {
        toast("Nothing this week to clear");
        return;
      }
      toast(`Cleared ${deleted.length} meal(s) this week`, {
        action: {
          label: "Undo",
          onClick: async () => {
            await Promise.all(
              deleted.map((e) =>
                api.addMealPlanEntry(e.date, e.meal_slot, e.title, e.notes ?? undefined, e.done)
              )
            );
            invalidate();
            toast.success("Restored");
          },
        },
      });
    },
  });

  const swapMutation = useMutation({
    mutationFn: async ({ a, b }: { a: MealPlanEntry; b: MealPlanEntry }) => {
      await Promise.all([
        api.updateMealPlanEntry(a.id, b.date, b.meal_slot, a.title, a.notes ?? undefined, a.done),
        api.updateMealPlanEntry(b.id, a.date, a.meal_slot, b.title, b.notes ?? undefined, b.done),
      ]);
      return { a, b };
    },
    onSuccess: ({ a, b }) => {
      invalidate();
      toast.success(`Swapped "${a.title}" and "${b.title}"`, {
        action: {
          label: "Undo",
          onClick: async () => {
            await Promise.all([
              api.updateMealPlanEntry(a.id, a.date, a.meal_slot, a.title, a.notes ?? undefined, a.done),
              api.updateMealPlanEntry(b.id, b.date, b.meal_slot, b.title, b.notes ?? undefined, b.done),
            ]);
            invalidate();
            toast.success("Swap undone");
          },
        },
      });
    },
  });

  const moveMutation = useMutation({
    mutationFn: async ({ entry, date, slot }: { entry: MealPlanEntry; date: string; slot: MealSlot }) => {
      await api.updateMealPlanEntry(entry.id, date, slot, entry.title, entry.notes ?? undefined, entry.done);
      return { entry, from: { date: entry.date, slot: entry.meal_slot } };
    },
    onSuccess: ({ entry, from }) => {
      invalidate();
      toast.success(`Moved "${entry.title}"`, {
        action: {
          label: "Undo",
          onClick: async () => {
            await api.updateMealPlanEntry(
              entry.id,
              from.date,
              from.slot,
              entry.title,
              entry.notes ?? undefined,
              entry.done
            );
            invalidate();
            toast.success("Move undone");
          },
        },
      });
    },
  });

  function handleDragStart(event: DragStartEvent) {
    setDraggingEntry((event.active.data.current as { entry: MealPlanEntry } | undefined)?.entry ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingEntry(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const dragged = (active.data.current as { entry: MealPlanEntry } | undefined)?.entry;
    const target = over.data.current as DropData | undefined;
    if (!dragged || !target) return;

    if (target.type === "entry") {
      if (target.entry.date === dragged.date && target.entry.meal_slot === dragged.meal_slot) return;
      swapMutation.mutate({ a: dragged, b: target.entry });
    } else {
      if (target.date === dragged.date && target.slot === dragged.meal_slot) return;
      moveMutation.mutate({ entry: dragged, date: target.date, slot: target.slot });
    }
  }

  return (
    <div className="space-y-4">
      <div className="glass flex flex-wrap items-center gap-3 rounded-2xl p-3 shadow-md print:hidden">
        <div className="flex gap-1 rounded-lg border border-line p-0.5">
          <Button
            variant={view === "calendar" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("calendar")}
          >
            Calendar
          </Button>
          <Button
            variant={view === "history" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("history")}
          >
            History
          </Button>
        </div>
        {view === "calendar" && (
          <>
            <button
              onClick={() => setWeekStart((d) => addDays(d, -7))}
              aria-label="Previous week"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-line hover:bg-theme-200 cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <p className="flex-1 text-center font-display text-sm text-content">
              {format(weekStart, "MMM d")} – {format(days[6], "MMM d, yyyy")}
            </p>
            <button
              onClick={() => setWeekStart((d) => addDays(d, 7))}
              aria-label="Next week"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-line hover:bg-theme-200 cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={copyToNextWeekMutation.isPending}
              onClick={() => copyToNextWeekMutation.mutate()}
              title="Copy this week's meals to next week"
            >
              <CopyPlus className="h-4 w-4" /> Copy to next week
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => shareText(formatMealPlanForShare(days, byDaySlot, weekStart))}
              title="Share this week's meal plan to WhatsApp"
            >
              <MessageCircle className="h-4 w-4" /> Share
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={addWeekToShoppingListMutation.isPending}
              onClick={() => addWeekToShoppingListMutation.mutate()}
              title="Add this week's meals to the shopping list"
            >
              <ShoppingBag className="h-4 w-4" /> Add to shopping list
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={clearWeekMutation.isPending}
              onClick={() => clearWeekMutation.mutate()}
              title="Clear this week's meal plan"
            >
              <Trash2 className="h-4 w-4" /> Clear week
            </Button>
          </>
        )}
      </div>

      {view === "history" && (
        <MealHistoryView
          onQuickAdd={(slot, title) =>
            addMutation.mutate({ date: todayStr, slot, title })
          }
        />
      )}

      {view === "calendar" && (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <MealCalendarView
            days={days}
            byDaySlot={byDaySlot}
            todayStr={todayStr}
            weekStart={weekStart}
            setEditing={setEditing}
            onToggleDone={(data) => toggleDoneMutation.mutate(data)}
          />
          <DragOverlay>
            {draggingEntry && (
              <div className="rounded-lg border border-theme-500 bg-surface-solid px-2 py-1 text-xs font-semibold text-content shadow-lg">
                {draggingEntry.title}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      <MealEntryDialog
        editing={editing}
        onClose={() => setEditing(null)}
        onSave={(data) => {
          if (editing?.entry) {
            updateMutation.mutate({ id: editing.entry.id, ...data });
          } else {
            addMutation.mutate(data);
          }
        }}
        onDelete={editing?.entry ? () => deleteMutation.mutate(editing.entry!.id) : undefined}
        onAddToShoppingList={(title) => addToShoppingListMutation.mutate(title)}
        saving={addMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}
