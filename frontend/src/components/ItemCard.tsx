import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import type { Item, Meta } from "@/types";
import { api } from "@/lib/api";
import { daysUntil, formatQuantity, imageUrl, unitStep } from "@/lib/utils";
import { Badge, Button, Card, Checkbox, Input } from "@/components/ui";
import { EditItemDialog } from "@/components/EditItemDialog";
import { PhotoGalleryDialog } from "@/components/PhotoGalleryDialog";
import { Dialog, DialogContent } from "@/components/Dialog";

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
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustQuantity, setAdjustQuantity] = useState(String(item.quantity));
  const [swipeX, setSwipeX] = useState(0);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const swipeOffset = useRef(0);
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
      queryClient.invalidateQueries({ queryKey: ["predictions"] });
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

  function beginSwipe(event: React.PointerEvent<HTMLDivElement>) {
    if (selectable || event.pointerType !== "touch") return;
    if ((event.target as HTMLElement).closest("button, input, [role='button']")) return;
    swipeStart.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveSwipe(event: React.PointerEvent<HTMLDivElement>) {
    if (!swipeStart.current) return;
    const dx = event.clientX - swipeStart.current.x;
    const dy = event.clientY - swipeStart.current.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      const next = Math.max(-110, Math.min(110, dx));
      swipeOffset.current = next;
      setSwipeX(next);
    }
  }

  function endSwipe() {
    if (swipeOffset.current > 72) consumeOne();
    if (swipeOffset.current < -72) deleteMutation.mutate();
    swipeStart.current = null;
    swipeOffset.current = 0;
    setSwipeX(0);
  }

  function openAdjustment() {
    setAdjustQuantity(String(item.quantity));
    setAdjustOpen(true);
  }

  function saveAdjustment() {
    const next = Number(adjustQuantity);
    if (!Number.isFinite(next) || next < 0) {
      toast.error("Enter a valid quantity.");
      return;
    }
    if (next === 0) deleteMutation.mutate();
    else changeQuantity(next);
    setAdjustOpen(false);
  }

  return (
    <div className="relative overflow-hidden rounded-2xl animate-pop">
      {!selectable && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-between rounded-2xl px-5 text-xs font-extrabold text-white">
          <span className="rounded-full bg-emerald-600 px-3 py-1.5">Used one</span>
          <span className="rounded-full bg-rose-600 px-3 py-1.5">Finished</span>
        </div>
      )}
      <Card
        interactive
        className="relative flex flex-wrap items-center gap-4 overflow-hidden p-4 transition-transform duration-150"
        style={{ transform: `translateX(${swipeX}px)`, touchAction: "pan-y" }}
        onPointerDown={beginSwipe}
        onPointerMove={moveSwipe}
        onPointerUp={endSwipe}
        onPointerCancel={endSwipe}
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
            onClick={openAdjustment}
            aria-label={`Adjust quantity for ${item.title}`}
            title="Set exact quantity"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-line text-content transition-colors hover:bg-theme-200"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
          </button>
          <button
            onClick={() => setEditOpen(true)}
            aria-label={`Edit ${item.title}`}
            className="h-9 w-9 flex items-center justify-center rounded-xl border border-line text-content hover:bg-theme-200 cursor-pointer transition-colors"
          >
            <Pencil className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      <EditItemDialog item={item} meta={meta} open={editOpen} onOpenChange={setEditOpen} />
      <PhotoGalleryDialog item={item} open={galleryOpen} onOpenChange={setGalleryOpen} />
      </Card>
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent
          title={`Adjust ${item.title}`}
          className="bottom-0 top-auto w-full max-w-none -translate-y-0 rounded-b-none sm:bottom-auto sm:top-1/2 sm:w-[92vw] sm:max-w-sm sm:-translate-y-1/2 sm:rounded-2xl"
        >
          <p className="mb-3 text-sm text-muted">Set the exact amount you have in {unit}.</p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setAdjustQuantity(String(Math.max(0, (Number(adjustQuantity) || 0) - useStep)))}
              aria-label="Decrease quantity"
            >
              −
            </Button>
            <Input
              type="number"
              min="0"
              step={useStep}
              value={adjustQuantity}
              onChange={(event) => setAdjustQuantity(event.target.value)}
              className="text-center text-base"
              autoFocus
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setAdjustQuantity(String((Number(adjustQuantity) || 0) + useStep))}
              aria-label="Increase quantity"
            >
              +
            </Button>
          </div>
          <Button className="mt-4 w-full" onClick={saveAdjustment} disabled={qtyMutation.isPending || deleteMutation.isPending}>
            Save quantity
          </Button>
        </DialogContent>
      </Dialog>
    </div>
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
