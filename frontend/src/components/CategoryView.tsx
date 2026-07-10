import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Meta } from "@/types";
import { ItemCard, useUndoableDelete } from "@/components/ItemCard";
import { EmptyState, Button, Input, Select, Switch } from "@/components/ui";
import { SORT_OPTIONS, sortItems } from "@/lib/utils";

export function CategoryView({ category, meta }: { category: string; meta: Meta }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [lowOnly, setLowOnly] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkTargetCategory, setBulkTargetCategory] = useState(category);
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

  function toggleId(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  const invalidateAfterBulk = () => {
    queryClient.invalidateQueries({ queryKey: ["items"] });
    queryClient.invalidateQueries({ queryKey: ["summary"] });
    queryClient.invalidateQueries({ queryKey: ["charts"] });
    queryClient.invalidateQueries({ queryKey: ["backups"] });
  };

  const bulkDelete = useMutation({
    mutationFn: async () => {
      await Promise.all(Array.from(selectedIds).map((id) => api.deleteItem(id)));
    },
    onSuccess: () => {
      toast.success(`Deleted ${selectedIds.size} item(s)`);
      invalidateAfterBulk();
      exitSelectMode();
    },
  });

  const bulkMove = useMutation({
    mutationFn: async () => {
      const byId = new Map((items ?? []).map((i) => [i.id, i]));
      await Promise.all(
        Array.from(selectedIds).map((id) => {
          const item = byId.get(id);
          if (!item) return Promise.resolve();
          return api.updateItem(id, {
            title: item.title,
            category: bulkTargetCategory,
            quantity: item.quantity,
            notes: item.notes ?? undefined,
            custom_threshold: item.custom_threshold,
            expiration_date: item.expiration_date,
          });
        })
      );
    },
    onSuccess: () => {
      toast.success(`Moved ${selectedIds.size} item(s) to ${bulkTargetCategory}`);
      invalidateAfterBulk();
      exitSelectMode();
    },
  });

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
        <label className="flex items-center gap-2 text-sm font-medium text-muted">
          <Switch checked={lowOnly} onCheckedChange={(v) => setLowOnly(v === true)} />
          Low stock only
        </label>
        <Button
          variant={selectMode ? "default" : "outline"}
          size="sm"
          className="sm:ml-auto"
          onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
        >
          {selectMode ? "Cancel" : "Select"}
        </Button>
      </div>

      {selectMode && (
        <div className="glass flex flex-wrap items-center gap-3 rounded-2xl p-3 shadow-[4px_4px_0_var(--line)]">
          <span className="text-sm font-bold text-content">
            {selectedIds.size} selected
          </span>
          <Select
            value={bulkTargetCategory}
            onValueChange={setBulkTargetCategory}
            options={meta.categories.map((c) => ({ value: c, label: `${meta.icons[c]} ${c}` }))}
            className="w-44"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={selectedIds.size === 0 || bulkMove.isPending}
            onClick={() => bulkMove.mutate()}
          >
            Move to category
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={selectedIds.size === 0 || bulkDelete.isPending}
            onClick={() => bulkDelete.mutate()}
          >
            Delete selected
          </Button>
          <button
            onClick={exitSelectMode}
            className="ml-auto rounded-full p-1 text-subtle hover:bg-red-500/10 hover:text-red-500 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

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
            selectable={selectMode}
            selected={selectedIds.has(item.id)}
            onToggleSelect={toggleId}
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
