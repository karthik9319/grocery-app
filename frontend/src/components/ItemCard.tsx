import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Item, Meta } from "@/types";
import { api } from "@/lib/api";
import { daysUntil, formatQuantity, imageUrl } from "@/lib/utils";
import { Badge, Card } from "@/components/ui";
import { EditItemDialog } from "@/components/EditItemDialog";

export function ItemCard({
  item,
  meta,
  threshold,
  onDeleted,
}: {
  item: Item;
  meta: Meta;
  threshold: number;
  onDeleted: (item: Item) => void;
}) {
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const unit = meta.units[item.category];
  const dotColor = meta.palette[item.category] ?? "#999";
  const isLow = item.quantity <= threshold;
  const expDays = daysUntil(item.expiration_date);

  const qtyMutation = useMutation({
    mutationFn: (quantity: number) => api.patchQuantity(item.id, quantity),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteItem(item.id),
    onSuccess: (deleted) => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      onDeleted(deleted);
    },
  });

  const img = imageUrl(item.image_path);
  const step = unit === "g" ? 50 : 1;

  return (
    <Card
      interactive
      className="flex flex-wrap items-center gap-4 overflow-hidden p-4 animate-fade-in"
    >
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border-2 border-content">
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
      </div>

      <div className="min-w-[150px] flex-1 basis-40">
        <div className="flex items-center gap-2">
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 border-content text-xs"
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
          {expDays != null && expDays < 0 && <Badge color="red">❌ Expired</Badge>}
          {expDays != null && expDays >= 0 && expDays <= 3 && (
            <Badge color="orange">⏰ {expDays === 0 ? "Expires today" : `Expires in ${expDays}d`}</Badge>
          )}
          {item.custom_threshold != null && (
            <Badge color="neutral">Alert at {formatQuantity(item.custom_threshold, unit)}</Badge>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={() => qtyMutation.mutate(Math.max(0, item.quantity - step))}
          className="h-8 w-8 rounded-lg border-2 border-content font-bold text-content hover:bg-theme-200 transition-colors cursor-pointer"
        >
          −
        </button>
        <input
          type="number"
          value={item.quantity}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!Number.isNaN(v)) qtyMutation.mutate(v);
          }}
          className="h-8 w-16 rounded-lg border-2 border-content bg-surface-solid text-center text-sm font-bold text-content outline-none"
        />
        <button
          onClick={() => qtyMutation.mutate(item.quantity + step)}
          className="h-8 w-8 rounded-lg border-2 border-content font-bold text-content hover:bg-theme-200 transition-colors cursor-pointer"
        >
          +
        </button>
      </div>

      <div className="flex shrink-0 gap-1">
        <button
          onClick={() => setEditOpen(true)}
          className="h-9 w-9 flex items-center justify-center rounded-xl border-2 border-content text-content hover:bg-theme-200 cursor-pointer transition-colors"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={() => {
            deleteMutation.mutate();
          }}
          className="h-9 w-9 flex items-center justify-center rounded-xl border-2 border-content text-content hover:bg-red-400 hover:text-white cursor-pointer transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <EditItemDialog item={item} meta={meta} open={editOpen} onOpenChange={setEditOpen} />
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
