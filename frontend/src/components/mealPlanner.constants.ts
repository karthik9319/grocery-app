import { format } from "date-fns";
import type { MealPlanEntry, MealSlot } from "@/types";

export const MEAL_SLOTS: { value: MealSlot; label: string; icon: string }[] = [
  // Order of slots displayed in the planner
  { value: "breakfast", label: "Breakfast", icon: "🍳" },
  { value: "lunch", label: "Lunch", icon: "🥪" },
  { value: "snack", label: "Snack", icon: "🍎" },
  { value: "dinner", label: "Dinner", icon: "🍝" },
  // Extra slot for dessert or any other optional meal
  { value: "extra", label: "Extra", icon: "🍰" },
];

export const DATE_FMT = "yyyy-MM-dd";

export type EditingState = {
  date: string;
  slot: MealSlot;
  entry?: MealPlanEntry;
};

/** Format a week's meal plan as a plain-text message, e.g. for sharing to WhatsApp. */
export function formatMealPlanForShare(
  days: Date[],
  byDaySlot: Map<string, MealPlanEntry[]>,
  weekStart: Date
): string {
  const lines: string[] = [
    "🍽️ This Week's Meal Plan",
    `${format(weekStart, "MMM d")} – ${format(days[6], "MMM d")}`,
    "",
  ];
  for (const day of days) {
    const dateStr = format(day, DATE_FMT);
    lines.push(format(day, "EEE d"));
    let any = false;
    for (const slot of MEAL_SLOTS) {
      const entries = byDaySlot.get(`${dateStr}|${slot.value}`) ?? [];
      if (entries.length) {
        any = true;
        lines.push(`${slot.icon} ${entries.map((e) => e.title).join(", ")}`);
      }
    }
    if (!any) lines.push("— nothing planned yet —");
    lines.push("");
  }
  lines.push("Sent from Grocery Tracker");
  return lines.join("\n");
}

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
