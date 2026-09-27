import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Meta } from "@/types";
import { ItemCard, useUndoableDelete } from "@/components/ItemCard";
import { EmptyState, Button, Input, Select, Switch } from "@/components/ui";
import { SORT_OPTIONS, sortItems, thresholdForItem } from "@/lib/utils";

const STARTER_ITEMS: Record<string, string[]> = {
  Groceries: ["Milk", "Eggs", "Rice", "Bread"],
  Vegetables: ["Onions", "Tomatoes", "Potatoes", "Carrots"],
  Household: ["Dish soap", "Laundry detergent", "Tissues", "Trash bags"],
  Snacks: ["Biscuits", "Nuts", "Chips", "Chocolate"],
};

export function CategoryView({
  category,
  meta,
  onNavigate,
}: {
  category: string;
  meta: Meta;
  onNavigate: (tab: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [lowOnly, setLowOnly] = useState(false);
  const [inUseOnly, setInUseOnly] = useState(false);
  const [locationFilter, setLocationFilter] = useState("all");
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

  const filtered = useMemo(() => {
    let result = items ?? [];
    if (search) {
      result = result.filter((i) => i.title.toLowerCase().includes(search.toLowerCase()));
    }
    if (lowOnly) {
      result = result.filter((i) => i.quantity <= thresholdForItem(i, settings));
    }
    if (inUseOnly) {
      result = result.filter((i) => i.in_use_quantity > 0);
    }
    if (locationFilter !== "all") {
      result = result.filter((i) => i.storage_location === locationFilter);
    }
    return sortItems(result, sort);
  }, [items, search, lowOnly, inUseOnly, locationFilter, sort, settings]);

  // Lazy-render in pages so a large category doesn't mount hundreds of cards at once.
  const PAGE_SIZE = 24;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, sort, lowOnly, inUseOnly, locationFilter, category]);
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

  const addStarter = useMutation({
    mutationFn: (title: string) => api.createItem({
      title,
      category,
      quantity: 1,
      unit: meta.units[category] ?? "count",
    }),
    onSuccess: (_result, title) => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["charts"] });
      toast.success(`${title} added`);
    },
    onError: () => toast.error("Could not add that starter item."),
  });

  return (
    <div className="space-y-5">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:hidden" aria-label="Pantry categories">
        {meta.categories.map((name) => (
          <button
            type="button"
            key={name}
            onClick={() => onNavigate(name)}
            className={name === category
              ? "shrink-0 rounded-full bg-theme-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm"
              : "shrink-0 rounded-full border border-line bg-surface-solid px-3 py-1.5 text-xs font-bold text-muted"}
          >
            {meta.icons[name]} {name}
          </button>
        ))}
      </div>
      {!!items?.length && (
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
        <Select
          value={locationFilter}
          onValueChange={setLocationFilter}
          options={[
            { value: "all", label: "All locations" },
            ...meta.storage_locations.map((loc) => ({
              value: loc,
              label: `${meta.storage_location_icons[loc]} ${loc}`,
            })),
          ]}
          className="sm:max-w-[200px]"
        />
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
      )}

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

      {isLoading && (
        <div className="grid animate-pulse gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-44 rounded-2xl bg-surface-solid" />
          ))}
        </div>
      )}

      {!isLoading && (items?.length ?? 0) === 0 && (
        <div className="rounded-2xl border border-dashed border-line bg-surface-solid px-6 py-12 text-center">
          <div className="text-4xl">{meta.icons[category]}</div>
          <h3 className="mt-3 font-display text-xl text-content">No {category.toLowerCase()} yet</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            Add your first item here and Pantry Pilot will start tracking quantity, location,
            freshness, and low-stock status.
          </p>
          <div className="mx-auto mt-5 flex max-w-lg flex-wrap justify-center gap-2">
            {(STARTER_ITEMS[category] ?? ["First item"]).map((title) => (
              <button
                type="button"
                key={title}
                onClick={() => addStarter.mutate(title)}
                disabled={addStarter.isPending}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-2 text-xs font-bold text-content transition-colors hover:bg-theme-200 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" /> {title}
              </button>
            ))}
          </div>
          <Button className="mt-4" onClick={() => onNavigate("add-items")}>Add something else</Button>
        </div>
      )}

      {!isLoading && !!items?.length && filtered.length === 0 && (
        <EmptyState icon="🔎" title="No matching items" description="Clear or adjust the filters above." />
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            meta={meta}
            threshold={thresholdForItem(item, settings)}
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
