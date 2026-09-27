import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ListChecks,
  MessageCircle,
  PackageCheck,
  Pencil,
  Printer,
  RefreshCw,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import type { ItemUnit, Meta, ShoppingListItem } from "@/types";
import {
  formatMoney,
  formatQuantity,
  formatShoppingListForShare,
  convertItemQuantity,
  ITEM_UNIT_OPTIONS,
  shareText,
  titleCase,
  unitStep,
  cn,
} from "@/lib/utils";
import { Button, Card, Checkbox, EmptyState, Input, Select } from "@/components/ui";
import { TitleAutocomplete } from "@/components/TitleAutocomplete";
import { OfflineReadiness } from "@/components/OfflineReadiness";
import { ShoppingTripHistory } from "@/components/ShoppingTripHistory";

const UNASSIGNED_STORE = "__unassigned__";
const AISLE_ORDER_KEY = "pantry-aisle-order-by-store";

type DetailPatch = Partial<
  Pick<ShoppingListItem, "unit" | "store" | "aisle" | "unit_price" | "substitution">
>;

export function ShoppingListTab({ meta }: { meta: Meta }) {
  const queryClient = useQueryClient();
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState(meta.categories[0]);
  const [newQuantity, setNewQuantity] = useState(1);
  const [newUnit, setNewUnit] = useState<ItemUnit>(meta.units[meta.categories[0]]);
  const [newStore, setNewStore] = useState("");
  const [newAisle, setNewAisle] = useState("");
  const [newUnitPrice, setNewUnitPrice] = useState("");
  const [newSubstitution, setNewSubstitution] = useState("");
  const [showTripDetails, setShowTripDetails] = useState(false);
  const [selectedStore, setSelectedStore] = useState("all");
  const [shoppingMode, setShoppingMode] = useState(false);
  const [aisleOrderByStore, setAisleOrderByStore] = useState<Record<string, string[]>>(() => {
    try {
      return JSON.parse(localStorage.getItem(AISLE_ORDER_KEY) ?? "{}");
    } catch {
      return {};
    }
  });

  const { data: items, refetch: refreshShoppingList, isFetching: shoppingListRefreshing } = useQuery({
    queryKey: ["shopping-list"],
    queryFn: api.shoppingList,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["shopping-list"] });

  const addLowStock = useMutation({
    mutationFn: api.addLowStockToShoppingList,
    onSuccess: (res) => {
      invalidate();
      toast.success(`Added ${res.added} low-stock item(s) to the shopping list`, { icon: "🛍️" });
    },
  });

  const addItem = useMutation({
    mutationFn: () =>
      api.addShoppingItem(titleCase(newTitle), newCategory, newQuantity, {
        unit: newUnit,
        store: newStore.trim() || undefined,
        aisle: newAisle.trim() || undefined,
        unit_price: newUnitPrice === "" ? null : Number(newUnitPrice),
        substitution: newSubstitution.trim() || undefined,
      }),
    onSuccess: () => {
      invalidate();
      setNewTitle("");
      setNewQuantity(1);
      setNewUnitPrice("");
      setNewSubstitution("");
    },
  });

  const toggleChecked = useMutation({
    mutationFn: ({ id, checked }: { id: number; checked: boolean }) =>
      api.patchShoppingItem(id, checked),
    onSuccess: invalidate,
  });

  const changeQuantity = useMutation({
    mutationFn: ({ id, quantity }: { id: number; quantity: number }) =>
      api.patchShoppingItemQuantity(id, quantity),
    onSuccess: invalidate,
  });

  const updateDetails = useMutation({
    mutationFn: ({ item, patch }: { item: ShoppingListItem; patch: DetailPatch }) =>
      api.patchShoppingItemDetails(item.id, {
        unit: patch.unit ?? item.unit,
        store: patch.store === undefined ? item.store : patch.store,
        aisle: patch.aisle === undefined ? item.aisle : patch.aisle,
        unit_price: patch.unit_price === undefined ? item.unit_price : patch.unit_price,
        substitution:
          patch.substitution === undefined ? item.substitution : patch.substitution,
      }),
    onSuccess: invalidate,
  });

  const deleteItem = useMutation({
    mutationFn: (item: ShoppingListItem) => api.deleteShoppingItem(item.id).then(() => item),
    onSuccess: (item) => {
      invalidate();
      toast(`Removed "${item.title}"`, {
        action: {
          label: "Undo",
          onClick: async () => {
            await api.addShoppingItem(item.title, item.category ?? undefined, item.quantity, {
              unit: item.unit,
              store: item.store ?? undefined,
              aisle: item.aisle ?? undefined,
              unit_price: item.unit_price,
              substitution: item.substitution ?? undefined,
            });
            invalidate();
          },
        },
      });
    },
  });

  const clearChecked = useMutation({
    mutationFn: api.clearCheckedShoppingItems,
    onSuccess: invalidate,
  });

  const completeTrip = useMutation({
    mutationFn: () =>
      api.completeShoppingTrip(selectedStore === "all" ? undefined : selectedStore),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["shopping-list"] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      queryClient.invalidateQueries({ queryKey: ["charts"] });
      queryClient.invalidateQueries({ queryKey: ["shopping-trips"] });
      const spend = result.total_spend > 0 ? ` · ${formatMoney(result.total_spend)} recorded` : "";
      toast.success(`${result.completed} purchased item(s) added to your pantry${spend}`, {
        icon: "✅",
      });
    },
  });

  const stores = useMemo(
    () =>
      Array.from(
        new Set((items ?? []).map((item) => item.store?.trim()).filter((v): v is string => !!v))
      ).sort((a, b) => a.localeCompare(b)),
    [items]
  );
  const hasUnassigned = (items ?? []).some((item) => !item.store?.trim());
  const storeOptions = useMemo(
    () => [
      { value: "all", label: "All stores" },
      ...(hasUnassigned ? [{ value: UNASSIGNED_STORE, label: "Any store" }] : []),
      ...stores.map((store) => ({ value: store, label: store })),
    ],
    [hasUnassigned, stores]
  );
  useEffect(() => {
    if (!storeOptions.some((option) => option.value === selectedStore)) {
      setSelectedStore("all");
    }
  }, [selectedStore, storeOptions]);

  const filteredItems = (items ?? []).filter((item) => {
    if (selectedStore === "all") return true;
    if (selectedStore === UNASSIGNED_STORE) return !item.store?.trim();
    return item.store?.trim().toLowerCase() === selectedStore.toLowerCase();
  });
  const unchecked = filteredItems.filter((item) => !item.checked);
  const checked = filteredItems.filter((item) => item.checked);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, ShoppingListItem[]>();
    for (const item of filteredItems) {
      const store = item.store?.trim() || "Any store";
      const aisle = item.aisle?.trim() || item.category || "Other";
      const key = `${store}\u0000${aisle}`;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => {
      const [storeA, aisleA] = a.split("\u0000");
      const [storeB, aisleB] = b.split("\u0000");
      const storeOrder = storeA.localeCompare(storeB);
      if (storeOrder !== 0) return storeOrder;
      const preferred = aisleOrderByStore[storeA] ?? [];
      const rankA = preferred.indexOf(aisleA);
      const rankB = preferred.indexOf(aisleB);
      if (rankA >= 0 || rankB >= 0) {
        if (rankA < 0) return 1;
        if (rankB < 0) return -1;
        return rankA - rankB;
      }
      return aisleA.localeCompare(aisleB);
    });
  }, [filteredItems, aisleOrderByStore]);

  function moveAisle(store: string, aisle: string, direction: -1 | 1) {
    const visibleAisles = groupedItems
      .map(([key]) => key.split("\u0000"))
      .filter(([groupStore]) => groupStore === store)
      .map(([, groupAisle]) => groupAisle);
    const saved = aisleOrderByStore[store] ?? [];
    const order = [...saved, ...visibleAisles.filter((name) => !saved.includes(name))];
    const index = order.indexOf(aisle);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    const next = { ...aisleOrderByStore, [store]: order };
    setAisleOrderByStore(next);
    localStorage.setItem(AISLE_ORDER_KEY, JSON.stringify(next));
  }

  const lineTotal = (item: ShoppingListItem) =>
    item.unit_price == null ? 0 : item.quantity * item.unit_price;
  const expectedTotal = filteredItems.reduce((sum, item) => sum + lineTotal(item), 0);
  const inCartTotal = checked.reduce((sum, item) => sum + lineTotal(item), 0);
  const remainingTotal = unchecked.reduce((sum, item) => sum + lineTotal(item), 0);
  const missingPriceCount = filteredItems.filter((item) => item.unit_price == null).length;
  const pricedItemCount = filteredItems.length - missingPriceCount;

  function confirmCompleteTrip() {
    if (!checked.length) return;
    const scope = selectedStore === "all"
      ? "all checked items"
      : selectedStore === UNASSIGNED_STORE
        ? "checked items without a store"
        : `checked items from ${selectedStore}`;
    if (
      window.confirm(
        `Finish this shopping trip?\n\n${checked.length} ${scope} will be added to pantry inventory and removed from this list.`
      )
    ) {
      completeTrip.mutate();
    }
  }

  return (
    <div className={cn(
      "space-y-5",
      shoppingMode && "fixed inset-0 z-50 h-[100dvh] overflow-y-auto bg-canvas px-4 pb-28 pt-[max(1rem,env(safe-area-inset-top))] lg:static lg:h-auto lg:overflow-visible lg:bg-transparent lg:p-0"
    )}>
      {shoppingMode && (
        <div className="sticky top-0 z-20 -mx-4 -mt-4 flex items-center gap-3 border-b border-line bg-canvas/95 px-4 py-3 backdrop-blur lg:hidden">
          <span className="min-w-0 flex-1">
            <span className="block font-display text-lg text-content">Shopping mode</span>
            <span className="block text-xs text-subtle">{checked.length} in cart · {unchecked.length} remaining</span>
          </span>
          <Button variant="outline" size="sm" onClick={() => setShoppingMode(false)}>
            <X className="h-4 w-4" /> Exit
          </Button>
        </div>
      )}
      <p className={cn("text-sm text-muted print:hidden", shoppingMode && "hidden lg:block")}>
        {shoppingMode
          ? "Tap an item as it goes into your cart. Finish the trip when you have paid."
          : "Organize by store and aisle, track the expected bill, then finish the trip to move purchased items into your pantry."}
      </p>

      <div className={shoppingMode ? "hidden lg:block" : undefined}>
        <OfflineReadiness
          items={items}
          onRefresh={() => refreshShoppingList()}
          refreshing={shoppingListRefreshing}
        />
      </div>

      <p className="hidden text-center font-display text-lg text-content print:block">
        Shopping List &middot; {new Date().toLocaleDateString()}
      </p>

      <div className="flex flex-wrap gap-2 print:hidden">
        <Button
          variant={shoppingMode ? "default" : "outline"}
          className={shoppingMode ? "hidden lg:inline-flex" : undefined}
          onClick={() => setShoppingMode((active) => !active)}
        >
          {shoppingMode ? <Pencil className="h-4 w-4" /> : <ListChecks className="h-4 w-4" />}
          {shoppingMode ? "Edit list" : "Start shopping"}
        </Button>
        {!shoppingMode && (
          <>
        <Button
          variant="outline"
          onClick={() => addLowStock.mutate()}
          disabled={addLowStock.isPending}
        >
          <RefreshCw className="h-4 w-4" /> Add low-stock
        </Button>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print
        </Button>
        <Button
          variant="outline"
          onClick={() => shareText(formatShoppingListForShare(items ?? [], meta))}
          title="Share the shopping list"
        >
          <MessageCircle className="h-4 w-4" /> Share
        </Button>
          </>
        )}
        {storeOptions.length > 1 && (
          <Select
            value={selectedStore}
            onValueChange={setSelectedStore}
            options={storeOptions}
            className="min-w-40"
          />
        )}
      </div>

      {!shoppingMode && <Card className="p-4 print:hidden">
        <form
          className="grid gap-3 lg:grid-cols-[minmax(12rem,1fr)_11rem_7rem_6rem_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            if (newTitle.trim()) addItem.mutate();
          }}
        >
          <TitleAutocomplete
            placeholder="What do you need?"
            value={newTitle}
            onChange={setNewTitle}
            onBlur={() => setNewTitle((title) => titleCase(title))}
            onSelectSuggestion={(suggestion) => {
              setNewTitle(suggestion.title);
              setNewCategory(suggestion.category);
              setNewUnit(meta.units[suggestion.category]);
            }}
          />
          <Select
            value={newCategory}
            onValueChange={(category) => {
              setNewCategory(category);
              setNewUnit(meta.units[category]);
            }}
            options={meta.categories.map((category) => ({
              value: category,
              label: `${meta.icons[category]} ${category}`,
            }))}
          />
          <Input
            type="number"
            min={unitStep(newUnit)}
            step={unitStep(newUnit)}
            value={newQuantity}
            onChange={(event) => setNewQuantity(parseFloat(event.target.value) || unitStep(newUnit))}
            aria-label="Quantity"
          />
          <Select
            value={newUnit}
            onValueChange={(unit) => {
              const nextUnit = unit as ItemUnit;
              setNewQuantity((quantity) => convertItemQuantity(quantity, newUnit, nextUnit));
              setNewUnit(nextUnit);
            }}
            options={ITEM_UNIT_OPTIONS}
          />
          <Button type="submit" disabled={addItem.isPending || !newTitle.trim()}>
            Add
          </Button>

          <button
            type="button"
            onClick={() => setShowTripDetails((visible) => !visible)}
            className="flex items-center gap-1 text-left text-xs font-bold text-theme-600 lg:col-span-5 dark:text-theme-400"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${showTripDetails ? "rotate-180" : ""}`} />
            Store, aisle, price and substitute
          </button>

          {showTripDetails && (
            <div className="grid gap-3 border-t border-line pt-3 sm:grid-cols-2 lg:col-span-5 lg:grid-cols-4">
              <Input
                placeholder="Store (e.g. DMart)"
                value={newStore}
                onChange={(event) => setNewStore(event.target.value)}
              />
              <Input
                placeholder="Aisle (e.g. Dairy)"
                value={newAisle}
                onChange={(event) => setNewAisle(event.target.value)}
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder={`Expected ₹ per ${newUnit === "l" ? "L" : newUnit}`}
                value={newUnitPrice}
                onChange={(event) => setNewUnitPrice(event.target.value)}
              />
              <Input
                placeholder="Substitute (optional)"
                value={newSubstitution}
                onChange={(event) => setNewSubstitution(event.target.value)}
              />
            </div>
          )}
        </form>
      </Card>}

      {!shoppingMode && pricedItemCount > 0 && (
        <div className="grid gap-3 sm:grid-cols-3 print:hidden">
          <TripStat
            label="Expected total"
            value={formatMoney(expectedTotal)}
            note={missingPriceCount ? `${missingPriceCount} item(s) need a price` : undefined}
          />
          <TripStat label="In cart" value={formatMoney(inCartTotal)} tone="green" />
          <TripStat label="Remaining" value={formatMoney(remainingTotal)} />
        </div>
      )}

      {!items?.length && (
        <EmptyState
          icon="🛍️"
          title="Your shopping list is empty"
          description="Add an item or pull in low-stock products, then check them off while shopping."
        />
      )}

      {!!items?.length && !filteredItems.length && (
        <EmptyState
          icon="🏪"
          title="Nothing for this store"
          description="Choose another store or add a new item here."
        />
      )}

      <div className="space-y-5">
        {groupedItems.map(([key, group]) => {
          const [store, aisle] = key.split("\u0000");
          const remaining = group.filter((item) => !item.checked);
          const done = group.length - remaining.length;
          const completed = remaining.length === 0;
          if (!shoppingMode && completed) return null;
          if (shoppingMode && completed) {
            const lastChecked = group[group.length - 1];
            return (
              <section key={key} className="animate-pop rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-content">{aisle}</span>
                    <span className="block truncate text-xs text-subtle">{store} · aisle complete</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleChecked.mutate({ id: lastChecked.id, checked: false })}
                    className="text-xs font-bold text-theme-600 hover:underline dark:text-theme-400"
                  >
                    Undo last
                  </button>
                </div>
              </section>
            );
          }
          return (
            <section key={key} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <h3 className="text-sm font-bold text-content">🏪 {store}</h3>
                <span className="text-xs text-subtle">· {aisle}</span>
                <span className="ml-auto text-xs font-semibold text-subtle">
                  {shoppingMode ? `${done}/${group.length}` : `${remaining.length} ${remaining.length === 1 ? "item" : "items"}`}
                </span>
                {!shoppingMode && (
                  <span className="flex print:hidden">
                    <button
                      type="button"
                      onClick={() => moveAisle(store, aisle, -1)}
                      className="rounded-lg p-1 text-subtle hover:bg-surface hover:text-content"
                      title={`Move ${aisle} earlier`}
                      aria-label={`Move ${aisle} earlier`}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveAisle(store, aisle, 1)}
                      className="rounded-lg p-1 text-subtle hover:bg-surface hover:text-content"
                      title={`Move ${aisle} later`}
                      aria-label={`Move ${aisle} later`}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </span>
                )}
              </div>
              {remaining.map((item) => (
                <ShoppingItemCard
                  key={item.id}
                  item={item}
                  meta={meta}
                  onCheck={() => toggleChecked.mutate({ id: item.id, checked: true })}
                  onQuantity={(quantity) => changeQuantity.mutate({ id: item.id, quantity })}
                  onDetails={(patch) => updateDetails.mutate({ item, patch })}
                  onDelete={() => deleteItem.mutate(item)}
                  shoppingMode={shoppingMode}
                />
              ))}
            </section>
          );
        })}
      </div>

      {!shoppingMode && checked.length > 0 && (
        <Card className="overflow-hidden print:hidden">
          <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center">
            <div>
              <h3 className="flex items-center gap-2 font-display text-lg text-content">
                <CheckCircle2 className="h-5 w-5 text-theme-500" /> In your cart
              </h3>
              <p className="text-xs text-subtle">
                {checked.length} item(s) · {formatMoney(inCartTotal)} expected
              </p>
            </div>
            {!shoppingMode && (
              <Button className="sm:ml-auto" onClick={confirmCompleteTrip} disabled={completeTrip.isPending}>
                <PackageCheck className="h-4 w-4" /> Finish trip & add to pantry
              </Button>
            )}
          </div>
          <div className="divide-y divide-line">
            {checked.map((item) => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                <Checkbox
                  checked
                  onCheckedChange={() => toggleChecked.mutate({ id: item.id, checked: false })}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-subtle line-through">
                  {item.category ? meta.icons[item.category] : ""} {item.title}
                </span>
                <span className="text-xs text-subtle">
                  {formatQuantity(item.quantity, item.unit)}
                  {item.unit_price != null ? ` · ${formatMoney(lineTotal(item))}` : ""}
                </span>
              </div>
            ))}
          </div>
          {!shoppingMode && <div className="p-3 text-right">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (window.confirm("Remove checked items without adding them to the pantry?")) {
                  clearChecked.mutate();
                }
              }}
            >
              Remove without adding
            </Button>
          </div>}
        </Card>
      )}

      {!shoppingMode && <ShoppingTripHistory meta={meta} />}

      {shoppingMode && !!filteredItems.length && (
        <div className="sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 flex items-center gap-3 rounded-2xl border border-line bg-surface-solid/95 p-3 shadow-xl backdrop-blur print:hidden">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-content">
              {checked.length} in cart · {unchecked.length} remaining
            </span>
            <span className="block text-xs text-subtle">
              {pricedItemCount > 0 ? `${formatMoney(inCartTotal)} expected in cart` : "Check items off as you shop"}
            </span>
          </span>
          <Button onClick={confirmCompleteTrip} disabled={!checked.length || completeTrip.isPending}>
            <PackageCheck className="h-4 w-4" /> Finish trip
          </Button>
        </div>
      )}
    </div>
  );
}

function TripStat({
  label,
  value,
  tone,
  note,
}: {
  label: string;
  value: string;
  tone?: "green";
  note?: string;
}) {
  return (
    <Card className="px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-subtle">{label}</p>
      <p className={`mt-1 font-display text-xl ${tone === "green" ? "text-theme-600 dark:text-theme-400" : "text-content"}`}>
        {value}
      </p>
      {note && <p className="mt-1 text-xs text-subtle">{note}</p>}
    </Card>
  );
}

function ShoppingItemCard({
  item,
  meta,
  onCheck,
  onQuantity,
  onDetails,
  onDelete,
  shoppingMode,
}: {
  item: ShoppingListItem;
  meta: Meta;
  onCheck: () => void;
  onQuantity: (quantity: number) => void;
  onDetails: (patch: DetailPatch) => void;
  onDelete: () => void;
  shoppingMode: boolean;
}) {
  const step = unitStep(item.unit);
  const total = item.unit_price == null ? null : item.quantity * item.unit_price;
  const [showDetails, setShowDetails] = useState(false);
  const detailsId = `shopping-item-details-${item.id}`;

  if (shoppingMode) {
    return (
      <Card className="overflow-hidden">
        <div
          role="button"
          tabIndex={0}
          onClick={onCheck}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onCheck();
            }
          }}
          className="flex min-h-16 cursor-pointer items-center gap-3 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-theme-500"
          aria-label={`Put ${item.title} in cart`}
        >
          <Checkbox
            checked={false}
            onClick={(event) => event.stopPropagation()}
            onCheckedChange={onCheck}
            className="h-6 w-6"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-bold text-content">
              {item.category ? meta.icons[item.category] : ""} {item.title}
            </span>
            {(item.aisle || item.substitution) && (
              <span className="block truncate text-xs text-subtle">
                {[item.aisle, item.substitution ? `Substitute: ${item.substitution}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            )}
          </span>
          <span className="shrink-0 text-sm font-bold text-muted">
            {formatQuantity(item.quantity, item.unit)}
          </span>
          {total != null && (
            <span className="shrink-0 text-sm font-bold tabular-nums text-content">
              {formatMoney(total)}
            </span>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 p-3">
        <label className="flex min-w-40 flex-1 items-center gap-2 cursor-pointer">
          <Checkbox checked={false} onCheckedChange={onCheck} />
          <span className="min-w-0 truncate text-sm font-semibold text-content">
            {item.category ? meta.icons[item.category] : ""} {item.title}
          </span>
        </label>
        <div className="flex shrink-0 items-center gap-1 print:hidden">
          <button
            onClick={() => onQuantity(Math.max(step, item.quantity - step))}
            aria-label={`Decrease ${item.title} quantity`}
            className="h-8 w-8 rounded-lg border border-line font-bold text-content hover:bg-theme-200 cursor-pointer"
          >
            −
          </button>
          <input
            type="number"
            min={step}
            step={step}
            value={item.quantity}
            aria-label={`${item.title} quantity`}
            onChange={(event) => {
              const value = parseFloat(event.target.value);
              if (!Number.isNaN(value) && value > 0) onQuantity(value);
            }}
            className="h-8 w-20 rounded-lg border border-line bg-surface-solid text-center text-sm font-bold text-content outline-none"
          />
          <button
            onClick={() => onQuantity(item.quantity + step)}
            aria-label={`Increase ${item.title} quantity`}
            className="h-8 w-8 rounded-lg border border-line font-bold text-content hover:bg-theme-200 cursor-pointer"
          >
            +
          </button>
        </div>
        <Select
          value={item.unit}
          onValueChange={(unit) => {
            const nextUnit = unit as ItemUnit;
            const nextQuantity = convertItemQuantity(item.quantity, item.unit, nextUnit);
            const nextPrice = item.unit_price == null || nextQuantity === 0
              ? item.unit_price
              : (item.quantity * item.unit_price) / nextQuantity;
            if (nextQuantity !== item.quantity) onQuantity(nextQuantity);
            onDetails({ unit: nextUnit, unit_price: nextPrice });
          }}
          options={ITEM_UNIT_OPTIONS}
          className="w-24 print:hidden"
        />
        {total != null && (
          <span className="w-24 text-right text-sm font-bold tabular-nums text-content">
            {formatMoney(total)}
          </span>
        )}
        <button
          type="button"
          onClick={() => setShowDetails((visible) => !visible)}
          aria-expanded={showDetails}
          aria-controls={detailsId}
          className="flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-bold text-theme-600 hover:bg-theme-200 dark:text-theme-400 print:hidden"
        >
          Details
          <ChevronDown
            className={`h-4 w-4 transition-transform ${showDetails ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
        <button
          onClick={onDelete}
          aria-label={`Remove ${item.title} from shopping list`}
          className="rounded-full p-1 text-subtle hover:bg-red-500/10 hover:text-red-500 cursor-pointer print:hidden"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {showDetails && (
        <div
          id={detailsId}
          className="grid gap-2 border-t border-line bg-surface/60 p-3 sm:grid-cols-2 lg:grid-cols-4 print:hidden"
        >
          <Input
            defaultValue={item.store ?? ""}
            placeholder="Store"
            aria-label={`${item.title} store`}
            onBlur={(event) => onDetails({ store: event.target.value.trim() || null })}
          />
          <Input
            defaultValue={item.aisle ?? ""}
            placeholder="Aisle"
            aria-label={`${item.title} aisle`}
            onBlur={(event) => onDetails({ aisle: event.target.value.trim() || null })}
          />
          <Input
            type="number"
            min="0"
            step="0.01"
            defaultValue={item.unit_price ?? ""}
            placeholder={`Price per ${item.unit === "l" ? "L" : item.unit}`}
            aria-label={`${item.title} price per unit`}
            onBlur={(event) =>
              onDetails({ unit_price: event.target.value === "" ? null : Number(event.target.value) })
            }
          />
          <Input
            defaultValue={item.substitution ?? ""}
            placeholder="Acceptable substitute"
            aria-label={`${item.title} substitute`}
            onBlur={(event) => onDetails({ substitution: event.target.value.trim() || null })}
          />
        </div>
      )}

      <div className="hidden px-3 pb-2 text-xs text-subtle print:block">
        {formatQuantity(item.quantity, item.unit)}
        {item.substitution ? ` · Substitute: ${item.substitution}` : ""}
      </div>
    </Card>
  );
}
