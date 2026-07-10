export interface Item {
  id: number;
  uuid: string;
  title: string;
  category: string;
  quantity: number;
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
}

export interface Suggestion {
  title: string;
  category: string;
}

export interface Backup {
  filename: string;
  created_at: string;
  item_count: number;
}
