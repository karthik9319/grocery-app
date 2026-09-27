import { lazy, Suspense, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BarChart3, CalendarDays, ChevronDown, CloudOff, Globe2, LayoutDashboard, MoreHorizontal, Plus, PlusCircle, Search, Settings, ShoppingBag, ShoppingBasket } from "lucide-react";
import { api } from "@/lib/api";
import { QUEUE_CHANGED_EVENT, queueSize } from "@/lib/offlineQueue";
import { checkAndShowDailyReminder } from "@/lib/dailyReminder";
import { OverviewTab } from "@/components/OverviewTab";
import { AddItemsTab, QuickAddPanel } from "@/components/AddItemsTab";
import { CategoryView } from "@/components/CategoryView";
import { CommandPalette } from "@/components/CommandPalette";
import { SettingsSidebar } from "@/components/SettingsSidebar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/DropdownMenu";
import { Button, Spinner } from "@/components/ui";
import { Dialog, DialogContent } from "@/components/Dialog";
import { cn } from "@/lib/utils";

// Lazy-loaded: these pull in heavier dependencies (Recharts, date-fns) that aren't
// needed for the default "Add Items" tab - splitting them out shrinks the initial
// bundle so the app loads faster on slow/mobile connections.
const GlobalSearchTab = lazy(() =>
  import("@/components/GlobalSearchTab").then((m) => ({ default: m.GlobalSearchTab }))
);
const ShoppingListTab = lazy(() =>
  import("@/components/ShoppingListTab").then((m) => ({ default: m.ShoppingListTab }))
);
const MealPlannerTab = lazy(() =>
  import("@/components/MealPlannerTab").then((m) => ({ default: m.MealPlannerTab }))
);
const ChartsTab = lazy(() =>
  import("@/components/ChartsTab").then((m) => ({ default: m.ChartsTab }))
);

function TabFallback() {
  return (
    <div className="animate-pulse space-y-5" aria-label="Loading section">
      <div className="h-14 rounded-2xl bg-surface-solid" />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="h-24 rounded-2xl bg-surface-solid" />
        <div className="h-24 rounded-2xl bg-surface-solid" />
        <div className="h-24 rounded-2xl bg-surface-solid" />
      </div>
      <div className="h-64 rounded-2xl bg-surface-solid" />
    </div>
  );
}

type NavItem = {
  value: string;
  label: string;
  emoji?: string;
  icon?: React.ReactNode;
  accent: string;
  badge?: number;
};

function App() {
  const {
    data: meta,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({ queryKey: ["meta"], queryFn: api.meta });
  const { data: counts } = useQuery({
    queryKey: ["charts", "category-counts"],
    queryFn: api.chartCategoryCounts,
  });
  const { data: shopping } = useQuery({ queryKey: ["shopping-list"], queryFn: api.shoppingList });
  const { data: tunnel } = useQuery({
    queryKey: ["tunnel-status"],
    queryFn: api.tunnelStatus,
    refetchInterval: 3000,
  });
  const [active, setActive] = useState("overview");
  const [pantryOpen, setPantryOpen] = useState(true);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const queryClient = useQueryClient();
  const addLowStock = useMutation({
    mutationFn: api.addLowStockToShoppingList,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["shopping-list"] });
      toast.success(`Added ${res.added} low-stock item(s) to the shopping list`, { icon: "🛍️" });
    },
  });
  const stopTunnel = useMutation({
    mutationFn: api.stopTunnel,
    onSuccess: (result) => {
      queryClient.setQueryData(["tunnel-status"], result);
      toast.success("Remote access turned off");
    },
    onError: () => toast.error("Could not turn off remote access."),
  });

  useEffect(() => {
    checkAndShowDailyReminder();
    const id = setInterval(checkAndShowDailyReminder, 60_000);
    return () => clearInterval(id);
  }, []);

  if (isError) {
    return (
      <div className="flex h-screen items-center justify-center px-6">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <p className="text-3xl">📡</p>
          <p className="font-display text-lg text-content">Couldn't reach the server</p>
          <p className="text-sm text-subtle">
            This can happen on a slow or unstable connection. Check your signal and try again.
          </p>
          <Button onClick={() => refetch()} disabled={isRefetching}>
            {isRefetching && <Spinner className="h-4 w-4" />}
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading || !meta) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px] gap-6 px-4 py-6 lg:px-8">
        <div className="hidden h-[calc(100vh-3rem)] w-64 shrink-0 animate-pulse rounded-3xl bg-surface-solid lg:block" />
        <div className="min-w-0 flex-1 animate-pulse space-y-6">
          <div className="h-12 w-56 rounded-2xl bg-surface-solid" />
          <div className="h-56 rounded-3xl bg-surface-solid" />
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="h-64 rounded-2xl bg-surface-solid" />
            <div className="h-64 rounded-2xl bg-surface-solid" />
          </div>
        </div>
      </div>
    );
  }

  const shoppingOpen = shopping?.filter((s) => !s.checked).length ?? 0;

  const nav: NavItem[] = [
    {
      value: "overview",
      label: "Today",
      icon: <LayoutDashboard className="h-[18px] w-[18px]" />,
      accent: "var(--theme-500)",
    },
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
      value: "meal-planner",
      label: "Meal Planner",
      icon: <CalendarDays className="h-[18px] w-[18px]" />,
      accent: "#F5A524",
    },
    {
      value: "charts",
      label: "Insights",
      icon: <BarChart3 className="h-[18px] w-[18px]" />,
      accent: "#0EA5E9",
    },
    {
      value: "settings",
      label: "Settings",
      icon: <Settings className="h-[18px] w-[18px]" />,
      accent: "#64748B",
    },
  ];

  const activeItem = nav.find((n) => n.value === active);
  const pantryHome = meta.categories[0];
  const mobilePrimaryValues = new Set(["overview", "shopping", "meal-planner", pantryHome]);
  const mobileMore = nav.filter(
    (item) => !mobilePrimaryValues.has(item.value) && item.value !== "add-items"
  );
  const moreIsActive = mobileMore.some((item) => item.value === active);
  const primaryDesktopValues = new Set(["overview", "add-items", "shopping", "meal-planner", "charts"]);
  const primaryDesktop = nav.filter((item) => primaryDesktopValues.has(item.value));
  const categoryNav = nav.filter((item) => meta.categories.includes(item.value));
  const settingsNav = nav.find((item) => item.value === "settings")!;
  return (
    <div
      className="mx-auto flex min-h-screen w-full max-w-[1440px] gap-6 px-4 pb-28 pt-6 lg:px-8 lg:pb-6 2xl:gap-8"
      style={{
        paddingLeft: "max(1rem, env(safe-area-inset-left))",
        paddingRight: "max(1rem, env(safe-area-inset-right))",
      }}
    >
      {/* Left nav rail */}
      <aside className="sticky top-[max(1.5rem,env(safe-area-inset-top))] hidden h-[calc(100vh-3rem)] w-64 shrink-0 flex-col lg:flex 2xl:w-72 print:hidden">
        <div className="glass flex flex-1 flex-col overflow-y-auto rounded-3xl p-3 shadow-lg">
          <div className="mb-4 flex items-center gap-3 px-2 pt-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-line bg-theme-400 text-2xl shadow-sm">
              🛒
            </div>
            <div className="leading-tight">
              <p className="font-display text-sm text-content">Pantry Pilot</p>
              <p className="text-xs font-semibold text-subtle">Home food companion</p>
            </div>
          </div>

          <nav className="flex flex-col gap-1.5">
            {primaryDesktop.map((item) => {
              const isActive = item.value === active;
              return (
                <button
                  key={item.value}
                  onClick={() => setActive(item.value)}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-sm font-bold transition-all duration-150 cursor-pointer",
                    isActive
                      ? "border-line text-white shadow-sm"
                      : "border-transparent text-muted hover:border-line hover:bg-surface"
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

            <button
              type="button"
              onClick={() => setPantryOpen((open) => !open)}
              className="mt-1 flex items-center gap-3 rounded-2xl border border-transparent px-3 py-2 text-sm font-bold text-muted hover:border-line hover:bg-surface hover:text-content"
              aria-expanded={pantryOpen}
            >
              <span className="flex h-8 w-8 items-center justify-center text-lg">🧺</span>
              <span>Pantry</span>
              <span className="ml-auto text-xs text-subtle">
                {Object.values(counts ?? {}).reduce((sum, count) => sum + count, 0)}
              </span>
              <ChevronDown className={`h-4 w-4 transition-transform ${pantryOpen ? "rotate-180" : ""}`} />
            </button>

            {pantryOpen && (
              <div className="ml-5 space-y-1 border-l border-line pl-2">
                {categoryNav.map((item) => {
                  const isActive = item.value === active;
                  return (
                    <button
                      key={item.value}
                      onClick={() => setActive(item.value)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors",
                        isActive ? "text-white shadow-sm" : "text-muted hover:bg-surface hover:text-content"
                      )}
                      style={isActive ? { backgroundColor: item.accent } : undefined}
                    >
                      <span>{item.emoji}</span>
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      <span className={cn("text-xs", isActive ? "text-white/80" : "text-subtle")}>
                        {item.badge ?? 0}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <button
              onClick={() => setActive(settingsNav.value)}
              className={cn(
                "mt-2 flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-sm font-bold transition-all",
                active === settingsNav.value
                  ? "border-line text-white shadow-sm"
                  : "border-transparent text-muted hover:border-line hover:bg-surface hover:text-content"
              )}
              style={active === settingsNav.value ? { backgroundColor: settingsNav.accent } : undefined}
            >
              <span className="flex h-8 w-8 items-center justify-center">{settingsNav.icon}</span>
              Settings
            </button>
          </nav>

        </div>
      </aside>

      {/* Main content */}
      <main className="min-w-0 flex-1 space-y-7">
        <OfflineBanner />
        {tunnel?.running && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-400/60 bg-amber-50 px-4 py-2.5 text-sm text-amber-950 shadow-sm dark:bg-amber-950/40 dark:text-amber-100 print:hidden">
            <Globe2 className="h-4 w-4 shrink-0" />
            <span className="font-bold">Remote access is on</span>
            <span className="text-xs opacity-80">Anyone with the current link can open Pantry Pilot.</span>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => stopTunnel.mutate()}
              disabled={stopTunnel.isPending}
            >
              Turn off
            </Button>
          </div>
        )}
        {/* Section header */}
        <div className="flex items-center gap-3 print:hidden">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-line text-xl shadow-sm"
            style={{ backgroundColor: `${activeItem?.accent}33` }}
          >
            {activeItem?.emoji ?? activeItem?.icon}
          </span>
          <div>
            <h2 className="font-display text-xl text-content">
              {activeItem?.label}
            </h2>
            <p className="text-xs font-semibold text-subtle">
              {active === "overview" && "What needs your attention now"}
              {active === "add-items" && "Snap a photo or scan a receipt to stock up"}
              {active === "search" && "Find any item across every category"}
              {active === "shopping" && "Plan your next grocery run"}
              {active === "meal-planner" && "Plan what to cook this week"}
              {active === "charts" && "Insights across your inventory"}
              {active === "settings" && "Preferences, data tools, backups, and remote access"}
              {meta.categories.includes(active) && `Everything in your ${active.toLowerCase()}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActive("search")}
            className="ml-auto flex h-10 items-center gap-2 rounded-xl border border-line bg-surface-solid px-3 text-sm font-bold text-muted shadow-sm hover:text-content"
            aria-label="Search everything"
          >
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">Search</span>
          </button>
        </div>

        <div className="animate-fade-in">
          {active === "overview" && <OverviewTab meta={meta} onNavigate={setActive} />}
          {active === "add-items" && <AddItemsTab meta={meta} />}
          {meta.categories.map(
            (c) => active === c && <CategoryView key={c} category={c} meta={meta} onNavigate={setActive} />
          )}
          <Suspense fallback={<TabFallback />}>
            {active === "search" && <GlobalSearchTab meta={meta} />}
            {active === "shopping" && <ShoppingListTab meta={meta} />}
            {active === "meal-planner" && <MealPlannerTab />}
            {active === "charts" && <ChartsTab meta={meta} onNavigate={setActive} />}
          </Suspense>
          {active === "settings" && <SettingsSidebar meta={meta} />}
        </div>
      </main>
      <nav
        aria-label="Primary navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface-solid/95 px-2 pt-2 shadow-[0_-8px_28px_rgba(15,23,42,0.12)] backdrop-blur-xl lg:hidden print:hidden"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto grid max-w-lg grid-cols-6 items-end gap-1">
          <MobileNavButton
            label="Home"
            icon={<LayoutDashboard className="h-5 w-5" />}
            active={active === "overview"}
            onClick={() => setActive("overview")}
          />
          <MobileNavButton
            label="Shop"
            icon={<ShoppingBag className="h-5 w-5" />}
            active={active === "shopping"}
            badge={shoppingOpen}
            onClick={() => setActive("shopping")}
          />
          <button
            type="button"
            onClick={() => setQuickAddOpen(true)}
            className="group -mt-6 flex flex-col items-center gap-1 text-[10px] font-bold text-theme-700 dark:text-theme-300"
            aria-label="Quick add an item"
          >
            <span className="grid h-14 w-14 place-items-center rounded-full border-4 border-canvas bg-theme-500 text-white shadow-lg transition-transform duration-150 group-active:scale-95">
              <Plus className="h-7 w-7" strokeWidth={3} />
            </span>
            Add
          </button>
          <MobileNavButton
            label="Pantry"
            icon={<ShoppingBasket className="h-5 w-5" />}
            active={Boolean(pantryHome && active === pantryHome)}
            onClick={() => pantryHome && setActive(pantryHome)}
          />
          <MobileNavButton
            label="Meals"
            icon={<CalendarDays className="h-5 w-5" />}
            active={active === "meal-planner"}
            onClick={() => setActive("meal-planner")}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div>
                <MobileNavButton
                  label="More"
                  icon={<MoreHorizontal className="h-5 w-5" />}
                  active={moreIsActive}
                  onClick={() => undefined}
                />
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="mb-2 min-w-[220px]">
              {mobileMore.map((item) => (
                <DropdownMenuItem key={item.value} onSelect={() => setActive(item.value)}>
                  <span className="grid h-6 w-6 place-items-center">{item.emoji ?? item.icon}</span>
                  <span>{item.label}</span>
                  {item.badge != null && item.badge > 0 && (
                    <span className="ml-auto text-xs text-subtle">{item.badge}</span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>
      <Dialog open={quickAddOpen} onOpenChange={setQuickAddOpen}>
        <DialogContent
          title="Add to pantry"
          className="bottom-0 top-auto max-h-[88vh] w-full max-w-none -translate-y-0 rounded-b-none px-4 pb-8 sm:bottom-auto sm:top-1/2 sm:w-[92vw] sm:max-w-3xl sm:-translate-y-1/2 sm:rounded-2xl sm:p-6"
        >
          <QuickAddPanel meta={meta} />
        </DialogContent>
      </Dialog>
      {meta && <CommandPalette meta={meta} onNavigate={setActive} onAddLowStock={() => addLowStock.mutate()} />}
    </div>
  );
}

export default App;

function MobileNavButton({
  label,
  icon,
  active,
  badge,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-bold transition-colors",
        active ? "bg-theme-100 text-theme-700 dark:bg-theme-900/40 dark:text-theme-300" : "text-subtle hover:text-content"
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
      {badge != null && badge > 0 && (
        <span className="absolute right-1 top-0 grid min-h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

/** Shows a banner when the browser is offline or when writes are queued waiting to sync. */
function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);
  const [pending, setPending] = useState(queueSize());

  useEffect(() => {
    const update = () => {
      setOffline(!navigator.onLine);
      setPending(queueSize());
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener(QUEUE_CHANGED_EVENT, update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener(QUEUE_CHANGED_EVENT, update);
    };
  }, []);

  if (!offline && pending === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 rounded-2xl border border-line bg-accent-200 px-4 py-2.5 text-sm font-bold text-content shadow-md print:hidden"
    >
      <CloudOff className="h-4 w-4 shrink-0" aria-hidden />
      {offline ? "You're offline — changes are saved and will sync when you reconnect." : "Back online — syncing your changes…"}
      {pending > 0 && (
        <span className="ml-auto rounded-full border border-line bg-surface-solid px-2 py-0.5 text-xs">
          {pending} pending
        </span>
      )}
    </div>
  );
}
