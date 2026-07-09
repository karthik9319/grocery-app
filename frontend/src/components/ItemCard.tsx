import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Item, Meta } from "@/types";
import { api } from "@/lib/api";
import { cn, daysUntil, formatQuantity, imageUrl } from "@/lib/utils";
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
      className="flex items-center gap-4 overflow-hidden border-l-4 p-3 animate-fade-in"
      style={{ borderLeftColor: dotColor }}
    >
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-neutral-100 ring-2 ring-white shadow-soft">
        {img ? (
          <img src={img} alt={item.title} className="h-full w-full object-cover" />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-xl"
            style={{ backgroundColor: `${dotColor}14` }}
          >
            {meta.icons[item.category]}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: dotColor }}
          />
          <p className="truncate font-semibold text-neutral-800">{item.title}</p>
          <span className="shrink-0 text-sm text-neutral-400">
            ({formatQuantity(item.quantity, unit)})
          </span>
        </div>
        {item.notes && <p className="mt-0.5 truncate text-xs text-neutral-400">{item.notes}</p>}
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
          className={cn(
            "h-8 w-8 rounded-lg border border-neutral-200 text-neutral-500 hover:bg-neutral-50 hover:border-brand-300 hover:text-brand-600 transition-colors cursor-pointer"
          )}
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
          className="h-8 w-16 rounded-lg border border-neutral-200 text-center text-sm outline-none focus:ring-2 focus:ring-brand-200"
        />
        <button
          onClick={() => qtyMutation.mutate(item.quantity + step)}
          className="h-8 w-8 rounded-lg border border-neutral-200 text-neutral-500 hover:bg-neutral-50 cursor-pointer"
        >
          +
        </button>
      </div>

      <div className="flex shrink-0 gap-1">
        <button
          onClick={() => setEditOpen(true)}
          className="h-9 w-9 flex items-center justify-center rounded-xl border border-neutral-200 text-neutral-500 hover:bg-brand-50 hover:text-brand-600 cursor-pointer"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={() => {
            deleteMutation.mutate();
          }}
          className="h-9 w-9 flex items-center justify-center rounded-xl border border-neutral-200 text-neutral-500 hover:bg-red-50 hover:text-red-600 cursor-pointer"
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
