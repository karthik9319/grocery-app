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

