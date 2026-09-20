import { useState } from "react";
import { ShoppingBag, Trash2, X } from "lucide-react";
import type { MealSlot } from "@/types";
import { Button, Checkbox, Input, Label, Select, Textarea } from "@/components/ui";
import { Dialog, DialogContent } from "@/components/Dialog";
import { MEAL_SLOTS, type EditingState } from "@/components/mealPlanner.constants";
import { MealTitleAutocomplete } from "@/components/MealTitleAutocomplete";

export function MealEntryDialog({
  editing,
  onClose,
  onSave,
  onDelete,
  onAddToShoppingList,
  saving,
}: {
  editing: EditingState | null;
  onClose: () => void;
  onSave: (data: { date: string; slot: MealSlot; title: string; notes?: string; done?: boolean }) => void;
  onDelete?: () => void;
  onAddToShoppingList: (title: string) => void;
  saving: boolean;
}) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState<MealSlot>("dinner");
  const [done, setDone] = useState(false);

  // Re-seed local state every time a *new* open request comes in - compared by object
  // identity, not content, since two separate "+ Add" clicks for the same day/slot
  // produce content-identical {date, slot} objects (no entry, no id to distinguish
  // them). A content-based key would treat those as "the same" open request and skip
  // re-seeding, leaving whatever was typed for the previous add still sitting there.
  const [seededFor, setSeededFor] = useState<EditingState | null>(null);
  if (editing && editing !== seededFor) {
    setSeededFor(editing);
    setTitle(editing.entry?.title ?? "");
    setNotes(editing.entry?.notes ?? "");
    setDate(editing.date);
    setSlot(editing.slot);
    setDone(editing.entry?.done ?? false);
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
            <MealTitleAutocomplete slot={slot} value={title} onChange={setTitle} />
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
          {editing?.entry && (
            <label className="flex items-center gap-2 text-sm text-content">
              <Checkbox checked={done} onCheckedChange={(v) => setDone(v === true)} />
              Mark as done
            </label>
          )}
          <div className="flex gap-2 pt-2">
            <Button
              className="flex-1"
              disabled={!title.trim() || saving}
              onClick={() =>
                onSave({ date, slot, title: title.trim(), notes: notes.trim() || undefined, done })
              }
            >
              {editing?.entry ? "Save changes" : "Add to plan"}
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={!title.trim()}
              onClick={() => onAddToShoppingList(title.trim())}
              title="Add to shopping list"
            >
              <ShoppingBag className="h-4 w-4" />
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
