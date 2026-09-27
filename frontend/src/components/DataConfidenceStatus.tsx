import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

function relativeTime(value: string | null | undefined): string {
  if (!value) return "not yet";
  const elapsed = Date.now() - new Date(value).getTime();
  if (elapsed < 60_000) return "just now";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

export function DataConfidenceStatus({
  onOpenBackups,
  className,
}: {
  onOpenBackups?: () => void;
  className?: string;
}) {
  const { data: status } = useQuery({
    queryKey: ["backup-status"],
    queryFn: api.backupStatus,
    staleTime: 30_000,
  });

  if (!status || typeof status !== "object") {
    return <div className={cn("h-14 animate-pulse rounded-2xl bg-surface-solid", className)} />;
  }

  const body = (
    <>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
        <ShieldCheck className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-sm font-bold text-content">Your data is saved locally</span>
        <span className="block text-xs text-subtle">
          Last change {relativeTime(status.saved_at)} · Last full backup {relativeTime(status.last_backup_at)}
        </span>
      </span>
      {onOpenBackups && <span className="text-xs font-bold text-theme-600 dark:text-theme-400">View backups</span>}
    </>
  );

  return onOpenBackups ? (
    <button
      type="button"
      onClick={onOpenBackups}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border border-line bg-surface-solid px-4 py-3 shadow-sm hover:bg-surface",
        className
      )}
    >
      {body}
    </button>
  ) : (
    <div className={cn("flex items-center gap-3 rounded-2xl border border-line bg-surface-solid px-4 py-3", className)}>
      {body}
    </div>
  );
}
