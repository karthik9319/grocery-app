import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Clock, Star, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Meta } from "@/types";
import { formatQuantity } from "@/lib/utils";
import { Badge, Card } from "@/components/ui";

export function Header({ meta }: { meta: Meta }) {
  const queryClient = useQueryClient();
  const { data: summary } = useQuery({ queryKey: ["summary"], queryFn: api.summary });
  const { data: favorites } = useQuery({ queryKey: ["favorites"], queryFn: api.favorites });

  const quickAdd = useMutation({
    mutationFn: (id: number) => api.quickAddFavorite(id),
    onSuccess: (_, id) => {
      const fav = favorites?.find((f) => f.id === id);
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      toast.success(`Added ${fav?.title ?? "item"}`, { icon: "⭐" });
    },
  });

  const removeFav = useMutation({
    mutationFn: ({ title, category }: { title: string; category: string }) =>
      api.removeFavorite(title, category),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["favorites"] }),
  });

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="flex items-center gap-5 rounded-3xl bg-gradient-to-br from-brand-500 to-brand-700 px-8 py-7 text-white shadow-lifted">
        <div className="text-5xl">🛒</div>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Grocery &amp; Vegetable Tracker</h1>
          <p className="mt-1 text-brand-50/90">
            Snap a photo, name it, and keep track of what's left in the house.
          </p>
        </div>
      </div>

      {summary?.total_rows === 0 && (
        <Card className="p-4 text-sm text-brand-800 bg-brand-50 border-brand-200">
          👋 <strong>Welcome!</strong> Your inventory is empty. Head to the{" "}
          <strong>Add Items</strong> tab to snap a photo, take a picture, or scan a receipt.
        </Card>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Card className="p-4">
          <p className="text-xs font-medium text-neutral-400">Total Items</p>
          <p className="mt-1 text-2xl font-bold text-brand-700">{summary?.total_rows ?? "–"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-neutral-400">⚠️ Low Stock</p>
          <p className="mt-1 text-2xl font-bold text-brand-700">
            {summary?.low_stock_items.length ?? "–"}
          </p>
        </Card>
        {meta.categories.map((cat) => (
          <Card key={cat} className="p-4">
            <p className="text-xs font-medium text-neutral-400">
              {meta.icons[cat]} {cat}
            </p>
            <p className="mt-1 text-2xl font-bold text-brand-700">
              {summary ? formatQuantity(summary.category_totals[cat] ?? 0, meta.units[cat]) : "–"}
            </p>
          </Card>
        ))}
      </div>

      {/* Favorites quick-add */}
      {favorites && favorites.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-neutral-600">
            <Star className="h-4 w-4 text-amber-400" /> Quick Add Favorites
          </h3>
          <div className="flex flex-wrap gap-2">
            {favorites.map((fav) => (
              <div
                key={fav.id}
                className="group flex items-center gap-1 rounded-xl border border-neutral-200 bg-white pl-3 pr-1 py-1 shadow-soft"
              >
                <button
                  onClick={() => quickAdd.mutate(fav.id)}
                  className="text-sm font-medium text-neutral-700 hover:text-brand-600 cursor-pointer"
                >
                  + {meta.icons[fav.category]} {fav.title}
                </button>
                <button
                  onClick={() => removeFav.mutate({ title: fav.title, category: fav.category })}
                  className="ml-1 rounded-full p-1 text-neutral-300 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alerts */}
      {summary && (summary.low_stock_items.length > 0 || summary.expiring_items.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {summary.low_stock_items.length > 0 && (
            <Card className="p-4">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-orange-600">
                <AlertTriangle className="h-4 w-4" /> Low stock ({summary.low_stock_items.length})
              </h3>
              <ul className="space-y-1 text-sm text-neutral-600">
                {summary.low_stock_items.map((item) => (
                  <li key={item.id} className="flex items-center justify-between">
                    <span>
                      {meta.icons[item.category]} {item.title}
                    </span>
                    <Badge color="orange">
                      {formatQuantity(item.quantity, meta.units[item.category])}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {summary.expiring_items.length > 0 && (
            <Card className="p-4">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-red-500">
                <Clock className="h-4 w-4" /> Expiring soon / expired ({summary.expiring_items.length})
              </h3>
              <ul className="space-y-1 text-sm text-neutral-600">
                {summary.expiring_items.map(({ item, days_left }) => (
                  <li key={item.id} className="flex items-center justify-between">
                    <span>
                      {meta.icons[item.category]} {item.title}
                    </span>
                    <Badge color={days_left < 0 ? "red" : "orange"}>
                      {days_left < 0 ? "Expired" : days_left === 0 ? "Today" : `${days_left}d left`}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
