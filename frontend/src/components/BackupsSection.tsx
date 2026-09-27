import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ChevronDown, Download, History, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { AppSnapshot, SnapshotCounts } from "@/types";
import { Button, EmptyState } from "@/components/ui";
import { DataConfidenceStatus } from "@/components/DataConfidenceStatus";

function dayLabel(value: string): string {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function countSummary(counts: SnapshotCounts): string {
  return `${counts.items} pantry · ${counts.shopping_items} shopping · ${counts.meals} meals · ${counts.trips} trips`;
}

function reasonLabel(reason: string): string {
  if (reason === "daily") return "Automatic";
  if (reason === "before-restore") return "Safety copy";
  return "Manual";
}

export function BackupsSection() {
  const queryClient = useQueryClient();
  const { data: snapshots } = useQuery({ queryKey: ["snapshots"], queryFn: api.listSnapshots });
  const { data: backups } = useQuery({ queryKey: ["backups"], queryFn: api.listBackups });
  const snapshotList = Array.isArray(snapshots) ? snapshots : [];
  const deletedItemBackups = Array.isArray(backups) ? backups : [];

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["snapshots"] });
    queryClient.invalidateQueries({ queryKey: ["backup-status"] });
  };

  const createSnapshot = useMutation({
    mutationFn: api.createSnapshot,
    onSuccess: () => {
      refresh();
      toast.success("Full backup created", { icon: "🛡️" });
    },
    onError: () => toast.error("Could not create the backup."),
  });

  const restoreSnapshot = useMutation({
    mutationFn: (filename: string) => api.restoreSnapshot(filename),
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast.success("Backup restored. A safety copy of the previous data was kept.", { icon: "⏪" });
    },
    onError: () => toast.error("Could not restore that backup."),
  });

  const restoreDeletedItems = useMutation({
    mutationFn: (filename: string) => api.restoreBackup(filename),
    onSuccess: (res) => {
      toast.success(`Restored ${res.added} item(s) from deletion backup`, { icon: "⏪" });
      queryClient.invalidateQueries();
    },
  });

  async function handleFullRestore(snapshot: AppSnapshot) {
    try {
      const preview = await api.previewSnapshot(snapshot.filename);
      const confirmed = window.confirm(
        `Restore the ${dayLabel(snapshot.created_at)} backup?\n\n` +
          `Current: ${countSummary(preview.current_counts)}\n` +
          `Backup: ${countSummary(preview.snapshot.counts)}\n\n` +
          "This replaces current app data. A safety backup will be created first."
      );
      if (confirmed) restoreSnapshot.mutate(snapshot.filename);
    } catch {
      toast.error("Could not preview that backup.");
    }
  }

  return (
    <div className="space-y-4 rounded-2xl px-3 py-2.5">
      <div className="flex items-start gap-3">
        <Archive className="mt-0.5 h-[18px] w-[18px] text-subtle" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-content">Backups & restore</p>
          <p className="mt-0.5 text-xs text-muted">A full backup is created automatically each day.</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => createSnapshot.mutate()}
          disabled={createSnapshot.isPending}
        >
          <Save className="h-4 w-4" /> Back up now
        </Button>
      </div>

      <DataConfidenceStatus />

      {!snapshotList.length && <EmptyState icon="🗃️" title="No full backups yet" />}
      <div className="space-y-2">
        {snapshotList.map((snapshot) => (
          <div key={snapshot.filename} className="rounded-xl border border-line bg-surface-solid p-3">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-bold text-content">
                  {dayLabel(snapshot.created_at)} · {new Date(snapshot.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </p>
                <p className="text-xs text-subtle">
                  {reasonLabel(snapshot.reason)} · {countSummary(snapshot.counts)}
                </p>
              </div>
              <button
                type="button"
                title="Preview and restore"
                onClick={() => handleFullRestore(snapshot)}
                disabled={restoreSnapshot.isPending}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-content hover:bg-theme-200 disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <a
                href={api.snapshotDownloadUrl(snapshot.filename)}
                download
                title="Download full backup"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-content hover:bg-theme-200"
              >
                <Download className="h-4 w-4" />
              </a>
            </div>
          </div>
        ))}
      </div>

      <details className="group rounded-xl border border-line">
        <summary className="flex cursor-pointer items-center gap-2 px-3 py-2.5 text-xs font-bold text-muted">
          <History className="h-4 w-4" /> Deleted-item backups
          <span className="ml-1 text-subtle">{deletedItemBackups.length}</span>
          <ChevronDown className="ml-auto h-4 w-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-2 border-t border-line p-3">
          <p className="text-xs text-muted">These smaller CSV copies are created before inventory deletions.</p>
          {!deletedItemBackups.length && <p className="text-xs text-subtle">No deletion backups yet.</p>}
          {deletedItemBackups.map((backup) => (
            <div key={backup.filename} className="flex items-center gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate text-content">
                {new Date(backup.created_at).toLocaleString()} · {backup.item_count} item(s)
              </span>
              <button
                type="button"
                title="Restore deleted items"
                onClick={() => restoreDeletedItems.mutate(backup.filename)}
                className="rounded-lg border border-line p-1.5 text-content hover:bg-theme-200"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
