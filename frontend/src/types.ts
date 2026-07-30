export interface Item {
  id: number;
  uuid: string;
  title: string;
  category: string;
  quantity: number;
  in_use_quantity: number;
  image_path: string | null;
  notes: string | null;
  custom_threshold: number | null;
  expiration_date: string | null;
  created_at: string;
}

export interface Meta {
  categories: string[];
  icons: Record<string, string>;
  units: Record<string, "count" | "g">;
  palette: Record<string, string>;
}

export interface Settings {
  count_threshold: number;
  weight_threshold: number;
}

export interface TunnelStatus {
  running: boolean;
  url: string | null;
  error: string | null;
}

export interface ExpiringEntry {
  item: Item;
  days_left: number;
}

export interface Summary {
  total_rows: number;
  category_totals: Record<string, number>;
  low_stock_items: Item[];
  expiring_items: ExpiringEntry[];
}

export interface Favorite {
  id: number;
  title: string;
  category: string;
  default_quantity: number;
  created_at: string;
}

export interface ShoppingListItem {
  id: number;
  title: string;
  category: string | null;
  checked: boolean;
  created_at: string;
}

export interface ReceiptCandidate {
  title: string;
  category: string;
  quantity: number;
  price: number | null;
  expiration_date: string | null;
}

export interface UsageEvent {
  id: number;
  item_id: number | null;
  title: string;
  category: string | null;
  event_type: string;
  amount: number;
  quantity_after: number | null;
  created_at: string;
}

export interface Prediction {
  item: Item;
  days_left: number;
  rate_per_day: number;
}

export interface Purchase {
  id: number;
  title: string;
  category: string | null;
  quantity: number;
  total_price: number;
  source: string | null;
  purchased_at: string;
}

export interface SpendSummary {
  total_spend: number;
  spend_over_time: { month: string; total: number }[];
  spend_by_item: { title: string; total: number; quantity: number }[];
}

export interface QuickAddItem {
  title: string;
  quantity: number;
  category: string;
}

export interface Suggestion {
  title: string;
  category: string;
}

export interface ItemAlias {
  id: number;
  item_id: number;
  alias: string;
  created_at: string;
}

export interface ItemPhoto {
  id: number;
  item_id: number;
  image_path: string;
  created_at: string;
}

export interface Backup {
  filename: string;
  created_at: string;
  item_count: number;
}

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack" | "extra";

export interface MealPlanEntry {
  id: number;
  date: string;
  meal_slot: MealSlot;
  title: string;
  notes: string | null;
  done: boolean;
  created_at: string;
}

export interface SearchResults {
  items: Item[];
  shopping_list: ShoppingListItem[];
  meal_plan: MealPlanEntry[];
}
