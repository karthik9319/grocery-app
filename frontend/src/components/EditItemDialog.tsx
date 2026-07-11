import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X } from "lucide-react";
import type { Item, Meta } from "@/types";
import { api } from "@/lib/api";
import { imageUrl, cn, titleCase } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/Dialog";
import { Badge, Button, Checkbox, Input, Label, Select, Textarea } from "@/components/ui";
import { TitleAutocomplete } from "@/components/TitleAutocomplete";

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
  const [newAlias, setNewAlias] = useState("");

  const aliasesQuery = useQuery({
    queryKey: ["item-aliases", item.id],
    queryFn: () => api.itemAliases(item.id),
    enabled: open,
  });
  const photosQuery = useQuery({
    queryKey: ["item-photos", item.id],
    queryFn: () => api.itemPhotos(item.id),
    enabled: open,
  });

  const addAliasMutation = useMutation({
    mutationFn: (alias: string) => api.addItemAlias(item.id, alias),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["item-aliases", item.id] });
      setNewAlias("");
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Couldn't add alias.";
      toast.error(message);
    },
  });
  const removeAliasMutation = useMutation({
    mutationFn: (aliasId: number) => api.removeItemAlias(item.id, aliasId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["item-aliases", item.id] }),
  });
  const addPhotoMutation = useMutation({
    mutationFn: (file: File) => api.addItemPhoto(item.id, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["item-photos", item.id] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
    },
    onError: () => toast.error("Couldn't upload photo."),
  });
  const setCoverMutation = useMutation({
    mutationFn: (photoId: number) => api.setItemPhotoCover(item.id, photoId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["items"] }),
  });
  const deletePhotoMutation = useMutation({
    mutationFn: (photoId: number) => api.deleteItemPhoto(item.id, photoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["item-photos", item.id] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const cleanTitle = titleCase(title);
      await api.updateItem(item.id, {
        title: cleanTitle,
        category,
        quantity,
        notes,
        custom_threshold: useCustomThreshold ? customThreshold : null,
        expiration_date: trackExpiry ? expiryDate : null,
        image: newImage,
      });
      if (isFavorite) {
        await api.addFavorite(cleanTitle, category, favoriteQty);
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
            <TitleAutocomplete
              value={title}
              onChange={setTitle}
              onBlur={() => setTitle((t) => titleCase(t))}
              onSelectSuggestion={(s) => {
                setTitle(s.title);
                setCategory(s.category);
              }}
            />
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
              className="block w-full text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-lg file:border-2 file:border-content file:bg-theme-400 file:px-3 file:py-1.5 file:text-white file:font-bold"
            />
          </div>

          <div>
            <Label>Aliases (other names that merge into this item)</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {(aliasesQuery.data ?? []).map((a) => (
                <Badge key={a.id} color="neutral" className="gap-1.5">
                  {a.alias}
                  <button
                    type="button"
                    onClick={() => removeAliasMutation.mutate(a.id)}
                    className="hover:text-red-600"
                    aria-label={`Remove alias ${a.alias}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {(aliasesQuery.data ?? []).length === 0 && (
                <span className="text-xs text-subtle">
                  No aliases yet - e.g. add "soda" so it merges into this item.
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                value={newAlias}
                onChange={(e) => setNewAlias(e.target.value)}
                placeholder='e.g. "soda"'
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newAlias.trim()) {
                    e.preventDefault();
                    addAliasMutation.mutate(newAlias.trim());
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={!newAlias.trim() || addAliasMutation.isPending}
                onClick={() => addAliasMutation.mutate(newAlias.trim())}
              >
                Add
              </Button>
            </div>
          </div>

          <div>
            <Label>Photos</Label>
            <div className="grid grid-cols-4 gap-2 mb-2">
              {(photosQuery.data ?? []).map((p) => {
                const isCover = item.image_path === p.image_path;
                return (
                  <div key={p.id} className="relative group">
                    <img
                      src={imageUrl(p.image_path) ?? undefined}
                      alt="Item"
                      className={cn(
                        "h-16 w-16 rounded-lg border-2 object-cover",
                        isCover ? "border-theme-500" : "border-content"
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => deletePhotoMutation.mutate(p.id)}
                      className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-content bg-red-500 text-white"
                      aria-label="Delete photo"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    {isCover ? (
                      <span className="absolute inset-x-0 bottom-0 rounded-b-lg bg-theme-500 py-0.5 text-center text-[10px] font-bold text-white">
                        Cover
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setCoverMutation.mutate(p.id)}
                        className="absolute inset-x-0 bottom-0 rounded-b-lg bg-black/60 py-0.5 text-[10px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        Set cover
                      </button>
                    )}
                  </div>
                );
              })}
              {(photosQuery.data ?? []).length === 0 && (
                <span className="col-span-4 text-xs text-subtle">No extra photos yet.</span>
              )}
            </div>
            <input
              type="file"
              accept="image/png,image/jpeg,.heic,.heif"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) addPhotoMutation.mutate(file);
                e.target.value = "";
              }}
              className="block w-full text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-lg file:border-2 file:border-content file:bg-theme-400 file:px-3 file:py-1.5 file:text-white file:font-bold"
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
