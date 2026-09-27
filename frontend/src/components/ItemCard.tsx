import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Item, Meta } from "@/types";
import { api } from "@/lib/api";
import { daysUntil, formatQuantity, imageUrl, unitStep } from "@/lib/utils";
import { Badge, Button, Card, Checkbox } from "@/components/ui";
import { EditItemDialog } from "@/components/EditItemDialog";
import { PhotoGalleryDialog } from "@/components/PhotoGalleryDialog";

export function ItemCard({
  item,
  meta,
  threshold,
  onDeleted,
  selectable = false,
  selected = false,
  onToggleSelect,
}: {
  item: Item;
  meta: Meta;
  threshold: number;
  onDeleted: (item: Item) => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: number) => void;
}) {
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const unit = item.unit;
  const dotColor = meta.palette[item.category] ?? "#999";
  const isLow = item.quantity <= threshold;
  const expDays = daysUntil(item.expiration_date);
  // Fast-scan freshness indicator (only meaningful for items with a tracked expiration).
  const freshness =
    expDays == null
      ? null
      : expDays < 0
        ? { color: "#ef4444", label: "Expired" }
        : expDays <= 3
          ? { color: "#f59e0b", label: "Expiring soon" }
          : { color: "#22c55e", label: "Fresh" };
  const useStep = unitStep(unit);

  const qtyMutation = useMutation({
    mutationFn: (quantity: number) => api.patchQuantity(item.id, quantity),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
    },
  });

  const returnItemMutation = useMutation({
    mutationFn: (amount: number) => api.returnItem(item.id, amount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["predictions"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteItem(item.id),
    onSuccess: (deleted) => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["backups"] });
      queryClient.invalidateQueries({ queryKey: ["predictions"] });
      onDeleted(deleted);
    },
  });

  const img = imageUrl(item.image_path);

  function changeQuantity(next: number) {
    const prev = item.quantity;
    qtyMutation.mutate(next);
    if (next > 0) {
      toast(`${item.title}: ${formatQuantity(next, unit)}`, {
        action: { label: "Undo", onClick: () => qtyMutation.mutate(prev) },
      });
    }
  }

  function returnOne() {
    returnItemMutation.mutate(useStep);
    toast(`Returned ${formatQuantity(useStep, unit)} of ${item.title} to stock`, {
      action: { label: "Undo", onClick: () => api.useItem(item.id, useStep) },
    });
  }

  function consumeOne() {
    if (item.quantity <= useStep) {
      deleteMutation.mutate();
      return;
    }
    const previous = item.quantity;
    const next = Math.max(0, previous - useStep);
    qtyMutation.mutate(next);
    toast(`Used ${formatQuantity(useStep, unit)} of ${item.title}`, {
      action: { label: "Undo", onClick: () => qtyMutation.mutate(previous) },
    });
  }

  return (
    <Card
      interactive
      className="flex flex-wrap items-center gap-4 overflow-hidden p-4 animate-fade-in"
      onClick={selectable ? () => onToggleSelect?.(item.id) : undefined}
    >
      {selectable && (
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelect?.(item.id)}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0"
        />
      )}
      <div
        className={
          img && !selectable
            ? "relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-line cursor-zoom-in"
            : "relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-line"
        }
        onClick={
          img && !selectable
            ? (e) => {
                e.stopPropagation();
                setGalleryOpen(true);
              }
            : undefined
        }
        onKeyDown={
          img && !selectable
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  setGalleryOpen(true);
                }
              }
            : undefined
        }
        role={img && !selectable ? "button" : undefined}
        tabIndex={img && !selectable ? 0 : undefined}
        aria-label={img && !selectable ? `View photos of ${item.title}` : undefined}
        title={img && !selectable ? "View photos" : undefined}
      >
        {img ? (
          <img src={img} alt={item.title} className="h-full w-full object-cover" />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-xl"
            style={{ backgroundColor: `${dotColor}33` }}
          >
            {meta.icons[item.category]}
          </div>
        )}
        {freshness && (
          <span
            className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full ring-2 ring-surface-solid"
            style={{ backgroundColor: freshness.color }}
            title={freshness.label}
          />
        )}
      </div>

      <div className="min-w-[150px] flex-1 basis-40">
        <div className="flex items-center gap-2">
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-line text-xs"
            style={{ backgroundColor: `${dotColor}33` }}
            title={item.category}
          >
            {meta.icons[item.category]}
          </span>
          <p className="min-w-0 truncate font-semibold text-content">{item.title}</p>
          <span className="shrink-0 text-sm text-subtle">
            ({formatQuantity(item.quantity, unit)})
          </span>
        </div>
        {item.notes && <p className="mt-0.5 truncate text-xs text-subtle">{item.notes}</p>}
        <div className="mt-1 flex flex-wrap gap-1.5">
          {isLow && <Badge color="orange">⚠️ Low stock</Badge>}
          {item.in_use_quantity > 0 && (
            <Badge color="accent">In use {formatQuantity(item.in_use_quantity, unit)}</Badge>
          )}
          {expDays != null && expDays < 0 && <Badge color="red">❌ Expired</Badge>}
          {expDays != null && expDays >= 0 && expDays <= 3 && (
            <Badge color="orange">⏰ {expDays === 0 ? "Expires today" : `Expires in ${expDays}d`}</Badge>
          )}
          {item.custom_threshold != null && (
            <Badge color="neutral">Alert at {formatQuantity(item.custom_threshold, unit)}</Badge>
          )}
          {item.storage_location && (
            <Badge color="neutral">
              {meta.storage_location_icons[item.storage_location]} {item.storage_location}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {!selectable && (
          <>
            <button
              onClick={() => changeQuantity(item.quantity + useStep)}
              aria-label={`Add ${formatQuantity(useStep, unit)} to ${item.title}`}
              title="Add one to stock"
              className="h-8 rounded-lg border border-line px-2 text-xs font-bold text-content hover:bg-theme-200 transition-colors cursor-pointer"
            >
              + Stock
            </button>
            <Button
              type="button"
              size="sm"
              className="h-8 px-2.5 text-xs"
              disabled={qtyMutation.isPending || deleteMutation.isPending || item.quantity <= 0}
              onClick={consumeOne}
            >
              Used one
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 px-2 text-xs"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              Finished
            </Button>
            {item.in_use_quantity >= useStep && (
              <button
                type="button"
                disabled={returnItemMutation.isPending}
                onClick={returnOne}
                className="h-8 rounded-lg px-2 text-xs font-bold text-theme-600 hover:bg-theme-200 dark:text-theme-400"
              >
                Return opened
              </button>
            )}
          </>
        )}
      </div>

      {!selectable && (
        <div className="flex shrink-0 gap-1">
          <button
            onClick={() => setEditOpen(true)}
            aria-label={`Edit ${item.title}`}
            className="h-9 w-9 flex items-center justify-center rounded-xl border border-line text-content hover:bg-theme-200 cursor-pointer transition-colors"
          >
            <Pencil className="h-4 w-4" aria-hidden />
          </button>
          <button
            onClick={() => {
              deleteMutation.mutate();
            }}
            aria-label={`Delete ${item.title}`}
            className="h-9 w-9 flex items-center justify-center rounded-xl border border-line text-content hover:bg-red-400 hover:text-white cursor-pointer transition-colors"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      <EditItemDialog item={item} meta={meta} open={editOpen} onOpenChange={setEditOpen} />
      <PhotoGalleryDialog item={item} open={galleryOpen} onOpenChange={setGalleryOpen} />
    </Card>
  );
}

export function useUndoableDelete() {
  const queryClient = useQueryClient();
  return (item: Item) => {
    toast(`Removed "${item.title}"`, {
      action: {
        label: "Undo",
        onClick: async () => {
          await api.restoreItem(item);
          queryClient.invalidateQueries({ queryKey: ["items"] });
          queryClient.invalidateQueries({ queryKey: ["summary"] });
          toast.success(`Restored "${item.title}"`);
        },
      },
    });
  };
}
