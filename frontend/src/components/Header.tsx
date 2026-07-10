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
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 px-8 py-8 text-white shadow-lifted">
        <div
          className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl animate-float"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-16 left-1/3 h-48 w-48 rounded-full bg-veg-500/20 blur-3xl animate-float"
          style={{ animationDelay: "-2s" }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(circle, white 1px, transparent 1px)",
            backgroundSize: "18px 18px",
          }}
          aria-hidden
        />
        <div className="relative flex items-center gap-5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-4xl shadow-inner ring-1 ring-white/25 backdrop-blur">
            🛒
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight drop-shadow-sm sm:text-3xl">
              Grocery &amp; Vegetable Tracker
            </h1>
            <p className="mt-1 text-brand-50/90">
              Snap a photo, name it, and keep track of what's left in the house.
            </p>
          </div>
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
        <Card interactive className="p-4">
          <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/15 text-lg ring-1 ring-brand-500/25">
            📦
          </div>
          <p className="text-xs font-medium text-muted">Total Items</p>
          <p className="mt-0.5 text-2xl font-extrabold text-brand-600 dark:text-brand-300">{summary?.total_rows ?? "–"}</p>
        </Card>
        <Card interactive className="p-4">
          <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/15 text-lg ring-1 ring-orange-500/25">
            ⚠️
          </div>
          <p className="text-xs font-medium text-muted">Low Stock</p>
          <p className="mt-0.5 text-2xl font-extrabold text-orange-600 dark:text-orange-400">
            {summary?.low_stock_items.length ?? "–"}
          </p>
        </Card>
        {meta.categories.map((cat) => (
          <Card key={cat} interactive className="p-4">
            <div
              className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl text-lg ring-1"
              style={{
                backgroundColor: `${meta.palette[cat]}22`,
                boxShadow: `inset 0 0 0 1px ${meta.palette[cat]}40`,
              }}
            >
              {meta.icons[cat]}
            </div>
            <p className="text-xs font-medium text-muted">{cat}</p>
            <p className="mt-0.5 text-2xl font-extrabold" style={{ color: meta.palette[cat] }}>
              {summary ? formatQuantity(summary.category_totals[cat] ?? 0, meta.units[cat]) : "–"}
            </p>
          </Card>
        ))}
      </div>

      {/* Favorites quick-add */}
      {favorites && favorites.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-content">
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> Quick Add Favorites
          </h3>
          <div className="flex flex-wrap gap-2">
            {favorites.map((fav) => (
              <div
                key={fav.id}
                className="glass card-hover group flex items-center gap-1 rounded-full pl-1 pr-1.5 py-1 shadow-soft hover:shadow-medium hover:border-brand-300/60"
              >
                <button
                  onClick={() => quickAdd.mutate(fav.id)}
                  className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold text-content hover:text-brand-500 cursor-pointer"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-xs text-white">
                    +
                  </span>
                  {meta.icons[fav.category]} {fav.title}
                </button>
                <button
                  onClick={() => removeFav.mutate({ title: fav.title, category: fav.category })}
                  className="rounded-full p-1 text-subtle opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-500 cursor-pointer"
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
            <Card className="overflow-hidden border-l-4 border-l-orange-400 p-4">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-orange-600">
                <AlertTriangle className="h-4 w-4" /> Low stock ({summary.low_stock_items.length})
              </h3>
              <ul className="space-y-1 text-sm text-muted">
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
            <Card className="overflow-hidden border-l-4 border-l-red-400 p-4">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-red-500">
                <Clock className="h-4 w-4" /> Expiring soon / expired ({summary.expiring_items.length})
              </h3>
              <ul className="space-y-1 text-sm text-muted">
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
