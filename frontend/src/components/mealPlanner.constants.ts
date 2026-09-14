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
