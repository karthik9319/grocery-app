import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Meta } from "@/types";
import { cn } from "@/lib/utils";

type Row = { key: string; icon: string; label: string; sub?: string; run: () => void };

/**
 * ⌘K / Ctrl+K command palette: fuzzy-navigate tabs, jump to items (live search),
 * and run quick actions. Keyboard: ↑/↓ to move, ↵ to select, Esc to close.
 */
export function CommandPalette({
  meta,
  onNavigate,
  onAddLowStock,
}: {
  meta: Meta;
  onNavigate: (tab: string) => void;
  onAddLowStock: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  const query = q.trim().toLowerCase();

  const { data: results } = useQuery({
    queryKey: ["search", q],
    queryFn: () => api.searchAll(q),
    enabled: open && query.length > 0,
  });

  const actions = useMemo<Row[]>(() => {
    const close = (fn: () => void) => () => {
      fn();
      setOpen(false);
    };
    const navTargets: { id: string; label: string; icon: string }[] = [
      { id: "overview", label: "Go to Overview", icon: "📊" },
      { id: "add-items", label: "Add items", icon: "➕" },
      { id: "search", label: "Global search", icon: "🔍" },
      { id: "shopping", label: "Shopping list", icon: "🛍️" },
      { id: "meal-planner", label: "Meal planner", icon: "📅" },
      { id: "charts", label: "Charts", icon: "📈" },
      ...meta.categories.map((c) => ({ id: c, label: `Go to ${c}`, icon: meta.icons[c] ?? "📦" })),
    ];
    const rows: Row[] = navTargets.map((t) => ({
      key: `nav-${t.id}`,
      icon: t.icon,
      label: t.label,
      run: close(() => onNavigate(t.id)),
    }));
    rows.push({
      key: "act-lowstock",
      icon: "🛒",
      label: "Add all low-stock to shopping list",
      run: close(onAddLowStock),
    });
    return rows;
  }, [meta, onNavigate, onAddLowStock]);

  const filteredActions = query ? actions.filter((a) => a.label.toLowerCase().includes(query)) : actions;
  const itemRows: Row[] = (results?.items ?? []).slice(0, 8).map((it) => ({
    key: `item-${it.id}`,
    icon: meta.icons[it.category] ?? "📦",
    label: it.title,
    sub: it.category,
    run: () => {
      onNavigate(it.category);
      setOpen(false);
    },
  }));

  const rows = [...filteredActions, ...itemRows];

  useEffect(() => {
    setSel(0);
  }, [q, results]);

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      rows[sel]?.run();
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[12vh]"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-surface-solid shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="text-subtle">⌘</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Search items, run an action…"
            className="flex-1 bg-transparent text-[15px] text-content outline-none placeholder:text-subtle"
          />
          <kbd className="rounded border border-line px-1.5 py-0.5 text-[11px] text-subtle">esc</kbd>
        </div>
        <div className="max-h-[360px] overflow-auto p-2">
          {rows.length === 0 && <p className="px-3 py-6 text-center text-sm text-subtle">No matches</p>}
          {rows.map((r, i) => (
            <button
              key={r.key}
              onClick={r.run}
              onMouseEnter={() => setSel(i)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                i === sel ? "bg-theme-500/15" : "hover:bg-surface"
              )}
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-black/5 dark:bg-white/10">
                {r.icon}
              </span>
              <span className="flex-1 truncate text-content">{r.label}</span>
              {r.sub && <span className="text-xs text-subtle">{r.sub}</span>}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 border-t border-line px-4 py-2 text-[11px] text-subtle">
          <kbd className="rounded border border-line px-1 py-0.5">↑</kbd>
          <kbd className="rounded border border-line px-1 py-0.5">↓</kbd>
          navigate
          <kbd className="ml-2 rounded border border-line px-1 py-0.5">↵</kbd>
          select
        </div>
      </div>
    </div>
  );
}
