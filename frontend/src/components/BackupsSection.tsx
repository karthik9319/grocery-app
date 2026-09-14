import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Download, History, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { EmptyState } from "@/components/ui";

export function BackupsSection() {
  const queryClient = useQueryClient();

  const invalidateAfterClear = () => {
    queryClient.invalidateQueries({ queryKey: ["items"] });
    queryClient.invalidateQueries({ queryKey: ["summary"] });
    queryClient.invalidateQueries({ queryKey: ["charts"] });
    queryClient.invalidateQueries({ queryKey: ["backups"] });
  };

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

  return (
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
              className="flex items-center gap-2 rounded-xl border border-line bg-surface-solid p-2 text-xs"
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
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-line text-content hover:bg-theme-200 cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <a
                href={api.backupDownloadUrl(b.filename)}
                download
                title="Download"
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-line text-content hover:bg-theme-200 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
              </a>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}
