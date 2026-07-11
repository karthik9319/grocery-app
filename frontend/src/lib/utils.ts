import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Item } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatQuantity(quantity: number, unit: string): string {
  if (unit === "g") {
    if (quantity >= 1000) {
      const kg = quantity / 1000;
      return `${Number(kg.toFixed(2))} kg`;
    }
    return `${Number(quantity.toFixed(2))} g`;
  }
  return Number.isInteger(quantity) ? String(quantity) : String(quantity);
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

