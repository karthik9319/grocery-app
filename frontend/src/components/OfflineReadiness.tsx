import { useEffect, useState } from "react";
import { CloudCheck, CloudOff, RefreshCw } from "lucide-react";
import type { ShoppingListItem } from "@/types";

const CACHE_STATUS_KEY = "pantry-shopping-offline-copy";

type CachedStatus = { count: number; savedAt: string };

function readCachedStatus(): CachedStatus | null {
  try {
    const value = localStorage.getItem(CACHE_STATUS_KEY);
    return value ? JSON.parse(value) as CachedStatus : null;
  } catch {
    return null;
  }
}

export function OfflineReadiness({
  items,
  onRefresh,
  refreshing,
}: {
  items: ShoppingListItem[] | undefined;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const [online, setOnline] = useState(navigator.onLine);
  const [shellReady, setShellReady] = useState(false);
  const [cached, setCached] = useState<CachedStatus | null>(() => readCachedStatus());

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    navigator.serviceWorker?.getRegistration()
      .then((registration) => setShellReady(Boolean(registration?.active)))
      .catch(() => setShellReady(false));
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    if (!items) return;
    const next = { count: items.length, savedAt: new Date().toISOString() };
    localStorage.setItem(CACHE_STATUS_KEY, JSON.stringify(next));
    setCached(next);
  }, [items]);

  const count = cached?.count ?? 0;
  const ready = shellReady && cached != null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface-solid px-3 py-2 text-xs print:hidden">
      {online ? (
        <CloudCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <CloudOff className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      )}
      <span className="font-bold text-content">
        {!cached
          ? online ? "Offline copy not ready" : "No offline copy is available"
          : !online
          ? `Offline · ${count} list ${count === 1 ? "item" : "items"} available`
          : ready
            ? `Ready for offline shopping · ${count} ${count === 1 ? "item" : "items"} cached`
            : `List saved in this browser · ${count} ${count === 1 ? "item" : "items"}`}
      </span>
      {online && cached && !ready && (
        <span className="text-subtle">Install the app once for full offline opening.</span>
      )}
      {online && (
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="ml-auto flex items-center gap-1 font-bold text-theme-600 hover:underline disabled:opacity-50 dark:text-theme-400"
        >
          <RefreshCw className={refreshing ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
          Refresh copy
        </button>
      )}
    </div>
  );
}
