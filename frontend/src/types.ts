export type ItemUnit = "count" | "g" | "kg" | "ml" | "l";

export interface Item {
  id: number;
  uuid: string;
  title: string;
  category: string;
  quantity: number;
  unit: ItemUnit;
  in_use_quantity: number;
  image_path: string | null;
  notes: string | null;
  custom_threshold: number | null;
  expiration_date: string | null;
  storage_location: string | null;
  created_at: string;
}

export interface Meta {
  categories: string[];
  icons: Record<string, string>;
  units: Record<string, ItemUnit>;
  item_units: ItemUnit[];
  palette: Record<string, string>;
  storage_locations: string[];
  storage_location_icons: Record<string, string>;
}

export interface Settings {
  count_threshold: number;
  weight_threshold: number;
  volume_threshold: number;
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
  unit: ItemUnit;
  created_at: string;
}

export interface ShoppingListItem {
  id: number;
  title: string;
  category: string | null;
  quantity: number;
  unit: ItemUnit;
  store: string | null;
  aisle: string | null;
  unit_price: number | null;
  substitution: string | null;
  checked: boolean;
  created_at: string;
}

export interface ReceiptCandidate {
  title: string;
  category: string;
  quantity: number;
  unit: ItemUnit;
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
  unit: ItemUnit;
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

export interface SnapshotCounts {
  items: number;
  shopping_items: number;
  meals: number;
  purchases: number;
  trips: number;
}

export interface AppSnapshot {
  filename: string;
  created_at: string;
  reason: "daily" | "manual" | "before-restore" | string;
  counts: SnapshotCounts;
  size_bytes: number;
}

export interface BackupStatus {
  storage: "local";
  saved_at: string | null;
  last_backup_at: string | null;
  snapshot_count: number;
}

export interface SnapshotPreview {
  snapshot: AppSnapshot;
  current_counts: SnapshotCounts;
}

export interface ShoppingTripItem {
  id: number;
  trip_id: number;
  title: string;
  category: string | null;
  quantity: number;
  unit: ItemUnit;
  store: string | null;
  aisle: string | null;
  unit_price: number | null;
  substitution: string | null;
}

export interface ShoppingTrip {
  id: number;
  store: string | null;
  total_spend: number;
  completed_at: string;
  items: ShoppingTripItem[];
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

export interface StorageLocation {
  id: number;
  name: string;
  icon: string;
  created_at: string;
}

export interface MealHistoryEntry {
  meal_slot: MealSlot;
  title: string;
  times_used: number;
  last_used: string;
}

export interface SearchResults {
  items: Item[];
  shopping_list: ShoppingListItem[];
  meal_plan: MealPlanEntry[];
}
