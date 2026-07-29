import { useEffect, useMemo, useState } from "react";
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
  const [inUseOnly, setInUseOnly] = useState(false);
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
    if (inUseOnly) {
      result = result.filter((i) => i.in_use_quantity > 0);
    }
    return sortItems(result, sort);
  }, [items, search, lowOnly, inUseOnly, sort, threshold]);

  // Lazy-render in pages so a large category doesn't mount hundreds of cards at once.
  const PAGE_SIZE = 24;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, sort, lowOnly, inUseOnly, category]);
  const visible = filtered.slice(0, visibleCount);

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
      const toRestore = (items ?? []).filter((i) => selectedIds.has(i.id));
      await api.bulkDeleteItems(Array.from(selectedIds));
      return toRestore;
    },
    onSuccess: (restorable) => {
      const count = restorable.length;
      invalidateAfterBulk();
      exitSelectMode();
      toast(`Deleted ${count} item(s)`, {
        action: {
          label: "Undo",
          onClick: async () => {
            await Promise.all(restorable.map((it) => api.restoreItem(it)));
            invalidateAfterBulk();
            toast.success(`Restored ${count} item(s)`);
          },
        },
      });
    },
  });

  const bulkMove = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selectedIds);
      await api.bulkMoveItems(ids, bulkTargetCategory);
      return { ids, target: bulkTargetCategory };
    },
    onSuccess: ({ ids, target }) => {
      invalidateAfterBulk();
      exitSelectMode();
      toast(`Moved ${ids.length} item(s) to ${target}`, {
        action: {
          label: "Undo",
          onClick: async () => {
            await api.bulkMoveItems(ids, category);
            invalidateAfterBulk();
            toast.success("Move undone");
          },
        },
      });
    },
  });

  return (
    <div className="space-y-5">
      <div className="glass flex flex-col gap-3 rounded-2xl p-4 shadow-md sm:flex-row sm:items-center">
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
        <label className="flex items-center gap-2 text-sm font-medium text-muted">
          <Switch checked={inUseOnly} onCheckedChange={(v) => setInUseOnly(v === true)} />
          In use only
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
        <div className="glass flex flex-wrap items-center gap-3 rounded-2xl p-3 shadow-md">
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
            aria-label="Exit select mode"
            className="ml-auto rounded-full p-1 text-subtle hover:bg-red-500/10 hover:text-red-500 cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden />
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
        {visible.map((item) => (
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

      {filtered.length > visibleCount && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          >
            Load more ({filtered.length - visibleCount} remaining)
          </Button>
        </div>
      )}
    </div>
  );
}
