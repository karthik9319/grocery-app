import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { MealPlanEntry, MealSlot } from "@/types";
import { Button, Card, Input, Label, Select, Textarea } from "@/components/ui";
import { Dialog, DialogContent } from "@/components/Dialog";
import { cn } from "@/lib/utils";

const MEAL_SLOTS: { value: MealSlot; label: string; icon: string }[] = [
  { value: "breakfast", label: "Breakfast", icon: "🍳" },
  { value: "lunch", label: "Lunch", icon: "🥪" },
  { value: "dinner", label: "Dinner", icon: "🍝" },
  { value: "snack", label: "Snack", icon: "🍎" },
];

const DATE_FMT = "yyyy-MM-dd";

type EditingState = {
  date: string;
  slot: MealSlot;
  entry?: MealPlanEntry;
};

export function MealPlannerTab() {
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [editing, setEditing] = useState<EditingState | null>(null);

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

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["meal-plan"] });

  const addMutation = useMutation({
    mutationFn: (data: { date: string; slot: MealSlot; title: string; notes?: string }) =>
      api.addMealPlanEntry(data.date, data.slot, data.title, data.notes),
    onSuccess: () => {
      invalidate();
      setEditing(null);
      toast.success("Added to meal plan");
    },
  });
  const updateMutation = useMutation({
    mutationFn: (data: { id: number; date: string; slot: MealSlot; title: string; notes?: string }) =>
      api.updateMealPlanEntry(data.id, data.date, data.slot, data.title, data.notes),
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

  return (
    <div className="space-y-4">
      <div className="glass flex flex-wrap items-center gap-3 rounded-2xl p-3 shadow-[4px_4px_0_var(--line)]">
        <button
          onClick={() => setWeekStart((d) => addDays(d, -7))}
          className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-content hover:bg-theme-200 cursor-pointer"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="flex-1 text-center font-display text-sm text-content">
          {format(weekStart, "MMM d")} – {format(days[6], "MMM d, yyyy")}
        </p>
        <button
          onClick={() => setWeekStart((d) => addDays(d, 7))}
          className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-content hover:bg-theme-200 cursor-pointer"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
        >
          Today
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {days.map((day) => {
          const dateStr = format(day, DATE_FMT);
          const isToday = dateStr === todayStr;
          return (
            <Card
              key={dateStr}
              className={cn("p-3", isToday && "border-theme-500 shadow-[4px_4px_0_var(--color-theme-500)]")}
            >
              <p className="font-display text-sm text-content">{format(day, "EEEE")}</p>
              <p className="mb-2 text-xs text-subtle">{format(day, "MMM d")}</p>
              <div className="space-y-2.5">
                {MEAL_SLOTS.map((slot) => {
                  const key = `${dateStr}|${slot.value}`;
                  const slotEntries = byDaySlot.get(key) ?? [];
                  return (
                    <div key={slot.value}>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-subtle">
                        {slot.icon} {slot.label}
                      </p>
                      <div className="mt-1 space-y-1">
                        {slotEntries.map((e) => (
                          <button
                            key={e.id}
                            onClick={() => setEditing({ date: dateStr, slot: slot.value, entry: e })}
                            className="group flex w-full items-center justify-between gap-1 rounded-lg border-2 border-content bg-surface-solid px-2 py-1 text-left text-xs font-semibold text-content hover:bg-theme-200 cursor-pointer"
                          >
                            <span className="truncate">{e.title}</span>
                          </button>
                        ))}
                        <button
                          onClick={() => setEditing({ date: dateStr, slot: slot.value })}
                          className="flex w-full items-center justify-center gap-1 rounded-lg border-2 border-dashed border-content/40 py-1 text-[10px] font-semibold text-subtle hover:border-content hover:text-content cursor-pointer"
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
        saving={addMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}

function MealEntryDialog({
  editing,
  onClose,
  onSave,
  onDelete,
  saving,
}: {
  editing: EditingState | null;
  onClose: () => void;
  onSave: (data: { date: string; slot: MealSlot; title: string; notes?: string }) => void;
  onDelete?: () => void;
  saving: boolean;
}) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState<MealSlot>("dinner");

  // Re-seed local state whenever a new entry/slot is opened for editing.
  const openKey = editing ? `${editing.date}|${editing.slot}|${editing.entry?.id ?? "new"}` : null;
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (editing && openKey !== seededFor) {
    setSeededFor(openKey);
    setTitle(editing.entry?.title ?? "");
    setNotes(editing.entry?.notes ?? "");
    setDate(editing.date);
    setSlot(editing.slot);
  }

  return (
    <Dialog open={!!editing} onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={editing?.entry ? "Edit meal" : "Add meal"}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Meal</Label>
              <Select
                value={slot}
                onValueChange={(v) => setSlot(v as MealSlot)}
                options={MEAL_SLOTS.map((s) => ({ value: s.value, label: `${s.icon} ${s.label}` }))}
              />
            </div>
          </div>
          <div>
            <Label>What's cooking?</Label>
            <Input
              placeholder="e.g. Spaghetti Bolognese"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Textarea
              placeholder="Ingredients, prep notes, who's cooking..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              className="flex-1"
              disabled={!title.trim() || saving}
              onClick={() => onSave({ date, slot, title: title.trim(), notes: notes.trim() || undefined })}
            >
              {editing?.entry ? "Save changes" : "Add to plan"}
            </Button>
            {onDelete && (
              <Button variant="danger" size="icon" onClick={onDelete} title="Remove">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <Button variant="outline" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
