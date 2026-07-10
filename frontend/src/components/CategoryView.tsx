import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { api } from "@/lib/api";
import type { Item, Meta } from "@/types";
import { ItemCard, useUndoableDelete } from "@/components/ItemCard";
import { EmptyState, Input, Select, Switch } from "@/components/ui";

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name-asc", label: "Name (A-Z)" },
  { value: "name-desc", label: "Name (Z-A)" },
  { value: "qty-desc", label: "Quantity (high to low)" },
  { value: "qty-asc", label: "Quantity (low to high)" },
  { value: "expiring", label: "Expiring soonest" },
];

function sortItems(items: Item[], sort: string): Item[] {
  const copy = [...items];
  switch (sort) {
    case "newest":
      return copy.sort((a, b) => b.created_at.localeCompare(a.created_at));
    case "oldest":
      return copy.sort((a, b) => a.created_at.localeCompare(b.created_at));
    case "name-asc":
      return copy.sort((a, b) => a.title.localeCompare(b.title));
    case "name-desc":
      return copy.sort((a, b) => b.title.localeCompare(a.title));
    case "qty-desc":
      return copy.sort((a, b) => b.quantity - a.quantity);
    case "qty-asc":
      return copy.sort((a, b) => a.quantity - b.quantity);
    case "expiring":
      return copy.sort((a, b) => (a.expiration_date ?? "9999-99-99").localeCompare(
        b.expiration_date ?? "9999-99-99"
      ));
    default:
      return copy;
  }
}

export function CategoryView({ category, meta }: { category: string; meta: Meta }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [lowOnly, setLowOnly] = useState(false);
  const queryClient = useQueryClient();
  const notifyDeleted = useUndoableDelete();

  const { data: items, isLoading } = useQuery({
    queryKey: ["items", category],
    queryFn: () => api.items(category),
  });
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: api.settings });

  const threshold =
    meta.units[category] === "g" ? settings?.weight_threshold ?? 200 : settings?.count_threshold ?? 2;

  const filtered = useMemo(() => {
    let result = items ?? [];
    if (search) {
      result = result.filter((i) => i.title.toLowerCase().includes(search.toLowerCase()));
    }
    if (lowOnly) {
      result = result.filter((i) => i.quantity <= (i.custom_threshold ?? threshold));
    }
    return sortItems(result, sort);
  }, [items, search, lowOnly, sort, threshold]);

  return (
    <div className="space-y-5">
      <div className="glass flex flex-col gap-3 rounded-2xl p-4 shadow-[4px_4px_0_var(--line)] sm:flex-row sm:items-center">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <Input
            placeholder="Filter by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={sort} onValueChange={setSort} options={SORT_OPTIONS} className="sm:max-w-[200px]" />
        <label className="flex items-center gap-2 text-sm font-medium text-muted sm:ml-auto">
          <Switch checked={lowOnly} onCheckedChange={(v) => setLowOnly(v === true)} />
          Low stock only
        </label>
      </div>

      {isLoading && <p className="text-sm text-subtle">Loading...</p>}

      {!isLoading && filtered.length === 0 && (
        <EmptyState
          icon={meta.icons[category]}
          title="No items match"
          description="Try clearing your search/filters, or add a new item from the Add Items tab."
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
        {filtered.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            meta={meta}
            threshold={item.custom_threshold ?? threshold}
            onDeleted={(deleted) => {
              notifyDeleted(deleted);
              queryClient.invalidateQueries({ queryKey: ["items"] });
            }}
          />
        ))}
      </div>
    </div>
  );
}
