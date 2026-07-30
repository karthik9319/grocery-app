import { lazy, Suspense, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, FileSpreadsheet, Loader2, Mic, ScanBarcode, Sparkles, Upload, X } from "lucide-react";
import { api } from "@/lib/api";
import type { Meta, QuickAddItem } from "@/types";
import { compressImageFile, formatMoney, titleCase } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/Tabs";
import { Button, Card, Checkbox, Input, Select } from "@/components/ui";
import { TitleAutocomplete } from "@/components/TitleAutocomplete";

// The barcode scanner pulls in the ZXing library (~40KB+). Lazy-load it so that weight
// only lands on users who actually open the scanner, keeping the initial bundle lean.
const BarcodeScannerDialog = lazy(() =>
  import("@/components/BarcodeScannerDialog").then((m) => ({ default: m.BarcodeScannerDialog }))
);

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
        <TabsTrigger value="quick">⚡ Quick Add</TabsTrigger>
        <TabsTrigger value="receipt">🧾 By Receipt</TabsTrigger>
        <TabsTrigger value="csv">📄 By CSV</TabsTrigger>
      </TabsList>
      <TabsContent value="photo" className="pt-4">
        <PhotoAddPanel meta={meta} />
      </TabsContent>
      <TabsContent value="quick" className="pt-4">
        <QuickAddPanel meta={meta} />
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
  const [preparing, setPreparing] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    setPreparing(true);
    try {
      const compressed = await Promise.all(Array.from(files).map((f) => compressImageFile(f)));
      setDrafts((prev) => [...prev, ...compressed.map((f) => makeDraft(f, meta))]);
    } finally {
      setPreparing(false);
    }
  }

  function addBlankDraft() {
    setDrafts((prev) => [...prev, makeDraft(null, meta)]);
  }

  async function handleBarcode(code: string) {
    setScannerOpen(false);
    setLookingUp(true);
    try {
      const result = await api.lookupBarcode(code);
      const category = meta.categories.includes(result.category)
        ? result.category
        : meta.categories[0];
      const isWeight = meta.units[category] === "g";
      setDrafts((prev) => [
        ...prev,
        {
          ...makeDraft(null, meta),
          title: result.title ? titleCase(result.title) : "",
          category,
          unit: isWeight ? "g" : "count",
          quantity: isWeight ? 500 : 1,
          trackExpiry: !!result.expiration_date,
          expiryDate: result.expiration_date ?? todayPlus(14),
        },
      ]);
      if (result.found) {
        toast.success(`Found: ${result.title}`, { icon: "\uD83D\uDCE6" });
      } else {
        toast.warning(`Barcode ${code} not recognized \u2014 add the details manually.`);
      }
    } catch {
      toast.error("Couldn't look up that barcode.");
    } finally {
      setLookingUp(false);
    }
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
          {preparing && (
            <span className="flex items-center gap-2 text-xs font-semibold text-theme-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Preparing photo(s)…
            </span>
          )}
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
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="outline" onClick={addBlankDraft} className="w-full sm:w-auto">
          + Add an item without a photo
        </Button>
        <Button
          variant="outline"
          onClick={() => setScannerOpen(true)}
          disabled={lookingUp}
          className="w-full sm:w-auto"
        >
          {lookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanBarcode className="h-4 w-4" />}
          Scan barcode
        </Button>
      </div>
      <p className="text-xs text-subtle">
        Tip: skipping the photo? We'll try to find a matching picture for you automatically.
      </p>

      {scannerOpen && (
        <Suspense fallback={null}>
          <BarcodeScannerDialog
            open={scannerOpen}
            onOpenChange={setScannerOpen}
            onDetected={handleBarcode}
          />
        </Suspense>
      )}

      {drafts.map((draft) => (
        <Card key={draft.id} className="flex gap-4 p-4">
          {draft.previewUrl ? (
            <img src={draft.previewUrl} className="h-24 w-24 shrink-0 rounded-xl object-cover" />
          ) : (
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-line text-3xl">
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
        <div className="flex flex-col items-start gap-2 sm:items-center">
          <Button onClick={submitAll} disabled={submitting} className="w-full sm:w-auto">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {drafts.length === 1 ? "Add to Inventory" : `Add all ${drafts.length} items to Inventory`}
          </Button>
          {submitting && (
            <p className="text-xs text-subtle">
              Uploading… this can take a bit longer on a slow/remote connection.
            </p>
          )}
        </div>
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
    { title: string; category: string; quantity: number; price: number | null; expiration_date: string | null }[]
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
          quantity: c.quantity,
          price: c.price,
          expiration_date: c.expiration_date,
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
    let spent = 0;
    for (const c of candidates) {
      if (!c.title.trim()) {
        skipped++;
        continue;
      }
      const result = await api.createItem({
        title: titleCase(c.title),
        category: c.category,
        quantity: c.quantity,
        price: c.price,
        expiration_date: c.expiration_date,
      });
      if (c.price) spent += c.price;
      if (result.status === "merged") merged++;
      else added++;
    }
    setCandidates([]);
    setFile(null);
    setPreviewUrl(null);
    queryClient.invalidateQueries({ queryKey: ["items"] });
    queryClient.invalidateQueries({ queryKey: ["summary"] });
    queryClient.invalidateQueries({ queryKey: ["purchases"] });
    const spentNote = spent > 0 ? `, ${formatMoney(spent)} logged` : "";
    toast.success(`Receipt: added ${added}, merged ${merged}, skipped ${skipped}${spentNote}`, {
      icon: "🧾",
    });
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
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <img src={previewUrl} className="h-32 rounded-xl object-cover" />
            <Button onClick={scan} disabled={scanning}>
              {scanning && <Loader2 className="h-4 w-4 animate-spin" />}
              🔍 Scan receipt
            </Button>
          </div>
          {scanning && (
            <p className="text-xs text-subtle">
              Reading the receipt locally — this can take up to ~20 seconds for a full-size
              photo.
            </p>
          )}
        </div>
      )}

      {candidates.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Found {candidates.length} candidate line(s) — review before adding (clear a title to
            skip that line):
          </p>
          {candidates.map((c, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_auto_auto_auto] gap-2">
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
                className="w-36"
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
                className="w-20"
              />
              <div className="relative w-24">
                <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-subtle">
                  ₹
                </span>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="price"
                  value={c.price ?? ""}
                  onChange={(e) =>
                    setCandidates((prev) =>
                      prev.map((p, i) =>
                        i === idx
                          ? { ...p, price: e.target.value === "" ? null : parseFloat(e.target.value) }
                          : p
                      )
                    )
                  }
                  className="pl-5"
                />
              </div>
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

function QuickAddPanel({ meta }: { meta: Meta }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [listening, setListening] = useState(false);
  const [items, setItems] = useState<QuickAddItem[]>([]);
  const recognitionRef = useRef<any>(null);

  const speechSupported =
    typeof window !== "undefined" &&
    ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  async function parse(input: string) {
    const value = input.trim();
    if (!value) {
      setItems([]);
      return;
    }
    setParsing(true);
    try {
      const result = await api.quickAddParse(value);
      setItems(result.items);
      if (result.items.length === 0) {
        toast.warning('Couldn\'t parse any items. Try e.g. "2 milk, 3 eggs, 500g rice".');
      }
    } catch {
      toast.error("Couldn't parse that. Try again.");
    } finally {
      setParsing(false);
    }
  }

  function toggleMic() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Voice input isn't supported in this browser.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((r: any) => r[0].transcript)
        .join(" ");
      const next = text ? `${text}, ${transcript}` : transcript;
      setText(next);
      parse(next);
    };
    recognition.onerror = () => {
      toast.error("Couldn't hear that. Try again or type it in.");
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  async function addAll() {
    setAdding(true);
    let added = 0;
    let merged = 0;
    for (const it of items) {
      if (!it.title.trim()) continue;
      try {
        const result = await api.createItem({
          title: titleCase(it.title),
          category: it.category,
          quantity: it.quantity,
        });
        if (result.status === "merged") merged++;
        else added++;
      } catch {
        // skip failures, keep going
      }
    }
    setAdding(false);
    setItems([]);
    setText("");
    queryClient.invalidateQueries({ queryKey: ["items"] });
    queryClient.invalidateQueries({ queryKey: ["summary"] });
    toast.success(`Quick add: added ${added}, merged ${merged}`, { icon: "⚡" });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Type or speak what you bought in plain language — e.g.{" "}
        <span className="font-semibold text-content">"2 milk, 3 eggs and 500g rice"</span> — and
        we'll split it into items with categories for you to review.
      </p>

      <div className="flex gap-2">
        <Input
          placeholder='e.g. "2 milk, a dozen eggs, shampoo"'
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") parse(text);
          }}
          className="flex-1"
        />
        {speechSupported && (
          <Button
            type="button"
            variant={listening ? "danger" : "outline"}
            onClick={toggleMic}
            title="Speak your items"
          >
            <Mic className={listening ? "h-4 w-4 animate-pulse" : "h-4 w-4"} />
            {listening ? "Listening…" : "Speak"}
          </Button>
        )}
        <Button onClick={() => parse(text)} disabled={parsing || !text.trim()}>
          {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Parse
        </Button>
      </div>

      {items.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted">Review before adding:</p>
          {items.map((it, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2">
              <Input
                value={it.title}
                onChange={(e) =>
                  setItems((prev) => prev.map((p, i) => (i === idx ? { ...p, title: e.target.value } : p)))
                }
              />
              <Select
                value={it.category}
                onValueChange={(category) =>
                  setItems((prev) => prev.map((p, i) => (i === idx ? { ...p, category } : p)))
                }
                options={meta.categories.map((cat) => ({ value: cat, label: `${meta.icons[cat]} ${cat}` }))}
                className="w-36"
              />
              <Input
                type="number"
                value={it.quantity}
                onChange={(e) =>
                  setItems((prev) =>
                    prev.map((p, i) => (i === idx ? { ...p, quantity: parseFloat(e.target.value) || 0 } : p))
                  )
                }
                className="w-20"
              />
              <button
                onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                className="rounded-lg p-1 text-subtle hover:bg-red-500/10 hover:text-red-500 cursor-pointer"
                title="Remove"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <Button onClick={addAll} disabled={adding}>
              {adding && <Loader2 className="h-4 w-4 animate-spin" />}
              Add all {items.length} items
            </Button>
            <Button variant="outline" onClick={() => setItems([])}>
              Clear
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
        Restore or bulk-add items from a previously exported CSV. This will automatically detect
        meal-plan, favorites, shopping-list, or inventory CSVs and import them into the right
        place. For inventory CSVs, rows are matched to existing items by title + category;
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
