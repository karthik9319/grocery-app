import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

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

