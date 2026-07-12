import axios from "axios";
import type {
  Backup,
  Favorite,
  Item,
  ItemAlias,
  ItemPhoto,
  MealPlanEntry,
  MealSlot,
  Meta,
  ReceiptCandidate,
  Settings,
  ShoppingListItem,
  Suggestion,
  Summary,
  TunnelStatus,
} from "@/types";

// A stalled mobile connection (e.g. through a Cloudflare Tunnel on a flaky 5G signal)
// can leave a request hanging with no response and no error - since axios has no
// timeout by default, that means it never rejects, so TanStack Query's automatic retry
// never even triggers (it only retries on an actual rejection). A bounded timeout turns
// a silent infinite hang into a real error that gets retried automatically instead.
const client = axios.create({ baseURL: "/api", timeout: 30000 });

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

  suggestTitles: (q: string) =>
    client.get<Suggestion[]>("/suggestions", { params: { q } }).then((r) => r.data),

  classifyTitle: (title: string) =>
    client.get<{ category: string }>("/classify", { params: { title } }).then((r) => r.data),

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
    return client.post("/items", form, { timeout: 90000 }).then((r) => r.data);
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
    return client.put(`/items/${id}`, form, { timeout: 90000 }).then((r) => r.data);
  },

  patchQuantity: (id: number, quantity: number) => {
    const form = new FormData();
    form.append("quantity", String(quantity));
    return client.patch(`/items/${id}/quantity`, form).then((r) => r.data);
  },

  deleteItem: (id: number) => client.delete<Item>(`/items/${id}`).then((r) => r.data),

  clearItems: (category?: string) =>
    client
      .delete<{ deleted: number }>("/items/clear", { params: category ? { category } : {} })
      .then((r) => r.data),

  listBackups: () => client.get<Backup[]>("/backups").then((r) => r.data),
  restoreBackup: (filename: string) =>
    client
      .post<{ added: number; merged: number; skipped: number }>(
        `/backups/${encodeURIComponent(filename)}/restore`
      )
      .then((r) => r.data),
  backupDownloadUrl: (filename: string) => `/api/backups/${encodeURIComponent(filename)}/download`,

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

  mealPlan: (start: string, end: string) =>
    client.get<MealPlanEntry[]>("/meal-plan", { params: { start, end } }).then((r) => r.data),
  addMealPlanEntry: (date: string, mealSlot: MealSlot, title: string, notes?: string) => {
    const form = new FormData();
    form.append("date", date);
    form.append("meal_slot", mealSlot);
    form.append("title", title);
    if (notes) form.append("notes", notes);
    return client.post<{ id: number; status: string }>("/meal-plan", form).then((r) => r.data);
  },
  updateMealPlanEntry: (
    id: number,
    date: string,
    mealSlot: MealSlot,
    title: string,
    notes?: string
  ) => {
    const form = new FormData();
    form.append("date", date);
    form.append("meal_slot", mealSlot);
    form.append("title", title);
    if (notes) form.append("notes", notes);
    return client.put(`/meal-plan/${id}`, form).then((r) => r.data);
  },
  deleteMealPlanEntry: (id: number) => client.delete(`/meal-plan/${id}`).then((r) => r.data),

  scanReceipt: (image: File) => {
    const form = new FormData();
    form.append("image", image);
    return client
      .post<{ candidates: ReceiptCandidate[] }>("/receipt/scan", form, { timeout: 90000 })
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

  itemAliases: (itemId: number) =>
    client.get<ItemAlias[]>(`/items/${itemId}/aliases`).then((r) => r.data),
  addItemAlias: (itemId: number, alias: string) => {
    const form = new FormData();
    form.append("alias", alias);
    return client.post<ItemAlias>(`/items/${itemId}/aliases`, form).then((r) => r.data);
  },
  removeItemAlias: (itemId: number, aliasId: number) =>
    client.delete(`/items/${itemId}/aliases/${aliasId}`).then((r) => r.data),

  itemPhotos: (itemId: number) =>
    client.get<ItemPhoto[]>(`/items/${itemId}/photos`).then((r) => r.data),
  addItemPhoto: (itemId: number, file: File) => {
    const form = new FormData();
    form.append("image", file);
    return client.post<ItemPhoto>(`/items/${itemId}/photos`, form, { timeout: 90000 }).then((r) => r.data);
  },
  setItemPhotoCover: (itemId: number, photoId: number) =>
    client.post(`/items/${itemId}/photos/${photoId}/cover`).then((r) => r.data),
  deleteItemPhoto: (itemId: number, photoId: number) =>
    client.delete(`/items/${itemId}/photos/${photoId}`).then((r) => r.data),

  exportCsvUrl: () => "/api/export/csv",
  exportFavoritesCsvUrl: () => "/api/export/favorites/csv",
  exportShoppingListCsvUrl: () => "/api/export/shopping-list/csv",
  exportMealPlanCsvUrl: () => "/api/export/meal-plan/csv",
  exportAllUrl: () => "/api/export/all",
  importAll: (file: File, mode: "merge" | "overwrite" = "merge") => {
    const form = new FormData();
    form.append("file", file);
    form.append("mode", mode);
    return client
      .post<Record<string, Record<string, number>>>("/import/all", form)
      .then((r) => r.data);
  },

  findDuplicates: () => client.get<Item[][]>("/duplicates").then((r) => r.data),
  mergeDuplicates: (keepId: number, mergeIds: number[]) =>
    client
      .post<{ status: string; kept_id: number; quantity: number }>("/duplicates/merge", {
        keep_id: keepId,
        merge_ids: mergeIds,
      })
      .then((r) => r.data),
  importCsv: (file: File, mode: "merge" | "overwrite" = "merge") => {
    const form = new FormData();
    form.append("file", file);
    form.append("mode", mode);
    return client
      .post<{ added: number; merged: number; skipped: number }>("/import/csv", form)
      .then((r) => r.data);
  },

  tunnelStatus: () => client.get<TunnelStatus>("/tunnel/status").then((r) => r.data),
  startTunnel: () => client.post<TunnelStatus>("/tunnel/start").then((r) => r.data),
  stopTunnel: () => client.post<TunnelStatus>("/tunnel/stop").then((r) => r.data),
};
