"""Shared constants, paths, and helper functions used by api.py AND every module in
routers/.

Extracted from the original monolithic api.py when it was split into a routers/
package (see prompt.md, sections 2/3/9 for context). Routers must import from here,
never from api.py itself - api.py imports the routers to register them, so a router
importing back from api.py would create a circular import.
"""
import io
import logging
import os
import shutil
import sqlite3
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
from pillow_heif import register_heif_opener

import classifier
import image_search
import inventory

register_heif_opener()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("grocery")

# Repo root (this module now lives one level down, in backend/) - data/, frontend/dist,
# etc. all stay physically where they've always been, at the true project root.
BASE_DIR = Path(__file__).resolve().parent.parent
IMAGES_DIR = BASE_DIR / "data" / "images"
IMAGES_DIR.mkdir(parents=True, exist_ok=True)
BACKUPS_DIR = BASE_DIR / "data" / "backups"
BACKUPS_DIR.mkdir(parents=True, exist_ok=True)
MAX_BACKUPS = 30
FRONTEND_DIST = BASE_DIR / "frontend" / "dist"

# Off-machine safety net, same pattern as this user's other local-first apps (e.g. the
# habit tracker): once-per-day dated snapshot copied into iCloud Drive if it's mounted
# on this Mac, so a lost/wiped laptop doesn't lose everything. Unlike that app (a flat
# JSON file, safe to live directly inside a synced folder via atomic rename), this
# app's live SQLite db stays local - WAL-mode SQLite doesn't tolerate being directly
# inside a continuously-cloud-synced directory. Only a point-in-time snapshot is copied.
ICLOUD_ROOT = Path.home() / "Library" / "Mobile Documents" / "com~apple~CloudDocs"
ICLOUD_BACKUP_DIR = ICLOUD_ROOT / "GroceryAppBackups"
ICLOUD_BACKUP_RETENTION_DAYS = 30

# --- Static reference data (mirrors the old app.py's constants) ---
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

EXPIRY_WARNING_DAYS = 3

MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack", "extra"]


def known_item_category(title: str) -> Optional[str]:
    """Return the category for a title ONLY if it matches a known COMMON_ITEMS keyword
    (Groceries/Vegetables/Household/Snacks), else None. Unlike guess_category, this never
    falls back to the ML classifier or a "Groceries" default - used where we specifically
    want to recognize a genuine, already-known grocery/household/etc item and reject
    anything else (e.g. filtering receipt-scan candidates down to real items, not random
    OCR noise)."""
    lower = title.lower()
    for keyword, (category, _) in COMMON_ITEMS.items():
        if keyword in lower:
            return category
    return None


def guess_category(title: str) -> str:
    """Hybrid category guesser: try the fast/precise COMMON_ITEMS keyword match first,
    then fall back to the local ML text classifier (trained on COMMON_ITEMS + the user's
    own inventory) for titles it doesn't recognize, and only default to "Groceries" if
    neither has an answer."""
    known = known_item_category(title)
    if known:
        return known
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


def save_upload(file: UploadFile) -> str:
    """Save an uploaded image file to disk (normalized to JPEG) and return its relative path."""
    try:
        image = Image.open(file.file).convert("RGB")
    except UnidentifiedImageError:
        raise HTTPException(400, "Could not read that file as an image.")
    filename = f"{uuid.uuid4().hex}.jpg"
    image.save(IMAGES_DIR / filename)
    return str(Path("data/images") / filename)


def _remove_image_file(image_path: Optional[str]) -> None:
    """Delete an item/photo image file from disk if it exists. Never raises - a missing or
    unremovable file is logged and ignored (cleanup should never block the operation)."""
    if not image_path:
        return
    path = BASE_DIR / image_path
    if path.exists():
        try:
            path.unlink()
        except OSError:
            logger.warning("Could not delete image file %s", path)


def items_to_csv_text(items: list) -> str:
    """Shared CSV serialization used by both the export endpoint and backup snapshots."""
    lines = ["uuid,title,category,quantity,in_use_quantity,unit,notes,expiration_date,created_at"]
    for item in items:
        unit = CATEGORY_UNITS.get(item["category"], "count")
        notes = (item.get("notes") or "").replace(",", ";")
        lines.append(
            f"{item.get('uuid') or ''},{item['title']},{item['category']},{item['quantity']},"
            f"{item.get('in_use_quantity', 0)},{unit},{notes},{item.get('expiration_date') or ''},"
            f"{item['created_at']}"
        )
    return "\n".join(lines)


def favorites_to_csv_text(favorites: list) -> str:
    lines = ["title,category,default_quantity,created_at"]
    for fav in favorites:
        lines.append(
            f"{fav['title']},{fav['category']},{fav['default_quantity']},{fav['created_at']}"
        )
    return "\n".join(lines)


def shopping_list_to_csv_text(rows: list) -> str:
    lines = ["title,category,checked,created_at"]
    for row in rows:
        lines.append(
            f"{row['title']},{row.get('category') or ''},{bool(row['checked'])},{row['created_at']}"
        )
    return "\n".join(lines)


def meal_plan_to_csv_text(rows: list) -> str:
    lines = ["date,meal_slot,title,notes,done,created_at"]
    for row in rows:
        notes = (row.get("notes") or "").replace(",", ";")
        lines.append(
            f"{row['date']},{row['meal_slot']},{row['title']},{notes},{bool(row.get('done'))},{row['created_at']}"
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


def write_icloud_snapshot() -> Optional[str]:
    """Write a once-per-day full snapshot (database + item photos) into iCloud Drive, if
    it's available on this Mac - a no-op (not an error) otherwise. Skips if today's
    snapshot already exists (called on every server startup, not on a timer), and prunes
    anything older than ICLOUD_BACKUP_RETENTION_DAYS. Uses SQLite's online backup API
    (Connection.backup), not a raw file copy, so the snapshot is transactionally
    consistent even if the live db is currently open/being written to. Skips entirely
    (never touches the real iCloud Drive) whenever GROCERY_DB_PATH is set - tests and
    any alternate deployment pointed at a non-default database have no business writing
    into this machine's personal iCloud account as a side effect of importing this
    module."""
    if os.environ.get("GROCERY_DB_PATH") or not ICLOUD_ROOT.is_dir():
        return None
    try:
        snapshot_dir = ICLOUD_BACKUP_DIR / f"grocery-app-{date.today().isoformat()}"
        if snapshot_dir.exists():
            return None
        snapshot_dir.mkdir(parents=True)

        db_path = BASE_DIR / "data" / "inventory.db"
        if db_path.exists():
            src = sqlite3.connect(str(db_path))
            try:
                dst = sqlite3.connect(str(snapshot_dir / "inventory.db"))
                try:
                    src.backup(dst)
                finally:
                    dst.close()
            finally:
                src.close()

        if IMAGES_DIR.is_dir():
            shutil.copytree(IMAGES_DIR, snapshot_dir / "images")

        _prune_old_icloud_snapshots()
        return str(snapshot_dir)
    except OSError:
        logger.exception("iCloud backup snapshot failed")
        return None


def _prune_old_icloud_snapshots() -> None:
    cutoff = datetime.now() - timedelta(days=ICLOUD_BACKUP_RETENTION_DAYS)
    for entry in ICLOUD_BACKUP_DIR.glob("grocery-app-*"):
        try:
            entry_date = datetime.strptime(entry.name.removeprefix("grocery-app-"), "%Y-%m-%d")
        except ValueError:
            continue
        if entry_date < cutoff:
            shutil.rmtree(entry, ignore_errors=True)


def detect_import_kind(fieldnames: Optional[list[str]]) -> str:
    """Infer the destination list from CSV headers so meal-plan/favorites/shopping exports
    are imported into the right place instead of falling back to inventory defaults."""
    if not fieldnames:
        return "inventory"

    normalized = {name.strip().lower() for name in fieldnames if name is not None}
    if {"date", "meal_slot", "title"}.issubset(normalized):
        return "meal_plan"
    if {"title", "category", "default_quantity"}.issubset(normalized):
        return "favorites"
    if {"title", "category", "checked"}.issubset(normalized):
        return "shopping_list"
    if {"uuid", "title", "category", "quantity"}.issubset(normalized):
        return "inventory"
    if {"title", "category", "quantity"}.issubset(normalized):
        return "inventory"
    return "inventory"


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

        try:
            in_use_quantity = float(row.get("in_use_quantity") or 0)
        except ValueError:
            in_use_quantity = 0

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
            inventory.set_in_use_quantity(existing["id"], in_use_quantity)
            merged += 1
        else:
            inventory.add_item(
                title,
                category,
                quantity,
                None,
                notes,
                None,
                expiration_date,
                row_uuid,
                in_use_quantity=in_use_quantity,
            )
            added += 1

    return {"added": added, "merged": merged, "skipped": skipped}


def import_favorites_rows(rows) -> dict:
    processed = 0
    for row in rows:
        title = (row.get("title") or "").strip()
        category = (row.get("category") or "").strip()
        if not title or category not in CATEGORIES:
            continue
        try:
            default_quantity = float(row.get("default_quantity") or 1)
        except ValueError:
            default_quantity = 1
        inventory.add_favorite(title, category, default_quantity)
        processed += 1
    return {"added": processed, "merged": 0, "skipped": 0}


def import_shopping_list_rows(rows) -> dict:
    processed = 0
    for row in rows:
        title = (row.get("title") or "").strip()
        if not title:
            continue
        category = (row.get("category") or "").strip() or None
        inventory.add_shopping_list_item(title, category)
        processed += 1
    return {"added": processed, "merged": 0, "skipped": 0}


def import_meal_plan_rows(rows) -> dict:
    existing_keys = {
        (e["date"], e["meal_slot"], e["title"].lower())
        for e in inventory.get_all_meal_plan_entries()
    }
    added = 0
    skipped = 0
    for row in rows:
        entry_date = (row.get("date") or "").strip()
        meal_slot = (row.get("meal_slot") or "").strip()
        title = (row.get("title") or "").strip()
        if not entry_date or meal_slot not in MEAL_SLOTS or not title:
            skipped += 1
            continue
        key = (entry_date, meal_slot, title.lower())
        if key in existing_keys:
            skipped += 1
            continue
        notes = (row.get("notes") or "").strip() or None
        done_raw = (row.get("done") or "").strip().lower()
        done = done_raw in {"1", "true", "yes", "y"}
        inventory.add_meal_plan_entry(entry_date, meal_slot, title, notes, done)
        existing_keys.add(key)
        added += 1
    return {"added": added, "merged": 0, "skipped": skipped}
