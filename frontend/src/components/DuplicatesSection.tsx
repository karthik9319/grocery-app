import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Copy } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Item, Meta } from "@/types";
import { Button, EmptyState } from "@/components/ui";

function DuplicateGroupCard({
  group,
  meta,
  onMerge,
  merging,
}: {
  group: Item[];
  meta: Meta;
  onMerge: (keepId: number, group: Item[]) => void;
  merging: boolean;
}) {
  const defaultKeep = group.reduce((a, b) => (b.quantity > a.quantity ? b : a), group[0]);
  const [keepId, setKeepId] = useState(defaultKeep.id);
  const groupKey = group.map((g) => g.id).join("-");

  return (
    <div className="space-y-2 rounded-xl border border-line bg-surface-solid p-2.5 text-xs">
      {group.map((item) => (
        <label key={item.id} className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name={`dup-${groupKey}`}
            checked={keepId === item.id}
            onChange={() => setKeepId(item.id)}
          />
          <span className="min-w-0 flex-1 truncate">
            {meta.icons[item.category]} {item.title}
          </span>
          <span className="shrink-0 text-subtle">
            {item.quantity}
            {meta.units[item.category] === "g" ? "g" : ""}
          </span>
        </label>
      ))}
      <Button
        variant="outline"
        size="sm"
        className="w-full justify-center"
        disabled={merging}
        onClick={() => onMerge(keepId, group)}
      >
        Merge into selected
      </Button>
    </div>
  );
}

export function DuplicatesSection({ meta }: { meta: Meta }) {
  const queryClient = useQueryClient();

  const { data: duplicateGroups } = useQuery({
    queryKey: ["duplicates"],
    queryFn: api.findDuplicates,
  });

  const mergeDuplicates = useMutation({
    mutationFn: async ({ keepId, group }: { keepId: number; group: Item[] }) => {
      const keep = group.find((g) => g.id === keepId)!;
      const merged = group.filter((g) => g.id !== keepId);
      await api.mergeDuplicates(keepId, merged.map((m) => m.id));
      return { keep, merged };
    },
    onSuccess: ({ keep, merged }) => {
      queryClient.invalidateQueries({ queryKey: ["duplicates"] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      toast("Merged duplicate items.", {
        action: {
          label: "Undo",
          onClick: async () => {
            // Restore the kept item's original quantity and re-add the merged rows with
            // their original data/uuid (best-effort: images removed during merge are lost).
            await api.patchQuantity(keep.id, keep.quantity);
            await Promise.all(merged.map((m) => api.restoreItem(m)));
            queryClient.invalidateQueries({ queryKey: ["duplicates"] });
            queryClient.invalidateQueries({ queryKey: ["items"] });
            queryClient.invalidateQueries({ queryKey: ["summary"] });
            toast.success("Merge undone");
          },
        },
      });
    },
  });

  return (
    <details className="group rounded-2xl">
      <summary className="flex cursor-pointer items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold text-muted hover:bg-surface">
        <Copy className="h-[18px] w-[18px] text-subtle" />
        Possible Duplicates{duplicateGroups?.length ? ` (${duplicateGroups.length})` : ""}
        <ChevronDown className="ml-auto h-4 w-4 text-subtle transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-2 px-3 pb-3 pt-2">
        <p className="text-xs text-muted">
          Items with similar names (plurals, small typos) that might be the same thing
          tracked twice. Pick which to keep - its quantity gets the others added on, and
          the old name(s) become an alias so re-adding under them merges correctly.
        </p>
        {!duplicateGroups?.length && <EmptyState icon="✅" title="No duplicates found" />}
        <div className="space-y-2">
          {duplicateGroups?.map((group) => (
            <DuplicateGroupCard
              key={group.map((g) => g.id).join("-")}
              group={group}
              meta={meta}
              merging={mergeDuplicates.isPending}
              onMerge={(keepId, group) => mergeDuplicates.mutate({ keepId, group })}
            />
          ))}
        </div>
      </div>
    </details>
  );
}
