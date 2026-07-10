import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, PlusCircle, Search, ShoppingBag } from "lucide-react";
import { api } from "@/lib/api";
import { Header } from "@/components/Header";
import { AddItemsTab } from "@/components/AddItemsTab";
import { CategoryView } from "@/components/CategoryView";
import { GlobalSearchTab } from "@/components/GlobalSearchTab";
import { ShoppingListTab } from "@/components/ShoppingListTab";
import { ChartsTab } from "@/components/ChartsTab";
import { SettingsSidebar } from "@/components/SettingsSidebar";
import { Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";

type NavItem = {
  value: string;
  label: string;
  emoji?: string;
  icon?: React.ReactNode;
  accent: string;
  badge?: number;
};

function App() {
  const { data: meta, isLoading } = useQuery({ queryKey: ["meta"], queryFn: api.meta });
  const { data: counts } = useQuery({
    queryKey: ["charts", "category-counts"],
    queryFn: api.chartCategoryCounts,
  });
  const { data: shopping } = useQuery({ queryKey: ["shopping-list"], queryFn: api.shoppingList });
  const [active, setActive] = useState("add-items");

  if (isLoading || !meta) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Spinner className="h-8 w-8" />
          <p className="text-sm text-subtle">Loading your pantry…</p>
        </div>
      </div>
    );
  }

  const shoppingOpen = shopping?.filter((s) => !s.checked).length ?? 0;

  const nav: NavItem[] = [
    {
      value: "add-items",
      label: "Add Items",
      icon: <PlusCircle className="h-[18px] w-[18px]" />,
      accent: "var(--theme-500)",
    },
    {
      value: "search",
      label: "Search",
      icon: <Search className="h-[18px] w-[18px]" />,
      accent: "var(--theme-600)",
    },
    ...meta.categories.map((c) => ({
      value: c,
      label: c,
      emoji: meta.icons[c],
      accent: meta.palette[c],
      badge: counts?.[c] ?? 0,
    })),
    {
      value: "shopping",
      label: "Shopping List",
      icon: <ShoppingBag className="h-[18px] w-[18px]" />,
      accent: "#6C63FF",
      badge: shoppingOpen || undefined,
    },
    {
      value: "charts",
      label: "Charts",
      icon: <BarChart3 className="h-[18px] w-[18px]" />,
      accent: "#0EA5E9",
    },
  ];

  const activeItem = nav.find((n) => n.value === active);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1680px] gap-6 px-4 py-6 lg:px-8 2xl:gap-8">
      {/* Left nav rail */}
      <aside className="sticky top-6 hidden h-[calc(100vh-3rem)] w-64 shrink-0 flex-col lg:flex 2xl:w-72">
        <div className="glass flex flex-1 flex-col overflow-y-auto rounded-3xl p-3 shadow-[5px_5px_0_var(--line)]">
          <div className="mb-4 flex items-center gap-3 px-2 pt-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border-[3px] border-content bg-theme-400 text-2xl shadow-[3px_3px_0_var(--line)]">
              🛒
            </div>
            <div className="leading-tight">
              <p className="font-display text-sm text-content">Pantry</p>
              <p className="text-xs font-semibold text-subtle">Tracker</p>
            </div>
          </div>

          <nav className="flex flex-1 flex-col gap-2">
            {nav.map((item) => {
              const isActive = item.value === active;
              return (
                <button
                  key={item.value}
                  onClick={() => setActive(item.value)}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-2xl border-[3px] px-3 py-2.5 text-sm font-bold transition-all duration-150 cursor-pointer",
                    isActive
                      ? "border-content text-white -translate-x-0.5 -translate-y-0.5 shadow-[3px_3px_0_var(--line)]"
                      : "border-transparent text-muted hover:border-content hover:bg-surface"
                  )}
                  style={isActive ? { backgroundColor: item.accent } : undefined}
                >
                  <span
                    className={
                      isActive
                        ? "flex h-8 w-8 items-center justify-center"
                        : "flex h-8 w-8 items-center justify-center text-subtle group-hover:text-content"
                    }
                  >
                    {item.emoji ? <span className="text-lg">{item.emoji}</span> : item.icon}
                  </span>
                  <span className={isActive ? "" : "text-muted group-hover:text-content"}>
                    {item.label}
                  </span>
                  {item.badge != null && item.badge > 0 && (
                    <span
                      className="ml-auto rounded-full border-2 px-2 py-0.5 text-xs font-bold"
                      style={
                        isActive
                          ? { backgroundColor: "#fff", color: item.accent, borderColor: "var(--content)" }
                          : { backgroundColor: `${item.accent}22`, color: item.accent, borderColor: item.accent }
                      }
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="mt-3 border-t border-line pt-3">
            <SettingsSidebar />
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="min-w-0 flex-1 space-y-7">
        <Header meta={meta} />

        {/* Mobile nav (horizontal scroll) */}
        <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
          {nav.map((item) => {
            const isActive = item.value === active;
            return (
              <button
                key={item.value}
                onClick={() => setActive(item.value)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border-[3px] border-content px-3 py-2 text-sm font-bold transition-all cursor-pointer",
                  isActive ? "text-white shadow-[3px_3px_0_var(--line)]" : "bg-surface-solid text-content"
                )}
                style={isActive ? { backgroundColor: item.accent } : undefined}
              >
                {item.emoji ?? item.icon}
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Section header */}
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-2xl border-[3px] border-content text-xl shadow-[3px_3px_0_var(--line)]"
            style={{ backgroundColor: `${activeItem?.accent}33` }}
          >
            {activeItem?.emoji ?? activeItem?.icon}
          </span>
          <div>
            <h2 className="font-display text-xl text-content">
              {activeItem?.label}
            </h2>
            <p className="text-xs font-semibold text-subtle">
              {active === "add-items" && "Snap a photo or scan a receipt to stock up"}
              {active === "search" && "Find any item across every category"}
              {active === "shopping" && "Plan your next grocery run"}
              {active === "charts" && "Insights across your inventory"}
              {meta.categories.includes(active) && `Everything in your ${active.toLowerCase()}`}
            </p>
          </div>
        </div>

        <div className="animate-fade-in">
          {active === "add-items" && <AddItemsTab meta={meta} />}
          {active === "search" && <GlobalSearchTab meta={meta} />}
          {meta.categories.map(
            (c) => active === c && <CategoryView key={c} category={c} meta={meta} />
          )}
          {active === "shopping" && <ShoppingListTab meta={meta} />}
          {active === "charts" && <ChartsTab meta={meta} />}
        </div>
      </main>
    </div>
  );
}

export default App;
