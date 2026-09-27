import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Item, ItemUnit, Meta, Settings, ShoppingListItem } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatQuantity(quantity: number, unit: ItemUnit | string): string {
  if (unit === "g") {
    if (quantity >= 1000) {
      const kg = quantity / 1000;
      return `${Number(kg.toFixed(2))} kg`;
    }
    return `${Number(quantity.toFixed(2))} g`;
  }
  if (unit === "kg") return `${Number(quantity.toFixed(2))} kg`;
  if (unit === "ml") {
    if (quantity >= 1000) return `${Number((quantity / 1000).toFixed(2))} L`;
    return `${Number(quantity.toFixed(2))} ml`;
  }
  if (unit === "l") return `${Number(quantity.toFixed(2))} L`;
  return Number.isInteger(quantity) ? String(quantity) : String(quantity);
}

export function unitStep(unit: ItemUnit): number {
  if (unit === "g" || unit === "ml") return 50;
  if (unit === "kg" || unit === "l") return 0.1;
  return 1;
}

export function convertItemQuantity(quantity: number, from: ItemUnit, to: ItemUnit): number {
  const families: Record<ItemUnit, string> = {
    count: "count",
    g: "mass",
    kg: "mass",
    ml: "volume",
    l: "volume",
  };
  const factors: Record<ItemUnit, number> = { count: 1, g: 1, kg: 1000, ml: 1, l: 1000 };
  if (families[from] !== families[to]) return quantity;
  return Number(((quantity * factors[from]) / factors[to]).toFixed(3));
}

export function thresholdForItem(item: Item, settings?: Settings): number {
  if (item.custom_threshold != null) return item.custom_threshold;
  if (item.unit === "g") return settings?.weight_threshold ?? 200;
  if (item.unit === "kg") return (settings?.weight_threshold ?? 200) / 1000;
  if (item.unit === "ml") return settings?.volume_threshold ?? 200;
  if (item.unit === "l") return (settings?.volume_threshold ?? 200) / 1000;
  return settings?.count_threshold ?? 2;
}

export const ITEM_UNIT_OPTIONS: { value: ItemUnit; label: string }[] = [
  { value: "count", label: "count" },
  { value: "g", label: "g" },
  { value: "kg", label: "kg" },
  { value: "ml", label: "ml" },
  { value: "l", label: "L" },
];

const moneyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

/** Format a number as Indian Rupees, e.g. 1234.5 -> "₹1,234.50". */
export function formatMoney(amount: number): string {
  return moneyFormatter.format(amount || 0);
}

export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = target.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export function imageUrl(path: string | null): string | null {
  if (!path) return null;
  return `/images/${path.split("/").pop()}`;
}

/** Downscales + re-encodes a photo as JPEG before upload (e.g. a full-size iPhone HEIC
 * photo can be 5-15MB - over a slow/remote connection like a Cloudflare Tunnel on
 * cellular, that can take a long time with no visible progress, which looks "hung").
 * Skips small files. Falls back to the original file untouched if decoding fails (e.g.
 * a browser that can't decode HEIC) - the backend already handles HEIC/any image size
 * fine, this is purely an upload-speed optimization, never a hard requirement. */
export async function compressImageFile(
  file: File,
  maxDimension = 1600,
  quality = 0.82
): Promise<File> {
  if (file.size < 400 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const targetW = Math.round(bitmap.width * scale);
    const targetH = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
    if (!blob || blob.size >= file.size) return file;
    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/** Cleans up a user-typed item name: trims, collapses extra spaces, and title-cases
 * each word (e.g. "  apples " -> "Apples", "OLIVE oil" -> "Olive Oil"). */
export function titleCase(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) =>
      word
        .split("-")
        .map((part) => (part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : part))
        .join("-")
    )
    .join(" ");
}

export const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name-asc", label: "Name (A-Z)" },
  { value: "name-desc", label: "Name (Z-A)" },
  { value: "qty-desc", label: "Quantity (high to low)" },
  { value: "qty-asc", label: "Quantity (low to high)" },
  { value: "expiring", label: "Expiring soonest" },
];

/** Share text via the Web Share API where available (lets the user pick WhatsApp among
 * other apps, mainly on mobile), falling back to a wa.me link that opens WhatsApp
 * directly with the text pre-filled. Silently does nothing if the user cancels a native
 * share sheet - that's not a failure to recover from. */
export async function shareText(text: string): Promise<void> {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
}

/** Format the still-to-buy shopping list items as a plain-text message, e.g. for
 * sharing to WhatsApp before a store trip. Already-checked items are left out - they're
 * already bought, so there's nothing left to ask someone else to pick up. */
export function formatShoppingListForShare(items: ShoppingListItem[], meta: Meta): string {
  const unchecked = items.filter((i) => !i.checked);
  const lines: string[] = [
    `🛍️ Shopping List (${unchecked.length} item${unchecked.length === 1 ? "" : "s"})`,
    "",
  ];
  if (unchecked.length === 0) {
    lines.push("Nothing left on the list right now.");
  } else {
    const stores = new Map<string, ShoppingListItem[]>();
    for (const item of unchecked) {
      const store = item.store?.trim() || "Any store";
      stores.set(store, [...(stores.get(store) ?? []), item]);
    }
    for (const [store, storeItems] of stores) {
      lines.push(`🏪 ${store}`);
      for (const item of storeItems) {
        const icon = item.category ? meta.icons[item.category] ?? "•" : "•";
        const qty = item.unit === "count" && item.quantity === 1
          ? ""
          : ` · ${formatQuantity(item.quantity, item.unit)}`;
        const aisle = item.aisle ? ` · ${item.aisle}` : "";
        const price = item.unit_price != null
          ? ` · ${formatMoney(item.quantity * item.unit_price)}`
          : "";
        lines.push(`${icon} ${item.title}${qty}${aisle}${price}`);
        if (item.substitution) lines.push(`   ↳ Substitute: ${item.substitution}`);
      }
      lines.push("");
    }
  }
  lines.push("", "Sent from Grocery Tracker");
  return lines.join("\n");
}

export function sortItems(items: Item[], sort: string): Item[] {
  const copy = [...items];
  switch (sort) {
    case "newest":
      return copy.sort((a, b) => b.created_at.localeCompare(a.created_at));
    case "oldest":
      return copy.sort((a, b) => a.created_at.localeCompare(b.created_at));
    case "name-asc":
      return copy.sort((a, b) => a.title.localeCompare(b.title));
    case "name-desc":
      return copy.sort((a, b) => b.title.localeCompare(a.title));
    case "qty-desc":
      return copy.sort((a, b) => b.quantity - a.quantity);
    case "qty-asc":
      return copy.sort((a, b) => a.quantity - b.quantity);
    case "expiring":
      return copy.sort((a, b) =>
        (a.expiration_date ?? "9999-99-99").localeCompare(b.expiration_date ?? "9999-99-99")
      );
    default:
      return copy;
  }
}
