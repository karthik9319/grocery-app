import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { api } from "@/lib/api";
import type { Meta } from "@/types";
import { titleCase } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/Tabs";
import { Button, Card, Checkbox, Input, Select } from "@/components/ui";
import { TitleAutocomplete } from "@/components/TitleAutocomplete";

type DraftEntry = {
  id: string;
  file: File | null;
  previewUrl: string | null;
  title: string;
  category: string;
  quantity: number;
  unit: "count" | "g" | "kg";
  notes: string;
  useThreshold: boolean;
  threshold: number;
  trackExpiry: boolean;
  expiryDate: string;
};

function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function makeDraft(file: File | null, meta: Meta): DraftEntry {
  const category = meta.categories[0];
  const isWeight = meta.units[category] === "g";
  return {
    id: crypto.randomUUID(),
    file,
    previewUrl: file ? URL.createObjectURL(file) : null,
    title: "",
    category,
    quantity: isWeight ? 500 : 1,
    unit: isWeight ? "g" : "count",
    notes: "",
    useThreshold: false,
    threshold: 2,
    trackExpiry: false,
    expiryDate: todayPlus(14),
  };
}

export function AddItemsTab({ meta }: { meta: Meta }) {
  return (
    <Tabs defaultValue="photo">
      <TabsList>
        <TabsTrigger value="photo">📷 By Photo</TabsTrigger>
        <TabsTrigger value="receipt">🧾 By Receipt</TabsTrigger>
        <TabsTrigger value="csv">📄 By CSV</TabsTrigger>
      </TabsList>
      <TabsContent value="photo" className="pt-4">
        <PhotoAddPanel meta={meta} />
      </TabsContent>
      <TabsContent value="receipt" className="pt-4">
        <ReceiptScanPanel meta={meta} />
      </TabsContent>
      <TabsContent value="csv" className="pt-4">
        <CsvImportPanel />
      </TabsContent>
    </Tabs>
  );
}

function PhotoAddPanel({ meta }: { meta: Meta }) {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<DraftEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function handleFiles(files: FileList | null) {
    if (!files) return;
    setDrafts((prev) => [...prev, ...Array.from(files).map((f) => makeDraft(f, meta))]);
  }

  function addBlankDraft() {
    setDrafts((prev) => [...prev, makeDraft(null, meta)]);
  }

  function updateDraft(id: string, patch: Partial<DraftEntry>) {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  async function submitAll() {
    setSubmitting(true);
    let added = 0;
    let merged = 0;
    let skipped = 0;
    for (const draft of drafts) {
      if (!draft.title.trim()) {
        skipped++;
        continue;
      }
      const quantity = draft.unit === "kg" ? draft.quantity * 1000 : draft.quantity;
      try {
        const result = await api.createItem({
          title: titleCase(draft.title),
          category: draft.category,
          quantity,
          notes: draft.notes || undefined,
          custom_threshold: draft.useThreshold ? draft.threshold : null,
          expiration_date: draft.trackExpiry ? draft.expiryDate : null,
          image: draft.file,
        });
        if (result.status === "merged") merged++;
        else added++;
      } catch {
        skipped++;
      }
    }
    setSubmitting(false);
    setDrafts([]);
    queryClient.invalidateQueries({ queryKey: ["items"] });
    queryClient.invalidateQueries({ queryKey: ["summary"] });
    toast.success(`Added ${added}, merged ${merged}${skipped ? `, skipped ${skipped}` : ""}`, {
      icon: "✅",
    });
  }

  return (
    <div className="space-y-4">
      <Card className="border-dashed p-6 text-center">
        <label className="flex cursor-pointer flex-col items-center gap-2">
          <Upload className="h-8 w-8 text-theme-400" />
          <span className="font-medium text-content">
            Upload one or more photos of groceries/vegetables/household items
          </span>
          <span className="text-xs text-subtle">PNG, JPG, HEIC, HEIF - select multiple at once</span>
          <input
            type="file"
            multiple
            accept="image/png,image/jpeg,.heic,.heif"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </label>
      </Card>
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-line" />
        <span className="text-xs font-bold uppercase text-subtle">or</span>
        <div className="h-px flex-1 bg-line" />
      </div>
      <Button variant="outline" onClick={addBlankDraft} className="w-full sm:w-auto">
        + Add an item without a photo
      </Button>
      <p className="text-xs text-subtle">
        Tip: open this app on your iPhone's browser over the same Wi-Fi (see the terminal for the
        network URL) to upload straight from your phone's camera roll or camera. Skipping the
        photo? We'll try to find a matching picture for you automatically.
      </p>

      {drafts.map((draft) => (
        <Card key={draft.id} className="flex gap-4 p-4">
          {draft.previewUrl ? (
            <img src={draft.previewUrl} className="h-24 w-24 shrink-0 rounded-xl object-cover" />
          ) : (
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-content text-3xl">
              🔍
            </div>
          )}
          <div className="grid flex-1 gap-3 sm:grid-cols-2">
            <TitleAutocomplete
              placeholder="e.g. Apples, Milk, Shampoo"
              value={draft.title}
              onChange={(title) => updateDraft(draft.id, { title })}
              onBlur={() => updateDraft(draft.id, { title: titleCase(draft.title) })}
              onSelectSuggestion={(s) =>
                updateDraft(draft.id, {
                  title: s.title,
                  category: s.category,
                  unit: meta.units[s.category] === "g" ? "g" : "count",
                  quantity: meta.units[s.category] === "g" ? 500 : 1,
                })
              }
              onClassify={(category) =>
                updateDraft(draft.id, {
                  category,
                  unit: meta.units[category] === "g" ? "g" : "count",
                  quantity: meta.units[category] === "g" ? 500 : 1,
                })
              }
            />
            <Select
              value={draft.category}
              onValueChange={(category) =>
                updateDraft(draft.id, {
                  category,
                  unit: meta.units[category] === "g" ? "g" : "count",
                  quantity: meta.units[category] === "g" ? 500 : 1,
                })
              }
              options={meta.categories.map((c) => ({ value: c, label: `${meta.icons[c]} ${c}` }))}
            />
            {meta.units[draft.category] === "g" ? (
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={draft.quantity}
                  onChange={(e) => updateDraft(draft.id, { quantity: parseFloat(e.target.value) || 0 })}
                />
                <Select
                  value={draft.unit}
                  onValueChange={(unit) => updateDraft(draft.id, { unit: unit as "g" | "kg" })}
                  options={[
                    { value: "g", label: "g" },
                    { value: "kg", label: "kg" },
                  ]}
                  className="w-24"
                />
              </div>
            ) : (
              <Input
                type="number"
                value={draft.quantity}
                onChange={(e) => updateDraft(draft.id, { quantity: parseFloat(e.target.value) || 0 })}
              />
            )}
            <Input
              placeholder="Notes (optional)"
              value={draft.notes}
              onChange={(e) => updateDraft(draft.id, { notes: e.target.value })}
            />
            <label className="flex items-center gap-2 text-sm text-muted">
              <Checkbox
                checked={draft.useThreshold}
                onCheckedChange={(v) => updateDraft(draft.id, { useThreshold: v === true })}
              />
              Custom low-stock alert
            </label>
            {draft.useThreshold && (
              <Input
                type="number"
                value={draft.threshold}
                onChange={(e) => updateDraft(draft.id, { threshold: parseFloat(e.target.value) || 0 })}
              />
            )}
            <label className="flex items-center gap-2 text-sm text-muted">
              <Checkbox
                checked={draft.trackExpiry}
                onCheckedChange={(v) => updateDraft(draft.id, { trackExpiry: v === true })}
              />
              Track expiration
            </label>
            {draft.trackExpiry && (
              <Input
                type="date"
                value={draft.expiryDate}
                onChange={(e) => updateDraft(draft.id, { expiryDate: e.target.value })}
              />
            )}
          </div>
          <button
            onClick={() => setDrafts((prev) => prev.filter((d) => d.id !== draft.id))}
            className="self-start text-xs text-subtle hover:text-red-500 cursor-pointer"
          >
            Remove
          </button>
        </Card>
      ))}

      {drafts.length > 0 && (
        <Button onClick={submitAll} disabled={submitting} className="w-full sm:w-auto">
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {drafts.length === 1 ? "Add to Inventory" : `Add all ${drafts.length} items to Inventory`}
        </Button>
      )}
    </div>
  );
}

function ReceiptScanPanel({ meta }: { meta: Meta }) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [candidates, setCandidates] = useState<
    { title: string; category: string; quantity: number }[]
  >([]);

  async function scan() {
    if (!file) return;
    setScanning(true);
    try {
      const result = await api.scanReceipt(file);
      if (result.candidates.length === 0) {
        toast.warning("Couldn't detect any item lines on that receipt. Try a clearer photo.");
      }
      setCandidates(
        result.candidates.map((c) => ({
          title: titleCase(c.title),
          category: c.category,
          quantity: meta.units[c.category] === "g" ? 500 : 1,
        }))
      );
    } catch {
      toast.error("Could not read that file as an image.");
    } finally {
      setScanning(false);
    }
  }

  async function addAll() {
    let added = 0;
    let merged = 0;
    let skipped = 0;
    for (const c of candidates) {
      if (!c.title.trim()) {
        skipped++;
        continue;
      }
      const result = await api.createItem({
        title: titleCase(c.title),
        category: c.category,
        quantity: c.quantity,
      });
      if (result.status === "merged") merged++;
      else added++;
    }
    setCandidates([]);
    setFile(null);
    setPreviewUrl(null);
    queryClient.invalidateQueries({ queryKey: ["items"] });
    queryClient.invalidateQueries({ queryKey: ["summary"] });
    toast.success(`Receipt: added ${added}, merged ${merged}, skipped ${skipped}`, { icon: "🧾" });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Upload a photo of a receipt — text is read locally on your Mac (no cloud), then you
        review/edit each detected line before adding.
      </p>
      <Card className="border-dashed p-6 text-center">
        <label className="flex cursor-pointer flex-col items-center gap-2">
          <Camera className="h-8 w-8 text-theme-400" />
          <span className="font-medium text-content">Upload a receipt photo</span>
          <input
            type="file"
            accept="image/png,image/jpeg,.heic,.heif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              setPreviewUrl(f ? URL.createObjectURL(f) : null);
            }}
          />
        </label>
      </Card>

      {previewUrl && (
        <div className="flex items-center gap-3">
          <img src={previewUrl} className="h-32 rounded-xl object-cover" />
          <Button onClick={scan} disabled={scanning}>
            {scanning && <Loader2 className="h-4 w-4 animate-spin" />}
            🔍 Scan receipt
          </Button>
        </div>
      )}

      {candidates.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Found {candidates.length} candidate line(s) — review before adding (clear a title to
            skip that line):
          </p>
          {candidates.map((c, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_auto_auto] gap-2">
              <Input
                value={c.title}
                onChange={(e) =>
                  setCandidates((prev) =>
                    prev.map((p, i) => (i === idx ? { ...p, title: e.target.value } : p))
                  )
                }
                onBlur={() =>
                  setCandidates((prev) =>
                    prev.map((p, i) => (i === idx ? { ...p, title: titleCase(p.title) } : p))
                  )
                }
              />
              <Select
                value={c.category}
                onValueChange={(category) =>
                  setCandidates((prev) => prev.map((p, i) => (i === idx ? { ...p, category } : p)))
                }
                options={meta.categories.map((cat) => ({ value: cat, label: `${meta.icons[cat]} ${cat}` }))}
                className="w-40"
              />
              <Input
                type="number"
                value={c.quantity}
                onChange={(e) =>
                  setCandidates((prev) =>
                    prev.map((p, i) =>
                      i === idx ? { ...p, quantity: parseFloat(e.target.value) || 0 } : p
                    )
                  )
                }
                className="w-24"
              />
            </div>
          ))}
          <div className="flex gap-2">
            <Button onClick={addAll}>Add all {candidates.length} items</Button>
            <Button variant="outline" onClick={() => setCandidates([])}>
              Discard all
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function CsvImportPanel() {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [importing, setImporting] = useState(false);

  async function importCsv() {
    if (!file) return;
    setImporting(true);
    try {
      const { added, merged, skipped } = await api.importCsv(
        file,
        overwrite ? "overwrite" : "merge"
      );
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["charts"] });
      toast.success(
        `Imported: ${added} added, ${merged} merged${skipped ? `, ${skipped} skipped` : ""}`,
        { icon: "📄" }
      );
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch {
      toast.error("Could not import that file. Make sure it's a CSV with a 'title' column.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Restore or bulk-add items from a previously exported CSV (the same file you get from
        Settings → Export CSV). Rows are matched to existing items by title + category;
        everything else is inserted as a new item.
      </p>
      <Card className="border-dashed p-6 text-center">
        <label className="flex cursor-pointer flex-col items-center gap-2">
          <FileSpreadsheet className="h-8 w-8 text-brand-400" />
          <span className="font-medium text-content">
            {file ? file.name : "Choose a CSV file"}
          </span>
          <span className="text-xs text-subtle">
            Expected columns: title, category, quantity (unit, notes, expiration_date optional)
          </span>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
      </Card>

      <label className="flex items-start gap-2 text-sm text-muted">
        <Checkbox checked={overwrite} onCheckedChange={(v) => setOverwrite(v === true)} />
        <span>
          <span className="text-content">Overwrite quantities instead of adding</span>
          <br />
          For matching items, set the quantity to the CSV's value instead of adding to what's
          already there — use this to re-import the same backup without doubling counts.
        </span>
      </label>

      {file && (
        <Button onClick={importCsv} disabled={importing} className="w-full sm:w-auto">
          {importing && <Loader2 className="h-4 w-4 animate-spin" />}
          Import CSV
        </Button>
      )}
    </div>
  );
}
