import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui";

export function ExportImportSection() {
  const queryClient = useQueryClient();
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

  return (
    <>
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
    </>
  );
}
