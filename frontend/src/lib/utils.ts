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
