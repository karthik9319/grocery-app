import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Meta } from "@/types";
import { Button, Checkbox } from "@/components/ui";

export function DangerZoneSection({ meta }: { meta: Meta }) {
  const queryClient = useQueryClient();
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set());

  const invalidateAfterClear = () => {
    queryClient.invalidateQueries({ queryKey: ["items"] });
    queryClient.invalidateQueries({ queryKey: ["summary"] });
    queryClient.invalidateQueries({ queryKey: ["charts"] });
    queryClient.invalidateQueries({ queryKey: ["backups"] });
  };

  const clearCategories = useMutation({
    mutationFn: async () => {
      return Promise.all(Array.from(selectedCats).map((c) => api.clearItems(c)));
    },
    onSuccess: (results) => {
      const deleted = results.reduce((sum, r) => sum + r.deleted, 0);
      const backups = results.map((r) => r.backup).filter(Boolean) as string[];
      setSelectedCats(new Set());
      invalidateAfterClear();
      toast(`Cleared ${deleted} item(s)`, {
        action: backups.length
          ? {
              label: "Undo",
              onClick: async () => {
                await Promise.all(backups.map((b) => api.restoreBackup(b)));
                invalidateAfterClear();
                toast.success("Restored cleared items");
              },
            }
          : undefined,
      });
    },
  });

  const clearAll = useMutation({
    mutationFn: () => api.clearItems(),
    onSuccess: (res) => {
      setSelectedCats(new Set());
      invalidateAfterClear();
      toast(`Cleared the entire inventory (${res.deleted} item(s))`, {
        action: res.backup
          ? {
              label: "Undo",
              onClick: async () => {
                await api.restoreBackup(res.backup!);
                invalidateAfterClear();
                toast.success("Restored inventory");
              },
            }
          : undefined,
      });
    },
  });

  function toggleCat(c: string) {
    setSelectedCats((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

  function handleClearSelected() {
    if (selectedCats.size === 0) return;
    const list = Array.from(selectedCats).join(", ");
    if (window.confirm(`Delete ALL items in: ${list}?\n\nThis cannot be undone.`)) {
      clearCategories.mutate();
    }
  }

  function handleClearAll() {
    if (
      window.confirm(
        "Delete your ENTIRE inventory across every category?\n\nThis cannot be undone."
      )
    ) {
      clearAll.mutate();
    }
  }

  return (
    <details className="group rounded-2xl">
      <summary className="flex cursor-pointer items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold text-red-500 hover:bg-red-500/10">
        <AlertTriangle className="h-[18px] w-[18px]" />
        Danger Zone
        <ChevronDown className="ml-auto h-4 w-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-3 px-3 pb-3 pt-2">
        <p className="text-xs text-muted">
          Clear specific categories, or wipe everything. Cannot be undone.
        </p>
        <div className="space-y-1.5">
          {meta.categories.map((c) => (
            <label key={c} className="flex items-center gap-2 text-sm text-content cursor-pointer">
              <Checkbox
                checked={selectedCats.has(c)}
                onCheckedChange={() => toggleCat(c)}
              />
              {meta.icons[c]} {c}
            </label>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-center"
          disabled={selectedCats.size === 0 || clearCategories.isPending}
          onClick={handleClearSelected}
        >
          <Trash2 className="h-4 w-4" /> Clear selected categories
        </Button>
        <Button
          variant="danger"
          size="sm"
          className="w-full justify-center"
          disabled={clearAll.isPending}
          onClick={handleClearAll}
        >
          <Trash2 className="h-4 w-4" /> Clear entire inventory
        </Button>
      </div>
    </details>
  );
}
