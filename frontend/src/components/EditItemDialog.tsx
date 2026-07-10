import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Item, Meta } from "@/types";
import { api } from "@/lib/api";
import { Dialog, DialogContent } from "@/components/Dialog";
import { Button, Checkbox, Input, Label, Select, Textarea } from "@/components/ui";

export function EditItemDialog({
  item,
  meta,
  open,
  onOpenChange,
}: {
  item: Item;
  meta: Meta;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(item.title);
  const [category, setCategory] = useState(item.category);
  const [quantity, setQuantity] = useState(item.quantity);
  const [notes, setNotes] = useState(item.notes ?? "");
  const [useCustomThreshold, setUseCustomThreshold] = useState(item.custom_threshold != null);
  const [customThreshold, setCustomThreshold] = useState(item.custom_threshold ?? 2);
  const [trackExpiry, setTrackExpiry] = useState(item.expiration_date != null);
  const [expiryDate, setExpiryDate] = useState(item.expiration_date ?? "");
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteQty, setFavoriteQty] = useState(item.quantity);
  const [newImage, setNewImage] = useState<File | null>(null);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await api.updateItem(item.id, {
        title,
        category,
        quantity,
        notes,
        custom_threshold: useCustomThreshold ? customThreshold : null,
        expiration_date: trackExpiry ? expiryDate : null,
        image: newImage,
      });
      if (isFavorite) {
        await api.addFavorite(title, category, favoriteQty);
      } else {
        await api.removeFavorite(item.title, item.category);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
      toast.success(`Saved changes to "${title}"`);
      onOpenChange(false);
    },
    onError: () => toast.error("Couldn't save changes."),
  });

  const unit = meta.units[category];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Edit item">
        <div className="space-y-4">
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div>
            <Label>Category</Label>
            <Select
              value={category}
              onValueChange={setCategory}
              options={meta.categories.map((c) => ({
                value: c,
                label: `${meta.icons[c]} ${c}`,
              }))}
            />
          </div>

          <div>
            <Label>Quantity {unit === "g" ? "(grams)" : ""}</Label>
            <Input
              type="number"
              value={quantity}
              step={unit === "g" ? 50 : 1}
              onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
            />
          </div>

          <div>
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={useCustomThreshold}
              onCheckedChange={(v) => setUseCustomThreshold(v === true)}
            />
            <span className="text-sm text-content">Custom low-stock threshold</span>
          </label>
          {useCustomThreshold && (
            <Input
              type="number"
              value={customThreshold}
              onChange={(e) => setCustomThreshold(parseFloat(e.target.value) || 0)}
              placeholder={`Alert at/below (${unit === "g" ? "grams" : "count"})`}
            />
          )}

          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={trackExpiry} onCheckedChange={(v) => setTrackExpiry(v === true)} />
            <span className="text-sm text-content">Track expiration</span>
          </label>
          {trackExpiry && (
            <Input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          )}

          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={isFavorite} onCheckedChange={(v) => setIsFavorite(v === true)} />
            <span className="text-sm text-content">⭐ Favorite (quick re-add from home)</span>
          </label>
          {isFavorite && (
            <Input
              type="number"
              value={favoriteQty}
              onChange={(e) => setFavoriteQty(parseFloat(e.target.value) || 0)}
              placeholder="Quick-add amount"
            />
          )}

          <div>
            <Label>Replace photo (optional)</Label>
            <input
              type="file"
              accept="image/png,image/jpeg,.heic,.heif"
              onChange={(e) => setNewImage(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-gradient-to-r file:from-brand-500 file:to-household-500 file:px-3 file:py-1.5 file:text-white file:font-semibold"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              className="flex-1"
              disabled={saveMutation.isPending || !title.trim()}
              onClick={() => saveMutation.mutate()}
            >
              Save changes
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
