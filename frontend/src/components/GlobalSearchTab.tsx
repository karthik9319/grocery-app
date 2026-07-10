import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { api } from "@/lib/api";
import type { Meta } from "@/types";
import { ItemCard, useUndoableDelete } from "@/components/ItemCard";
import { EmptyState, Input, Select } from "@/components/ui";
import { SORT_OPTIONS, sortItems } from "@/lib/utils";

/** Search across every category at once, unlike CategoryView which is scoped to one tab. */
export function GlobalSearchTab({ meta }: { meta: Meta }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const queryClient = useQueryClient();
  const notifyDeleted = useUndoableDelete();

  const { data: items, isLoading } = useQuery({ queryKey: ["items"], queryFn: () => api.items() });
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: api.settings });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const result = (items ?? []).filter(
      (i) => i.title.toLowerCase().includes(q) || i.category.toLowerCase().includes(q)
    );
    return sortItems(result, sort);
  }, [items, search, sort]);

  function thresholdFor(item: (typeof filtered)[number]) {
    if (item.custom_threshold != null) return item.custom_threshold;
    return meta.units[item.category] === "g" ? settings?.weight_threshold ?? 200 : settings?.count_threshold ?? 2;
  }

  return (
    <div className="space-y-5">
      <div className="glass flex flex-col gap-3 rounded-2xl p-4 shadow-[4px_4px_0_var(--line)] sm:flex-row sm:items-center">
        <div className="relative sm:max-w-md sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <Input
            placeholder="Search every category at once..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>
        <Select value={sort} onValueChange={setSort} options={SORT_OPTIONS} className="sm:max-w-[200px]" />
      </div>

      {!search.trim() && (
        <EmptyState
          icon="🔍"
          title="Search your whole pantry"
          description="Start typing to find an item across Groceries, Vegetables, Household, and Snacks all at once."
        />
      )}

      {isLoading && search.trim() && <p className="text-sm text-subtle">Loading...</p>}

      {!isLoading && search.trim() && filtered.length === 0 && (
        <EmptyState icon="🤷" title="No matches" description={`Nothing found for "${search}".`} />
      )}

      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
        {filtered.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            meta={meta}
            threshold={thresholdFor(item)}
            onDeleted={(deleted) => {
              notifyDeleted(deleted);
              queryClient.invalidateQueries({ queryKey: ["items"] });
              queryClient.invalidateQueries({ queryKey: ["summary"] });
            }}
          />
        ))}
      </div>
    </div>
  );
}
