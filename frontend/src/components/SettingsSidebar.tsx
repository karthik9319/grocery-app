import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronDown,
  Copy,
  Download,
  Globe,
  History,
  RotateCcw,
  Settings as SettingsIcon,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Item, Meta } from "@/types";
import { Button, Checkbox, EmptyState, Input, Label, Spinner, Switch } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";

function DuplicateGroupCard({
  group,
  meta,
  onMerge,
  merging,
}: {
  group: Item[];
  meta: Meta;
  onMerge: (keepId: number, mergeIds: number[]) => void;
  merging: boolean;
}) {
  const defaultKeep = group.reduce((a, b) => (b.quantity > a.quantity ? b : a), group[0]);
  const [keepId, setKeepId] = useState(defaultKeep.id);
  const groupKey = group.map((g) => g.id).join("-");

  return (
    <div className="space-y-2 rounded-xl border-2 border-content bg-surface-solid p-2.5 text-xs">
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
        onClick={() => onMerge(keepId, group.filter((g) => g.id !== keepId).map((g) => g.id))}
      >
        Merge into selected
      </Button>
    </div>
  );
}

export function SettingsSidebar({ meta }: { meta: Meta }) {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const [countThreshold, setCountThreshold] = useState(2);
  const [weightThreshold, setWeightThreshold] = useState(200);
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set());

  const { data: tunnel } = useQuery({
    queryKey: ["tunnel-status"],
    queryFn: api.tunnelStatus,
    refetchInterval: 2000,
  });
  const startTunnel = useMutation({
    mutationFn: api.startTunnel,
    onSuccess: (res) => {
      queryClient.setQueryData(["tunnel-status"], res);
      if (res.error) toast.error(res.error);
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Could not start the tunnel.";
      toast.error(message);
    },
  });
  const stopTunnel = useMutation({
    mutationFn: api.stopTunnel,
    onSuccess: (res) => queryClient.setQueryData(["tunnel-status"], res),
  });

  function copyTunnelUrl() {
    if (!tunnel?.url) return;
    navigator.clipboard.writeText(tunnel.url);
    toast.success("URL copied to clipboard");
  }

  useEffect(() => {
    if (settings) {
      setCountThreshold(settings.count_threshold);
      setWeightThreshold(settings.weight_threshold);
    }
  }, [settings]);

  const save = useMutation({
    mutationFn: () =>
      api.updateSettings({ count_threshold: countThreshold, weight_threshold: weightThreshold }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });

  const invalidateAfterClear = () => {
    queryClient.invalidateQueries({ queryKey: ["items"] });
    queryClient.invalidateQueries({ queryKey: ["summary"] });
    queryClient.invalidateQueries({ queryKey: ["charts"] });
    queryClient.invalidateQueries({ queryKey: ["backups"] });
  };

  const clearCategories = useMutation({
    mutationFn: async () => {
      const results = await Promise.all(Array.from(selectedCats).map((c) => api.clearItems(c)));
      return results.reduce((sum, r) => sum + r.deleted, 0);
    },
    onSuccess: (deleted) => {
      toast.success(`Cleared ${deleted} item(s)`);
      setSelectedCats(new Set());
      invalidateAfterClear();
    },
  });

  const clearAll = useMutation({
    mutationFn: () => api.clearItems(),
    onSuccess: (res) => {
      toast.success(`Cleared the entire inventory (${res.deleted} item(s))`);
      setSelectedCats(new Set());
      invalidateAfterClear();
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

  const { data: backups } = useQuery({ queryKey: ["backups"], queryFn: api.listBackups });

  const restoreBackup = useMutation({
    mutationFn: (filename: string) => api.restoreBackup(filename),
    onSuccess: (res) => {
      toast.success(`Restored ${res.added} item(s) from backup`, { icon: "⏪" });
      invalidateAfterClear();
    },
  });

  function handleRestore(filename: string) {
    if (window.confirm(`Restore items from "${filename}"?\n\nAlready-existing items will be skipped.`)) {
      restoreBackup.mutate(filename);
    }
  }

  const importAllInputRef = useRef<HTMLInputElement>(null);
  const [importingAll, setImportingAll] = useState(false);

  async function handleImportAllFile(file: File) {
    setImportingAll(true);
    try {
      const result = await api.importAll(file);
      const summary = Object.entries(result)
        .map(([list, counts]) => `${list}: ${Object.values(counts).join("/")}`)
        .join(" · ");
      toast.success(`Imported: ${summary}`, { icon: "📦" });
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
      queryClient.invalidateQueries({ queryKey: ["shopping-list"] });
      queryClient.invalidateQueries({ queryKey: ["meal-plan"] });
      queryClient.invalidateQueries({ queryKey: ["duplicates"] });
    } catch {
      toast.error("Could not import that file. Make sure it's a zip from Export all.");
    } finally {
      setImportingAll(false);
      if (importAllInputRef.current) importAllInputRef.current.value = "";
    }
  }

  const { data: duplicateGroups } = useQuery({
    queryKey: ["duplicates"],
    queryFn: api.findDuplicates,
  });

  const mergeDuplicates = useMutation({
    mutationFn: ({ keepId, mergeIds }: { keepId: number; mergeIds: number[] }) =>
      api.mergeDuplicates(keepId, mergeIds),
    onSuccess: () => {
      toast.success("Merged duplicate items.");
      queryClient.invalidateQueries({ queryKey: ["duplicates"] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
    },
  });

  return (
    <div className="space-y-2">
      <div className="px-3">
        <ThemeToggle />
      </div>

      <details className="group rounded-2xl" open>
        <summary className="flex cursor-pointer items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold text-muted hover:bg-surface">
          <Globe className="h-[18px] w-[18px] text-subtle" />
          Remote Access
          <ChevronDown className="ml-auto h-4 w-4 text-subtle transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-3 px-3 pb-3 pt-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-content">Cloudflare Tunnel</p>
              <p className="text-xs text-muted">
                {tunnel?.running ? "Reachable from anywhere" : "Running locally only"}
              </p>
            </div>
            <Switch
              checked={tunnel?.running ?? false}
              onCheckedChange={(checked) =>
                checked ? startTunnel.mutate() : stopTunnel.mutate()
              }
              disabled={startTunnel.isPending || stopTunnel.isPending}
            />
          </div>

          {tunnel?.running && !tunnel.url && (
            <div className="flex items-center gap-2 rounded-xl border-2 border-content bg-surface-solid p-2.5 text-xs text-muted">
              <Spinner className="h-4 w-4 shrink-0" />
              Starting tunnel… this can take about 10 seconds.
            </div>
          )}

          {tunnel?.url && (
            <div className="space-y-1.5 rounded-xl border-2 border-content bg-surface-solid p-2.5">
              <p className="break-all font-mono text-xs font-bold text-content">{tunnel.url}</p>
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" className="flex-1 justify-center" onClick={copyTunnelUrl}>
                  <Copy className="h-3.5 w-3.5" /> Copy
                </Button>
                <a href={tunnel.url} target="_blank" rel="noreferrer" className="flex-1">
                  <Button variant="outline" size="sm" className="w-full justify-center">
                    Open
                  </Button>
                </a>
              </div>
              <p className="text-xs text-subtle">
                Anyone with this link can use the app - only share it with people you trust.
                A new link is generated each time this is turned on.
              </p>
            </div>
          )}

          {tunnel?.error && !tunnel.running && (
            <p className="text-xs text-red-500">{tunnel.error}</p>
          )}
        </div>
      </details>

      <details className="group rounded-2xl">
        <summary className="flex cursor-pointer items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold text-muted hover:bg-surface">
          <SettingsIcon className="h-[18px] w-[18px] text-subtle" />
          Settings
          <ChevronDown className="ml-auto h-4 w-4 text-subtle transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-3 px-3 pb-3 pt-2">
          <div>
            <Label className="text-xs">Alert threshold — counts</Label>
            <Input
              type="number"
              value={countThreshold}
              onChange={(e) => setCountThreshold(parseFloat(e.target.value) || 0)}
              onBlur={() => save.mutate()}
              className="h-9"
            />
          </div>
          <div>
            <Label className="text-xs">Alert threshold — grams</Label>
            <Input
              type="number"
              value={weightThreshold}
              onChange={(e) => setWeightThreshold(parseFloat(e.target.value) || 0)}
              onBlur={() => save.mutate()}
              className="h-9"
            />
          </div>
        </div>
      </details>

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

      <details className="group rounded-2xl">
        <summary className="flex cursor-pointer items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold text-muted hover:bg-surface">
          <History className="h-[18px] w-[18px] text-subtle" />
          Recent Backups
          <ChevronDown className="ml-auto h-4 w-4 text-subtle transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-2 px-3 pb-3 pt-2">
          <p className="text-xs text-muted">
            A snapshot is auto-saved every time an item is deleted or a category/the
            whole inventory is cleared, so those actions can be undone here.
          </p>
          {!backups?.length && (
            <EmptyState icon="🗃️" title="No backups yet" />
          )}
          <div className="space-y-1.5">
            {backups?.map((b) => (
              <div
                key={b.filename}
                className="flex items-center gap-2 rounded-xl border-2 border-content bg-surface-solid p-2 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-content">
                    {new Date(b.created_at).toLocaleString()}
                  </p>
                  <p className="text-subtle">{b.item_count} item(s)</p>
                </div>
                <button
                  title="Restore"
                  onClick={() => handleRestore(b.filename)}
                  disabled={restoreBackup.isPending}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-content text-content hover:bg-theme-200 cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
                <a
                  href={api.backupDownloadUrl(b.filename)}
                  download
                  title="Download"
                  className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-content text-content hover:bg-theme-200 cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                </a>
              </div>
            ))}
          </div>
        </div>
      </details>

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
                onMerge={(keepId, mergeIds) => mergeDuplicates.mutate({ keepId, mergeIds })}
              />
            ))}
          </div>
        </div>
      </details>

      <a href={api.exportAllUrl()} download className="block">
        <Button variant="ghost" size="sm" className="w-full justify-start px-3 text-muted">
          <Download className="h-[18px] w-[18px] text-subtle" /> Export all (.zip)
        </Button>
      </a>

      <div>
        <input
          ref={importAllInputRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImportAllFile(f);
          }}
        />
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start px-3 text-muted"
          disabled={importingAll}
          onClick={() => importAllInputRef.current?.click()}
        >
          <Upload className="h-[18px] w-[18px] text-subtle" />
          {importingAll ? "Importing..." : "Import all (.zip)"}
        </Button>
      </div>

      <details className="group rounded-2xl">
        <summary className="flex cursor-pointer items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold text-muted hover:bg-surface">
          <Download className="h-[18px] w-[18px] text-subtle" />
          Export individual lists
          <ChevronDown className="ml-auto h-4 w-4 text-subtle transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-1 px-3 pb-3 pt-1">
          <a href={api.exportCsvUrl()} download="inventory.csv" className="block">
            <Button variant="ghost" size="sm" className="w-full justify-start px-2 text-muted">
              Inventory (CSV)
            </Button>
          </a>
          <a href={api.exportShoppingListCsvUrl()} download="shopping-list.csv" className="block">
            <Button variant="ghost" size="sm" className="w-full justify-start px-2 text-muted">
              Shopping List (CSV)
            </Button>
          </a>
          <a href={api.exportMealPlanCsvUrl()} download="meal-plan.csv" className="block">
            <Button variant="ghost" size="sm" className="w-full justify-start px-2 text-muted">
              Meal Planner (CSV)
            </Button>
          </a>
          <a href={api.exportFavoritesCsvUrl()} download="favorites.csv" className="block">
            <Button variant="ghost" size="sm" className="w-full justify-start px-2 text-muted">
              Favorites (CSV)
            </Button>
          </a>
        </div>
      </details>
    </div>
  );
}
