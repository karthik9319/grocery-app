import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, PlusCircle, ShoppingBag } from "lucide-react";
import { api } from "@/lib/api";
import { Header } from "@/components/Header";
import { AddItemsTab } from "@/components/AddItemsTab";
import { CategoryView } from "@/components/CategoryView";
import { ShoppingListTab } from "@/components/ShoppingListTab";
import { ChartsTab } from "@/components/ChartsTab";
import { SettingsSidebar } from "@/components/SettingsSidebar";
import { Spinner } from "@/components/ui";

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
      accent: "#1B7A4D",
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
        <div className="glass flex flex-1 flex-col rounded-3xl p-3 shadow-soft">
          <div className="mb-4 flex items-center gap-3 px-2 pt-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 via-brand-600 to-household-500 text-2xl shadow-glow">
              🛒
            </div>
            <div className="leading-tight">
              <p className="gradient-text text-sm font-extrabold">Pantry</p>
              <p className="text-xs text-subtle">Tracker</p>
            </div>
          </div>

          <nav className="flex flex-1 flex-col gap-1">
            {nav.map((item) => {
              const isActive = item.value === active;
              return (
                <button
                  key={item.value}
                  onClick={() => setActive(item.value)}
                  className="group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition-all duration-200 cursor-pointer"
                  style={
                    isActive
                      ? {
                          background: `linear-gradient(120deg, ${item.accent}, ${item.accent}cc)`,
                          color: "#fff",
                          boxShadow: `0 10px 24px -8px ${item.accent}99`,
                        }
                      : undefined
                  }
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
                      className="ml-auto rounded-full px-2 py-0.5 text-xs font-bold"
                      style={
                        isActive
                          ? { backgroundColor: "rgba(255,255,255,0.25)", color: "#fff" }
                          : { backgroundColor: `${item.accent}1f`, color: item.accent }
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
      <main className="min-w-0 flex-1 space-y-6">
        <Header meta={meta} />

        {/* Mobile nav (horizontal scroll) */}
        <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
          {nav.map((item) => {
            const isActive = item.value === active;
            return (
              <button
                key={item.value}
                onClick={() => setActive(item.value)}
                className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition-all cursor-pointer"
                style={
                  isActive
                    ? { backgroundColor: item.accent, color: "white" }
                    : { backgroundColor: "white", color: "#525252" }
                }
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
            className="flex h-10 w-10 items-center justify-center rounded-2xl text-xl shadow-soft"
            style={{ backgroundColor: `${activeItem?.accent}18` }}
          >
            {activeItem?.emoji ?? activeItem?.icon}
          </span>
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-content">
              {activeItem?.label}
            </h2>
            <p className="text-xs text-subtle">
              {active === "add-items" && "Snap a photo or scan a receipt to stock up"}
              {active === "shopping" && "Plan your next grocery run"}
              {active === "charts" && "Insights across your inventory"}
              {meta.categories.includes(active) && `Everything in your ${active.toLowerCase()}`}
            </p>
          </div>
        </div>

        <div className="animate-fade-in">
          {active === "add-items" && <AddItemsTab meta={meta} />}
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
