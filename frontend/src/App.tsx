import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Header } from "@/components/Header";
import { AddItemsTab } from "@/components/AddItemsTab";
import { CategoryView } from "@/components/CategoryView";
import { ShoppingListTab } from "@/components/ShoppingListTab";
import { ChartsTab } from "@/components/ChartsTab";
import { SettingsSidebar } from "@/components/SettingsSidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/Tabs";
import { Spinner } from "@/components/ui";

function App() {
  const { data: meta, isLoading } = useQuery({ queryKey: ["meta"], queryFn: api.meta });

  if (isLoading || !meta) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[260px_1fr] lg:px-8">
      <aside className="order-2 lg:order-1">
        <div className="lg:sticky lg:top-6">
          <SettingsSidebar />
        </div>
      </aside>

      <main className="order-1 space-y-6 lg:order-2">
        <Header meta={meta} />

        <Tabs defaultValue="add-items">
          <TabsList>
            <TabsTrigger value="add-items">➕ Add Items</TabsTrigger>
            {meta.categories.map((c) => (
              <TabsTrigger key={c} value={c}>
                {meta.icons[c]} {c}
              </TabsTrigger>
            ))}
            <TabsTrigger value="shopping">🛍️ Shopping List</TabsTrigger>
            <TabsTrigger value="charts">📊 Charts</TabsTrigger>
          </TabsList>

          <TabsContent value="add-items" className="pt-4">
            <AddItemsTab meta={meta} />
          </TabsContent>
          {meta.categories.map((c) => (
            <TabsContent key={c} value={c} className="pt-4">
              <CategoryView category={c} meta={meta} />
            </TabsContent>
          ))}
          <TabsContent value="shopping" className="pt-4">
            <ShoppingListTab meta={meta} />
          </TabsContent>
          <TabsContent value="charts" className="pt-4">
            <ChartsTab meta={meta} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

export default App;
