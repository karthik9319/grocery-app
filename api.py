"""FastAPI backend for the Grocery & Vegetable Tracker.

Reuses inventory.py (SQLite CRUD) and receipt.py (OCR) unchanged - this API is just a
thin HTTP layer over the same business logic used by the Streamlit app (app.py), so
both frontends share the same data/inventory.db and data/images/.
"""
import csv
import io
import uuid
from datetime import date, timedelta
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, UnidentifiedImageError
from pillow_heif import register_heif_opener

import inventory
import receipt

register_heif_opener()

BASE_DIR = Path(__file__).parent
IMAGES_DIR = BASE_DIR / "data" / "images"
IMAGES_DIR.mkdir(parents=True, exist_ok=True)

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
    "chips": ("Snacks", 90), "popcorn": ("Snacks", 180), "cookie": ("Snacks", 60),
    "cookies": ("Snacks", 60), "chocolate": ("Snacks", 180), "candy": ("Snacks", 270),
    "cracker": ("Snacks", 120), "crackers": ("Snacks", 120), "pretzel": ("Snacks", 120),
    "granola bar": ("Snacks", 180), "nuts": ("Snacks", 180), "biscuit": ("Snacks", 90),
    "biscuits": ("Snacks", 90),
}


def guess_category(title: str) -> str:
    lower = title.lower()
    for keyword, (category, _) in COMMON_ITEMS.items():
        if keyword in lower:
            return category
    return "Groceries"


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

    image_path = save_upload(image) if image is not None else None
    inventory.add_item(title, category, quantity, image_path, notes, custom_threshold, expiration_date)
    return {"status": "added"}


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
        inventory.add_item(fav["title"], fav["category"], fav["default_quantity"], None)
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
    candidates = receipt.parse_receipt_text(raw_text)
    return {
        "candidates": [
            {"title": c, "category": guess_category(c)} for c in candidates
        ]
    }


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
    all_items = [item for cat in CATEGORIES for item in inventory.get_items_by_category(cat)]
    lines = ["title,category,quantity,unit,notes,expiration_date,created_at"]
    for item in all_items:
        unit = CATEGORY_UNITS[item["category"]]
        notes = (item.get("notes") or "").replace(",", ";")
        lines.append(
            f"{item['title']},{item['category']},{item['quantity']},{unit},"
            f"{notes},{item.get('expiration_date') or ''},{item['created_at']}"
        )
    return "\n".join(lines)


# --- Import ---
@app.post("/api/import/csv")
async def import_csv(file: UploadFile = File(...)):
    """Bulk-import items from a previously exported CSV (title,category,quantity,unit,
    notes,expiration_date,created_at - only title/category/quantity are required, extra/
    missing columns are tolerated). Merges into existing items by case-insensitive
    title+category match (same rule used by the regular add-item form), otherwise
    inserts a new row.
    """
    raw_bytes = await file.read()
    try:
        text = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(400, "Could not read that file as UTF-8 text/CSV.")

    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None or "title" not in reader.fieldnames:
        raise HTTPException(400, "CSV must have at least a 'title' column.")

    added = 0
    merged = 0
    skipped = 0
    for row in reader:
        title = (row.get("title") or "").strip()
        if not title:
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
            merged += 1
        else:
            inventory.add_item(title, category, quantity, None, notes, None, expiration_date)
            added += 1

    return {"added": added, "merged": merged, "skipped": skipped}
