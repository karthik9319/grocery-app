"""FastAPI backend for the Grocery & Vegetable Tracker.

Reuses inventory.py (SQLite CRUD) and receipt.py (OCR) unchanged - this API is just a
thin HTTP layer over the same business logic used by the Streamlit app (app.py), so
both frontends share the same data/inventory.db and data/images/.
"""
import csv
import io
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, UnidentifiedImageError
from pillow_heif import register_heif_opener

import inventory
import receipt
import classifier
import image_search

register_heif_opener()

BASE_DIR = Path(__file__).parent
IMAGES_DIR = BASE_DIR / "data" / "images"
IMAGES_DIR.mkdir(parents=True, exist_ok=True)
BACKUPS_DIR = BASE_DIR / "data" / "backups"
BACKUPS_DIR.mkdir(parents=True, exist_ok=True)
MAX_BACKUPS = 30

inventory.init_db()

app = FastAPI(title="Grocery & Vegetable Tracker API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/images", StaticFiles(directory=str(IMAGES_DIR)), name="images")

# --- Static reference data (mirrors app.py's constants) ---
CATEGORY_ICONS = {"Groceries": "🧺", "Vegetables": "🥕", "Household": "🧴", "Snacks": "🍿"}
CATEGORIES = list(CATEGORY_ICONS.keys())
PALETTE = {"Groceries": "#1B7A4D", "Vegetables": "#FF8C42", "Household": "#6C63FF", "Snacks": "#C2185B"}
CATEGORY_UNITS = {"Groceries": "count", "Vegetables": "g", "Household": "count", "Snacks": "count"}

COMMON_ITEMS = {
    "tomato": ("Vegetables", 5), "potato": ("Vegetables", 21), "onion": ("Vegetables", 30),
    "carrot": ("Vegetables", 21), "broccoli": ("Vegetables", 7), "cucumber": ("Vegetables", 7),
    "cabbage": ("Vegetables", 14), "spinach": ("Vegetables", 4), "lettuce": ("Vegetables", 7),
    "pepper": ("Vegetables", 7), "garlic": ("Vegetables", 60), "ginger": ("Vegetables", 21),
    "cauliflower": ("Vegetables", 7), "eggplant": ("Vegetables", 7), "zucchini": ("Vegetables", 7),
    "corn": ("Vegetables", 3), "peas": ("Vegetables", 5), "beans": ("Vegetables", 5),
    "mushroom": ("Vegetables", 5), "pumpkin": ("Vegetables", 30), "beet": ("Vegetables", 21),
    "radish": ("Vegetables", 14), "celery": ("Vegetables", 14), "kale": ("Vegetables", 5),
    "milk": ("Groceries", 7), "bread": ("Groceries", 5), "egg": ("Groceries", 21),
    "cheese": ("Groceries", 21), "butter": ("Groceries", 60), "yogurt": ("Groceries", 14),
    "rice": ("Groceries", 365), "pasta": ("Groceries", 365), "atta": ("Groceries", 180),
    "cereal": ("Groceries", 180), "coffee": ("Groceries", 180), "tea": ("Groceries", 365),
    "sugar": ("Groceries", 365), "flour": ("Groceries", 180), "chicken": ("Groceries", 2),
    "beef": ("Groceries", 3), "fish": ("Groceries", 2), "apple": ("Groceries", 21),
    "banana": ("Groceries", 5), "orange": ("Groceries", 14), "juice": ("Groceries", 7),
    "shampoo": ("Household", None), "soap": ("Household", None), "detergent": ("Household", None),
    "toothpaste": ("Household", None), "tissue": ("Household", None),
    "toothbrush": ("Household", None), "conditioner": ("Household", None),
    "dish soap": ("Household", None), "sponge": ("Household", None), "mop": ("Household", None),
    "broom": ("Household", None), "trash bag": ("Household", None), "garbage bag": ("Household", None),
    "paper towel": ("Household", None), "napkin": ("Household", None), "deodorant": ("Household", None),
    "razor": ("Household", None), "sanitizer": ("Household", None), "bleach": ("Household", None),
    "fabric softener": ("Household", None), "air freshener": ("Household", None),
    "light bulb": ("Household", None), "battery": ("Household", None), "batteries": ("Household", None),
    "toilet paper": ("Household", None), "dishwasher": ("Household", None),
    "chips": ("Snacks", 90), "popcorn": ("Snacks", 180), "cookie": ("Snacks", 60),
    "cookies": ("Snacks", 60), "chocolate": ("Snacks", 180), "candy": ("Snacks", 270),
    "cracker": ("Snacks", 120), "crackers": ("Snacks", 120), "pretzel": ("Snacks", 120),
    "granola bar": ("Snacks", 180), "nuts": ("Snacks", 180), "biscuit": ("Snacks", 90),
    "biscuits": ("Snacks", 90),
}


def guess_category(title: str) -> str:
    """Hybrid category guesser: try the fast/precise COMMON_ITEMS keyword match first,
    then fall back to the local ML text classifier (trained on COMMON_ITEMS + the user's
    own inventory) for titles it doesn't recognize, and only default to "Groceries" if
    neither has an answer."""
    lower = title.lower()
    for keyword, (category, _) in COMMON_ITEMS.items():
        if keyword in lower:
            return category
    predicted = classifier.predict(title)
    return predicted or "Groceries"


def retrain_classifier() -> None:
    """(Re)train the local text classifier from COMMON_ITEMS plus every title currently
    in the user's inventory, so it keeps improving as they add more items. Cheap enough
    (tiny dataset) to call after every add - never raises, a training hiccup just leaves
    the previous model (or the keyword-only fallback) in place."""
    try:
        pairs = [(keyword, cat) for keyword, (cat, _) in COMMON_ITEMS.items()]
        for cat in CATEGORIES:
            for item in inventory.get_items_by_category(cat):
                pairs.append((item["title"], item["category"]))
        classifier.train(pairs)
    except Exception:
        pass


retrain_classifier()


def image_search_query_for(title: str) -> str:
    """Prefer a known COMMON_ITEMS keyword found inside the title over the raw title -
    real-world titles often carry noise (brand names, sizes, stray words) that dilutes
    image-search relevance, whereas a bare keyword like "apple" or "toothpaste" reliably
    finds an on-topic photo."""
    lower = title.lower()
    for keyword in COMMON_ITEMS:
        if keyword in lower:
            return keyword
    return title


def auto_fetch_image(title: str) -> Optional[str]:
    """Best-effort: if an item is added with no photo, try to find a representative one
    via image_search and save it just like an uploaded photo. Returns None (silently) on
    any failure so a missing/failed image search never blocks adding the item."""
    raw = image_search.find_image_bytes(image_search_query_for(title))
    if not raw:
        return None
    try:
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    except UnidentifiedImageError:
        return None
    filename = f"{uuid.uuid4().hex}.jpg"
    image.save(IMAGES_DIR / filename)
    return str(Path("data/images") / filename)


def estimate_shelf_life_days(title: str, category: str) -> int:
    lower = title.lower()
    for keyword, (_, days) in COMMON_ITEMS.items():
        if keyword in lower and days is not None:
            return days
    return 30 if category == "Vegetables" else 14


def threshold_for(category: str, settings: dict) -> float:
    return settings["weight_threshold"] if CATEGORY_UNITS[category] == "g" else settings["count_threshold"]


def effective_threshold(item: dict, settings: dict) -> float:
    custom = item.get("custom_threshold")
    return custom if custom is not None else threshold_for(item["category"], settings)


def days_until_expiration(item: dict) -> Optional[int]:
    exp = item.get("expiration_date")
    if not exp:
        return None
    return (date.fromisoformat(exp) - date.today()).days


EXPIRY_WARNING_DAYS = 3


def save_upload(file: UploadFile) -> str:
    """Save an uploaded image file to disk (normalized to JPEG) and return its relative path."""
    try:
        image = Image.open(file.file).convert("RGB")
    except UnidentifiedImageError:
        raise HTTPException(400, "Could not read that file as an image.")
    filename = f"{uuid.uuid4().hex}.jpg"
    image.save(IMAGES_DIR / filename)
    return str(Path("data/images") / filename)


def items_to_csv_text(items: list) -> str:
    """Shared CSV serialization used by both the export endpoint and backup snapshots."""
    lines = ["uuid,title,category,quantity,unit,notes,expiration_date,created_at"]
    for item in items:
        unit = CATEGORY_UNITS.get(item["category"], "count")
        notes = (item.get("notes") or "").replace(",", ";")
        lines.append(
            f"{item.get('uuid') or ''},{item['title']},{item['category']},{item['quantity']},{unit},"
            f"{notes},{item.get('expiration_date') or ''},{item['created_at']}"
        )
    return "\n".join(lines)


def write_backup(items: list, reason: str) -> Optional[str]:
    """Auto-save a timestamped CSV snapshot of `items` BEFORE a destructive action removes
    them, so bulk-delete/clear-inventory (which have no in-app undo) can still be reversed
    by restoring from this file. No-ops if there's nothing to back up. Prunes old backups
    beyond MAX_BACKUPS so the folder doesn't grow forever."""
    if not items:
        return None
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    safe_reason = "".join(c if c.isalnum() or c in "-_" else "-" for c in reason)
    filename = f"{timestamp}__{safe_reason}.csv"
    (BACKUPS_DIR / filename).write_text(items_to_csv_text(items), encoding="utf-8")

    backups = sorted(BACKUPS_DIR.glob("*.csv"), key=lambda p: p.stat().st_mtime, reverse=True)
    for old in backups[MAX_BACKUPS:]:
        try:
            old.unlink()
        except OSError:
            pass
    return filename


def import_rows(rows, mode: str) -> dict:
    """Shared row-processing loop for both the CSV-upload import endpoint and restoring
    from an auto-backup file - see /api/import/csv's docstring for the matching rules."""
    added = 0
    merged = 0
    skipped = 0
    for row in rows:
        title = (row.get("title") or "").strip()
        if not title:
            skipped += 1
            continue

        row_uuid = (row.get("uuid") or "").strip() or None
        if row_uuid and inventory.find_item_by_uuid(row_uuid):
            skipped += 1
            continue

        category = (row.get("category") or "").strip()
        if category not in CATEGORIES:
            category = guess_category(title)

        try:
            quantity = float(row.get("quantity") or 0)
        except ValueError:
            skipped += 1
            continue

        notes = (row.get("notes") or "").strip() or None
        expiration_date = (row.get("expiration_date") or "").strip() or None

        existing = inventory.find_item_by_title(title, category)
        if existing:
            new_total = quantity if mode == "overwrite" else existing["quantity"] + quantity
            inventory.update_item(
                existing["id"],
                existing["title"],
                existing["category"],
                new_total,
                existing.get("notes"),
                None,
                existing.get("custom_threshold"),
                expiration_date or existing.get("expiration_date"),
            )
            merged += 1
        else:
            inventory.add_item(title, category, quantity, None, notes, None, expiration_date, row_uuid)
            added += 1

    return {"added": added, "merged": merged, "skipped": skipped}


# --- Meta ---
@app.get("/api/meta")
def get_meta():
    return {
        "categories": CATEGORIES,
        "icons": CATEGORY_ICONS,
        "units": CATEGORY_UNITS,
        "palette": PALETTE,
    }


# --- Settings ---
@app.get("/api/settings")
def get_settings():
    return inventory.get_settings()


@app.put("/api/settings")
def put_settings(count_threshold: float = Form(...), weight_threshold: float = Form(...)):
    inventory.update_settings(count_threshold, weight_threshold)
    return inventory.get_settings()


# --- Items ---
@app.get("/api/items")
def list_items(category: Optional[str] = None):
    if category:
        return inventory.get_items_by_category(category)
    return [item for cat in CATEGORIES for item in inventory.get_items_by_category(cat)]


@app.get("/api/suggestions")
def get_suggestions(q: str = ""):
    """Title autocomplete: merges existing inventory titles with the COMMON_ITEMS keyword
    list, so both "things you already track" and "common groceries" show up, each paired
    with a guessed category to auto-fill the Add Item form."""
    q_lower = q.strip().lower()
    if not q_lower:
        return []
    pool: dict[str, dict] = {}
    for cat in CATEGORIES:
        for item in inventory.get_items_by_category(cat):
            key = item["title"].lower()
            pool.setdefault(key, {"title": item["title"], "category": item["category"]})
    for keyword, (cat, _) in COMMON_ITEMS.items():
        pool.setdefault(keyword, {"title": keyword.title(), "category": cat})

    starts = [v for k, v in pool.items() if k.startswith(q_lower)]
    contains = [v for k, v in pool.items() if q_lower in k and not k.startswith(q_lower)]
    return (starts + contains)[:8]


@app.get("/api/classify")
def classify_title(title: str):
    """Live category prediction for a title as the user types (before they've picked a
    known suggestion) - powered by the same keyword+ML hybrid used everywhere else."""
    return {"category": guess_category(title)}



@app.post("/api/items")
def create_item(
    title: str = Form(...),
    category: str = Form(...),
    quantity: float = Form(...),
    notes: Optional[str] = Form(None),
    custom_threshold: Optional[float] = Form(None),
    expiration_date: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
):
    existing = inventory.find_item_by_title(title, category)
    if existing:
        new_total = existing["quantity"] + quantity
        inventory.update_item(
            existing["id"],
            existing["title"],
            existing["category"],
            new_total,
            existing.get("notes"),
            None,
            existing.get("custom_threshold"),
            expiration_date or existing.get("expiration_date"),
        )
        return {"status": "merged", "id": existing["id"], "quantity": new_total}

    image_path = save_upload(image) if image is not None else auto_fetch_image(title)
    inventory.add_item(title, category, quantity, image_path, notes, custom_threshold, expiration_date)
    retrain_classifier()
    return {"status": "added"}


@app.delete("/api/items/clear")
def clear_items(category: Optional[str] = None):
    """Wipe the entire inventory, or just one category if given. Registered BEFORE
    /api/items/{item_id} so the literal "clear" path segment isn't swallowed by that
    route's int path-converter (which would otherwise 422 on a non-numeric id)."""
    if category is not None and category not in CATEGORIES:
        raise HTTPException(400, f"Unknown category: {category}")
    deleted_rows = inventory.clear_items(category)
    backup_file = write_backup(deleted_rows, f"clear-{category or 'all'}")
    for row in deleted_rows:
        image_path = row.get("image_path")
        if image_path:
            path = BASE_DIR / image_path
            if path.exists():
                try:
                    path.unlink()
                except OSError:
                    pass
    return {"deleted": len(deleted_rows), "backup": backup_file}


@app.put("/api/items/{item_id}")
def update_item(
    item_id: int,
    title: str = Form(...),
    category: str = Form(...),
    quantity: float = Form(...),
    notes: Optional[str] = Form(None),
    custom_threshold: Optional[float] = Form(None),
    expiration_date: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
):
    new_image_path = None
    if image is not None:
        new_image_path = save_upload(image)
        items = inventory.get_items_by_category(category)
        old_item = next((i for i in items if i["id"] == item_id), None)
        if old_item and old_item.get("image_path"):
            old_path = BASE_DIR / old_item["image_path"]
            if old_path.exists():
                try:
                    old_path.unlink()
                except OSError:
                    pass
    inventory.update_item(
        item_id, title, category, quantity, notes, new_image_path, custom_threshold, expiration_date
    )
    return {"status": "updated"}


@app.patch("/api/items/{item_id}/quantity")
def patch_quantity(item_id: int, quantity: float = Form(...)):
    inventory.update_quantity(item_id, quantity)
    return {"status": "ok"}


@app.delete("/api/items/{item_id}")
def remove_item(item_id: int):
    all_items = [item for cat in CATEGORIES for item in inventory.get_items_by_category(cat)]
    deleted = next((i for i in all_items if i["id"] == item_id), None)
    if not deleted:
        raise HTTPException(404, "Item not found")
    inventory.delete_item(item_id)
    write_backup([deleted], "delete-item")
    return deleted


@app.post("/api/items/restore")
def restore_item(item: dict):
    inventory.add_item(
        item["title"],
        item["category"],
        item["quantity"],
        item.get("image_path"),
        item.get("notes"),
        item.get("custom_threshold"),
        item.get("expiration_date"),
        item.get("uuid"),
    )
    return {"status": "restored"}


# --- Summary / dashboard ---
@app.get("/api/summary")
def get_summary():
    settings = inventory.get_settings()
    all_items = [item for cat in CATEGORIES for item in inventory.get_items_by_category(cat)]
    category_totals = {cat: inventory.get_category_total(cat) for cat in CATEGORIES}
    low_stock_items = [item for item in all_items if item["quantity"] <= effective_threshold(item, settings)]
    expiring_items = []
    for item in all_items:
        days_left = days_until_expiration(item)
        if days_left is not None and days_left <= EXPIRY_WARNING_DAYS:
            expiring_items.append({"item": item, "days_left": days_left})
    expiring_items.sort(key=lambda pair: pair["days_left"])
    return {
        "total_rows": len(all_items),
        "category_totals": category_totals,
        "low_stock_items": low_stock_items,
        "expiring_items": expiring_items,
    }


# --- Favorites ---
@app.get("/api/favorites")
def list_favorites():
    return inventory.get_favorites()


@app.post("/api/favorites")
def add_favorite(title: str = Form(...), category: str = Form(...), default_quantity: float = Form(...)):
    inventory.add_favorite(title, category, default_quantity)
    return {"status": "ok"}


@app.delete("/api/favorites")
def delete_favorite(title: str, category: str):
    inventory.remove_favorite(title, category)
    return {"status": "ok"}


@app.post("/api/favorites/{favorite_id}/quick-add")
def quick_add_favorite(favorite_id: int):
    favorites = inventory.get_favorites()
    fav = next((f for f in favorites if f["id"] == favorite_id), None)
    if not fav:
        raise HTTPException(404, "Favorite not found")
    existing = inventory.find_item_by_title(fav["title"], fav["category"])
    if existing:
        new_qty = existing["quantity"] + fav["default_quantity"]
        inventory.update_quantity(existing["id"], new_qty)
    else:
        inventory.add_item(
            fav["title"], fav["category"], fav["default_quantity"], auto_fetch_image(fav["title"])
        )
    return {"status": "ok"}


# --- Shopping list ---
@app.get("/api/shopping-list")
def list_shopping_items():
    return inventory.get_shopping_list()


@app.post("/api/shopping-list")
def add_shopping_item(title: str = Form(...), category: Optional[str] = Form(None)):
    inventory.add_shopping_list_item(title, category)
    return {"status": "ok"}


@app.patch("/api/shopping-list/{item_id}")
def patch_shopping_item(item_id: int, checked: bool = Form(...)):
    inventory.set_shopping_item_checked(item_id, checked)
    return {"status": "ok"}


@app.delete("/api/shopping-list/{item_id}")
def delete_shopping_item(item_id: int):
    inventory.delete_shopping_item(item_id)
    return {"status": "ok"}


@app.post("/api/shopping-list/add-low-stock")
def add_low_stock_to_shopping_list():
    settings = inventory.get_settings()
    all_items = [item for cat in CATEGORIES for item in inventory.get_items_by_category(cat)]
    low_stock_items = [item for item in all_items if item["quantity"] <= effective_threshold(item, settings)]
    before = len(inventory.get_shopping_list())
    for item in low_stock_items:
        inventory.add_shopping_list_item(item["title"], item["category"])
    after = len(inventory.get_shopping_list())
    return {"added": after - before}


@app.post("/api/shopping-list/clear-checked")
def clear_checked():
    inventory.clear_checked_shopping_items()
    return {"status": "ok"}


# --- Receipt scan ---
@app.post("/api/receipt/scan")
async def scan_receipt(image: UploadFile = File(...)):
    try:
        pil_image = Image.open(image.file).convert("RGB")
    except UnidentifiedImageError:
        raise HTTPException(400, "Could not read that file as an image.")
    raw_text = receipt.ocr_receipt_image(pil_image)
    parsed = receipt.parse_receipt_text(raw_text)

    results = []
    for c in parsed:
        category = guess_category(c["title"])
        is_weight_unit = CATEGORY_UNITS[category] == "g"
        if is_weight_unit:
            quantity = c["weight_grams"] if c["weight_grams"] is not None else 500
        else:
            quantity = c["quantity"] if c["quantity"] is not None else 1
        results.append({"title": c["title"], "category": category, "quantity": quantity})
    return {"candidates": results}


# --- Charts ---
@app.get("/api/charts/category-counts")
def chart_category_counts():
    return {cat: len(inventory.get_items_by_category(cat)) for cat in CATEGORIES}


@app.get("/api/charts/stock-by-item")
def chart_stock_by_item(category: str):
    items = inventory.get_items_by_category(category)
    totals: dict = {}
    for item in items:
        totals[item["title"]] = totals.get(item["title"], 0) + item["quantity"]
    return [{"title": k, "quantity": v} for k, v in sorted(totals.items(), key=lambda kv: -kv[1])]


@app.get("/api/charts/added-over-time")
def chart_added_over_time(category: str):
    items = inventory.get_items_by_category(category)
    totals: dict = {}
    for item in items:
        day = item["created_at"][:10]
        totals[day] = totals.get(day, 0) + item["quantity"]
    return [{"date": k, "quantity": v} for k, v in sorted(totals.items())]


# --- Export ---
@app.get("/api/export/csv", response_class=PlainTextResponse)
def export_csv():
    inventory.backfill_missing_uuids()
    all_items = [item for cat in CATEGORIES for item in inventory.get_items_by_category(cat)]
    return items_to_csv_text(all_items)


# --- Backups (auto-saved before any destructive delete/clear action) ---
@app.get("/api/backups")
def list_backups():
    backups = sorted(BACKUPS_DIR.glob("*.csv"), key=lambda p: p.stat().st_mtime, reverse=True)
    result = []
    for path in backups:
        text = path.read_text(encoding="utf-8")
        item_count = max(0, len(text.splitlines()) - 1)
        result.append(
            {
                "filename": path.name,
                "created_at": datetime.fromtimestamp(path.stat().st_mtime).isoformat(),
                "item_count": item_count,
            }
        )
    return result


@app.get("/api/backups/{filename}/download")
def download_backup(filename: str):
    path = BACKUPS_DIR / Path(filename).name
    if not path.exists() or path.parent != BACKUPS_DIR:
        raise HTTPException(404, "Backup not found")
    return FileResponse(path, media_type="text/csv", filename=path.name)


@app.post("/api/backups/{filename}/restore")
def restore_backup(filename: str):
    path = BACKUPS_DIR / Path(filename).name
    if not path.exists() or path.parent != BACKUPS_DIR:
        raise HTTPException(404, "Backup not found")
    text = path.read_text(encoding="utf-8")
    reader = csv.DictReader(io.StringIO(text))
    return import_rows(reader, mode="merge")


# --- Import ---
@app.post("/api/import/csv")
async def import_csv(file: UploadFile = File(...), mode: str = Form("merge")):
    """Bulk-import items from a previously exported CSV (uuid,title,category,quantity,unit,
    notes,expiration_date,created_at - only title/category/quantity are required, extra/
    missing columns are tolerated). Each row's `uuid` (if present and already in the
    database - i.e. this row was exported from here before) is ALWAYS skipped, regardless
    of `mode` - this is what makes re-importing the same backup idempotent. Rows with no
    uuid, or a uuid not seen before, fall back to matching by case-insensitive
    title+category (same rule used by the regular add-item form): on a match, `mode`
    controls what happens - "merge" (default) adds the CSV quantity onto the existing
    quantity, "overwrite" replaces the existing quantity with the CSV's value instead.
    Items with no match are always inserted as new rows (keeping the CSV's uuid, if any,
    so a later re-import of the same file will then correctly skip them).
    """
    if mode not in ("merge", "overwrite"):
        raise HTTPException(400, "mode must be 'merge' or 'overwrite'.")

    raw_bytes = await file.read()
    try:
        text = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(400, "Could not read that file as UTF-8 text/CSV.")

    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None or "title" not in reader.fieldnames:
        raise HTTPException(400, "CSV must have at least a 'title' column.")

    return import_rows(reader, mode)
