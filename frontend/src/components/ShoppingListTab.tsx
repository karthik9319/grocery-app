import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshCw, X } from "lucide-react";
import { api } from "@/lib/api";
import type { Meta } from "@/types";
import { Button, Card, Checkbox, EmptyState, Input, Select } from "@/components/ui";

export function ShoppingListTab({ meta }: { meta: Meta }) {
  const queryClient = useQueryClient();
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState(meta.categories[0]);

  const { data: items } = useQuery({ queryKey: ["shopping-list"], queryFn: api.shoppingList });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["shopping-list"] });

  const addLowStock = useMutation({
    mutationFn: api.addLowStockToShoppingList,
    onSuccess: (res) => {
      invalidate();
      toast.success(`Added ${res.added} low-stock item(s) to the shopping list`, { icon: "🛍️" });
    },
  });

  const addItem = useMutation({
    mutationFn: () => api.addShoppingItem(newTitle, newCategory),
    onSuccess: () => {
      invalidate();
      setNewTitle("");
    },
  });

  const toggleChecked = useMutation({
    mutationFn: ({ id, checked }: { id: number; checked: boolean }) =>
      api.patchShoppingItem(id, checked),
    onSuccess: invalidate,
  });

  const deleteItem = useMutation({
    mutationFn: (id: number) => api.deleteShoppingItem(id),
    onSuccess: invalidate,
  });

  const clearChecked = useMutation({
    mutationFn: api.clearCheckedShoppingItems,
    onSuccess: invalidate,
  });

  const unchecked = items?.filter((i) => !i.checked) ?? [];
  const checked = items?.filter((i) => i.checked) ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Check items off as you shop. Populate it from low-stock items or add your own.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          variant="outline"
          onClick={() => addLowStock.mutate()}
          disabled={addLowStock.isPending}
        >
          <RefreshCw className="h-4 w-4" /> Add all low-stock items
        </Button>
        <form
          className="flex flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (newTitle.trim()) addItem.mutate();
          }}
        >
          <Input
            placeholder="e.g. Paper towels"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="flex-1"
          />
          <Select
            value={newCategory}
            onValueChange={setNewCategory}
            options={meta.categories.map((c) => ({ value: c, label: `${meta.icons[c]} ${c}` }))}
            className="w-40"
          />
          <Button type="submit">Add</Button>
        </form>
      </div>

      {!items?.length && (
        <EmptyState
          icon="🛍️"
          title="Your shopping list is empty"
          description="Add items above or pull in low-stock items."
        />
      )}

      <div className="space-y-2">
        {unchecked.map((item) => (
          <Card key={item.id} className="flex items-center justify-between gap-3 p-3">
            <label className="flex flex-1 items-center gap-2 cursor-pointer">
              <Checkbox
                checked={false}
                onCheckedChange={() => toggleChecked.mutate({ id: item.id, checked: true })}
              />
              <span className="text-sm text-content">
                {item.category ? meta.icons[item.category] : ""} {item.title}
              </span>
            </label>
            <button
              onClick={() => deleteItem.mutate(item.id)}
              className="rounded-full p-1 text-subtle hover:bg-red-500/10 hover:text-red-500 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </Card>
        ))}
      </div>

      {checked.length > 0 && (
        <details className="rounded-2xl border border-line p-3">
          <summary className="cursor-pointer text-sm font-medium text-muted">
            ✅ Checked off ({checked.length})
          </summary>
          <div className="mt-3 space-y-2">
            {checked.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3">
                <label className="flex flex-1 items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked
                    onCheckedChange={() => toggleChecked.mutate({ id: item.id, checked: false })}
                  />
                  <span className="text-sm text-subtle line-through">
                    {item.category ? meta.icons[item.category] : ""} {item.title}
                  </span>
                </label>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => clearChecked.mutate()}>
              Clear checked items
            </Button>
          </div>
        </details>
      )}
    </div>
  );
}
