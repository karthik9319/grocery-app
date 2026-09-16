import { useDraggable, useDroppable } from "@dnd-kit/core";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import type { MealPlanEntry, MealSlot } from "@/types";
import { Card, Checkbox } from "@/components/ui";
import { cn } from "@/lib/utils";
import { DATE_FMT, MEAL_SLOTS, type EditingState } from "@/components/mealPlanner.constants";

type SlotInfo = { value: MealSlot; label: string; icon: string };

/** A meal entry that's both a drag source (swap/move it elsewhere) and a drop target
 * (something else dropped on it swaps places with it). A short tap/click still opens
 * the edit dialog as normal - dnd-kit's activation distance means a plain click never
 * triggers a drag, so onClick fires exactly like before. */
function DraggableMealEntry({
  entry,
  dateStr,
  slot,
  onEdit,
  onToggleDone,
}: {
  entry: MealPlanEntry;
  dateStr: string;
  slot: SlotInfo;
  onEdit: () => void;
  onToggleDone: (data: { id: number; done: boolean }) => void;
}) {
  const dndId = `entry-${entry.id}`;
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: dndId,
    data: { entry },
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: dndId,
    data: { type: "entry" as const, entry },
  });

  return (
    <div
      ref={(node) => {
        setDragRef(node);
        setDropRef(node);
      }}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      aria-label={`Edit ${entry.title} (${slot.label} ${dateStr}). Drag to swap or move it.`}
      onClick={onEdit}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onEdit();
        }
      }}
      className={cn(
        "group flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-surface-solid px-2 py-1 text-left text-xs font-semibold text-content hover:bg-theme-200 cursor-grab active:cursor-grabbing print:items-start print:text-sm print:py-1.5",
        entry.done && "opacity-70",
        isDragging && "opacity-30",
        isOver && "border-theme-500 ring-2 ring-theme-500"
      )}
    >
      <span
        className={cn(
          "truncate print:min-w-0 print:whitespace-normal print:overflow-visible print:text-clip",
          entry.done && "line-through text-subtle"
        )}
      >
        {entry.title}
      </span>
      <label
        className="flex shrink-0 items-center gap-1"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <Checkbox
          checked={entry.done}
          onCheckedChange={(checked) => onToggleDone({ id: entry.id, done: checked === true })}
        />
      </label>
    </div>
  );
}

/** The dashed "+ Add" affordance below each slot's entries, doubling as a drop target
 * for moving a dragged meal into this day/slot (whether or not it already has meals). */
function DroppableSlotAdd({ dateStr, slot, onAdd }: { dateStr: string; slot: SlotInfo; onAdd: () => void }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `slot-${dateStr}-${slot.value}`,
    data: { type: "slot" as const, date: dateStr, slot: slot.value },
  });
  return (
    <button
      ref={setNodeRef}
      onClick={onAdd}
      className={cn(
        "flex w-full items-center justify-center gap-1 rounded-lg border-2 border-dashed border-line/40 py-1 text-[10px] font-semibold text-subtle hover:border-line hover:text-content cursor-pointer print:hidden",
        isOver && "border-theme-500 bg-theme-200 text-content"
      )}
    >
      <Plus className="h-3 w-3" /> Add
    </button>
  );
}

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
                          <DraggableMealEntry
                            key={e.id}
                            entry={e}
                            dateStr={dateStr}
                            slot={slot}
                            onEdit={() => setEditing({ date: dateStr, slot: slot.value, entry: e })}
                            onToggleDone={onToggleDone}
                          />
                        ))}
                        <DroppableSlotAdd
                          dateStr={dateStr}
                          slot={slot}
                          onAdd={() => setEditing({ date: dateStr, slot: slot.value })}
                        />
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
