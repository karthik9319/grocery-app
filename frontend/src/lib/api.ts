import axios from "axios";
import type {
  Favorite,
  Item,
  Meta,
  ReceiptCandidate,
  Settings,
  ShoppingListItem,
  Summary,
} from "@/types";

const client = axios.create({ baseURL: "/api" });

export const api = {
  meta: () => client.get<Meta>("/meta").then((r) => r.data),

  settings: () => client.get<Settings>("/settings").then((r) => r.data),
  updateSettings: (settings: Settings) => {
    const form = new FormData();
    form.append("count_threshold", String(settings.count_threshold));
    form.append("weight_threshold", String(settings.weight_threshold));
    return client.put<Settings>("/settings", form).then((r) => r.data);
  },

  summary: () => client.get<Summary>("/summary").then((r) => r.data),

  items: (category?: string) =>
    client
      .get<Item[]>("/items", { params: category ? { category } : {} })
      .then((r) => r.data),

  createItem: (data: {
    title: string;
    category: string;
    quantity: number;
    notes?: string;
    custom_threshold?: number | null;
    expiration_date?: string | null;
    image?: File | null;
  }) => {
    const form = new FormData();
    form.append("title", data.title);
    form.append("category", data.category);
    form.append("quantity", String(data.quantity));
    if (data.notes) form.append("notes", data.notes);
    if (data.custom_threshold != null)
      form.append("custom_threshold", String(data.custom_threshold));
    if (data.expiration_date) form.append("expiration_date", data.expiration_date);
    if (data.image) form.append("image", data.image);
    return client.post("/items", form).then((r) => r.data);
  },

  updateItem: (
    id: number,
    data: {
      title: string;
      category: string;
      quantity: number;
      notes?: string;
      custom_threshold?: number | null;
      expiration_date?: string | null;
      image?: File | null;
    }
  ) => {
    const form = new FormData();
    form.append("title", data.title);
    form.append("category", data.category);
    form.append("quantity", String(data.quantity));
    if (data.notes) form.append("notes", data.notes);
    if (data.custom_threshold != null)
      form.append("custom_threshold", String(data.custom_threshold));
    if (data.expiration_date) form.append("expiration_date", data.expiration_date);
    if (data.image) form.append("image", data.image);
    return client.put(`/items/${id}`, form).then((r) => r.data);
  },

  patchQuantity: (id: number, quantity: number) => {
    const form = new FormData();
    form.append("quantity", String(quantity));
    return client.patch(`/items/${id}/quantity`, form).then((r) => r.data);
  },

  deleteItem: (id: number) => client.delete<Item>(`/items/${id}`).then((r) => r.data),

  restoreItem: (item: Item) => client.post("/items/restore", item).then((r) => r.data),

  favorites: () => client.get<Favorite[]>("/favorites").then((r) => r.data),
  addFavorite: (title: string, category: string, default_quantity: number) => {
    const form = new FormData();
    form.append("title", title);
    form.append("category", category);
    form.append("default_quantity", String(default_quantity));
    return client.post("/favorites", form).then((r) => r.data);
  },
  removeFavorite: (title: string, category: string) =>
    client.delete("/favorites", { params: { title, category } }).then((r) => r.data),
  quickAddFavorite: (id: number) =>
    client.post(`/favorites/${id}/quick-add`).then((r) => r.data),

  shoppingList: () => client.get<ShoppingListItem[]>("/shopping-list").then((r) => r.data),
  addShoppingItem: (title: string, category?: string) => {
    const form = new FormData();
    form.append("title", title);
    if (category) form.append("category", category);
    return client.post("/shopping-list", form).then((r) => r.data);
  },
  patchShoppingItem: (id: number, checked: boolean) => {
    const form = new FormData();
    form.append("checked", String(checked));
    return client.patch(`/shopping-list/${id}`, form).then((r) => r.data);
  },
  deleteShoppingItem: (id: number) =>
    client.delete(`/shopping-list/${id}`).then((r) => r.data),
  addLowStockToShoppingList: () =>
    client.post<{ added: number }>("/shopping-list/add-low-stock").then((r) => r.data),
  clearCheckedShoppingItems: () =>
    client.post("/shopping-list/clear-checked").then((r) => r.data),

  scanReceipt: (image: File) => {
    const form = new FormData();
    form.append("image", image);
    return client
      .post<{ candidates: ReceiptCandidate[] }>("/receipt/scan", form)
      .then((r) => r.data);
  },

  chartCategoryCounts: () =>
    client.get<Record<string, number>>("/charts/category-counts").then((r) => r.data),
  chartStockByItem: (category: string) =>
    client
      .get<{ title: string; quantity: number }[]>("/charts/stock-by-item", {
        params: { category },
      })
      .then((r) => r.data),
  chartAddedOverTime: (category: string) =>
    client
      .get<{ date: string; quantity: number }[]>("/charts/added-over-time", {
        params: { category },
      })
      .then((r) => r.data),

  exportCsvUrl: () => "/api/export/csv",
  importCsv: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return client
      .post<{ added: number; merged: number; skipped: number }>("/import/csv", form)
      .then((r) => r.data);
  },
};
