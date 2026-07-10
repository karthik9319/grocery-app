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
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border-[3px] border-content bg-theme-200 px-8 py-8 shadow-[8px_8px_0_var(--line)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, var(--content) 1.4px, transparent 0)",
            backgroundSize: "20px 20px",
          }}
          aria-hidden
        />
        <div className="relative flex items-center gap-5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border-[3px] border-content bg-surface-solid text-4xl shadow-[4px_4px_0_var(--line)]">
            🛒
          </div>
          <div>
            <h1 className="font-display text-2xl text-content sm:text-3xl">
              Pantry Pilot
            </h1>
            <p className="mt-1 font-semibold text-content/80">
              Snap a photo, name it, and keep track of what's left in the house.
            </p>
          </div>
        </div>
      </div>

      {summary?.total_rows === 0 && (
        <Card className="p-4 text-sm font-semibold text-content bg-theme-200">
          👋 <strong>Welcome!</strong> Your inventory is empty. Head to the{" "}
          <strong>Add Items</strong> tab to snap a photo, take a picture, or scan a receipt.
        </Card>
      )}

      {/* Metrics */}
      <div className="flex flex-wrap gap-4">
        <Card interactive className="min-w-[150px] flex-1 p-4">
          <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl border-2 border-content bg-theme-200 text-lg">
            📦
          </div>
          <p className="text-xs font-bold text-muted">Total Items</p>
          <p className="mt-0.5 text-2xl font-display text-content">{summary?.total_rows ?? "–"}</p>
        </Card>
        <Card interactive className="min-w-[150px] flex-1 p-4">
          <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl border-2 border-content bg-veg-200 text-lg">
            ⚠️
          </div>
          <p className="text-xs font-bold text-muted">Low Stock</p>
          <p className="mt-0.5 text-2xl font-display text-content">
            {summary?.low_stock_items.length ?? "–"}
          </p>
        </Card>
        {meta.categories.map((cat) => (
          <Card key={cat} interactive className="min-w-[150px] flex-1 p-4">
            <div
              className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl border-2 border-content text-lg"
              style={{ backgroundColor: `${meta.palette[cat]}55` }}
            >
              {meta.icons[cat]}
            </div>
            <p className="text-xs font-bold text-muted">{cat}</p>
            <p className="mt-0.5 text-2xl font-display" style={{ color: meta.palette[cat] }}>
              {summary ? formatQuantity(summary.category_totals[cat] ?? 0, meta.units[cat]) : "–"}
            </p>
          </Card>
        ))}
      </div>

      {/* Favorites quick-add */}
      {favorites && favorites.length > 0 && (
        <div>
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-content">
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> Quick Add Favorites
          </h3>
          <div className="flex flex-wrap gap-2.5">
            {favorites.map((fav) => (
              <div
                key={fav.id}
                className="glass card-hover group flex items-center gap-1 rounded-full pl-1 pr-1.5 py-1 shadow-[3px_3px_0_var(--line)] hover:shadow-[4px_4px_0_var(--line)]"
              >
                <button
                  onClick={() => quickAdd.mutate(fav.id)}
                  className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-bold text-content cursor-pointer"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-content bg-brand-400 text-xs text-white">
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
        <div className="grid gap-4 sm:grid-cols-2">
          {summary.low_stock_items.length > 0 && (
            <Card className="overflow-hidden p-4">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-content">
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
            <Card className="overflow-hidden p-4">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-content">
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
