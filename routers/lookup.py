import re
from datetime import date, timedelta

from fastapi import APIRouter

import barcode as barcode_lookup
import inventory
from api_common import (
    CATEGORIES,
    CATEGORY_UNITS,
    COMMON_ITEMS,
    estimate_shelf_life_days,
    guess_category,
)

router = APIRouter()


@router.get("/api/search")
def search_all(q: str = ""):
    """Search across everything at once: inventory items (by title, category, OR a known
    alias), shopping-list entries, and meal-plan entries (title or notes). Powers the
    global Search tab so one query surfaces matches from every list, not just items."""
    q_lower = q.strip().lower()
    if not q_lower:
        return {"items": [], "shopping_list": [], "meal_plan": []}

    all_items = [item for cat in CATEGORIES for item in inventory.get_items_by_category(cat)]
    alias_item_ids = {
        alias["item_id"]
        for alias in inventory.get_all_aliases()
        if q_lower in alias["alias"].lower()
    }
    items = [
        item
        for item in all_items
        if q_lower in item["title"].lower()
        or q_lower in item["category"].lower()
        or item["id"] in alias_item_ids
    ]
    shopping_list = [
        row for row in inventory.get_shopping_list() if q_lower in row["title"].lower()
    ]
    meal_plan = [
        entry
        for entry in inventory.get_all_meal_plan_entries()
        if q_lower in entry["title"].lower() or q_lower in (entry.get("notes") or "").lower()
    ]
    return {"items": items, "shopping_list": shopping_list, "meal_plan": meal_plan}


@router.get("/api/barcode/{code}")
def lookup_barcode(code: str):
    """Look up a scanned barcode against Open Food Facts and return a best-effort product
    name + guessed category to pre-fill the Add Item form. `found` is False (with an empty
    title) when the barcode is unknown - the UI then just lets the user type it manually."""
    name = barcode_lookup.lookup_product_name(code)
    if not name:
        return {"found": False, "title": "", "category": CATEGORIES[0], "expiration_date": None}
    category = guess_category(name)
    exp = (date.today() + timedelta(days=estimate_shelf_life_days(name, category))).isoformat()
    return {"found": True, "title": name, "category": category, "expiration_date": exp}


@router.get("/api/suggestions")
def get_suggestions(q: str = ""):
    """Title autocomplete: merges existing inventory titles, the COMMON_ITEMS keyword
    list, and known aliases (so typing a synonym like "soda" surfaces the real tracked
    item, e.g. "Coca-Cola"), each paired with a guessed/real category to auto-fill the
    Add Item form. Prefix-matches ranked before substring matches, capped at 8."""
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
    for alias in inventory.get_all_aliases():
        pool[alias["alias"].lower()] = {"title": alias["title"], "category": alias["category"]}

    starts = [v for k, v in pool.items() if k.startswith(q_lower)]
    contains = [v for k, v in pool.items() if q_lower in k and not k.startswith(q_lower)]
    return (starts + contains)[:8]


@router.get("/api/classify")
def classify_title(title: str):
    """Live category prediction for a title as the user types (before they've picked a
    known suggestion) - powered by the same keyword+ML hybrid used everywhere else."""
    return {"category": guess_category(title)}


# --- Quick add (voice/free-text) ---
QUICK_ADD_UNITS = {
    "kg": 1000, "kgs": 1000, "kilogram": 1000, "kilograms": 1000,
    "g": 1, "gram": 1, "grams": 1,
    "lb": 453.592, "lbs": 453.592, "pound": 453.592, "pounds": 453.592,
    "oz": 28.3495, "ounce": 28.3495, "ounces": 28.3495,
}
QUICK_ADD_LINE_RE = re.compile(
    r"^\s*(?:(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?\s+(?:of\s+)?)?(.+?)\s*$"
)


def parse_quick_add(text: str) -> list:
    """Parse a free-text / dictated add request into structured items. Handles things like
    "2 milk, 3 eggs and 500g rice" -> three items with quantities/categories. Splits on
    commas, semicolons, newlines, and the word "and"; each chunk may start with a number
    and an optional unit."""
    chunks = re.split(r"[,;\n]+|\band\b|\bplus\b", text, flags=re.IGNORECASE)
    results = []
    for chunk in chunks:
        chunk = chunk.strip()
        if not chunk:
            continue
        # strip a leading verb like "add"/"buy"/"get"
        chunk = re.sub(r"^(add|buy|get|need|want)\s+", "", chunk, flags=re.IGNORECASE).strip()
        match = QUICK_ADD_LINE_RE.match(chunk)
        if not match:
            continue
        number, unit, name = match.group(1), match.group(2), match.group(3)
        name = (name or "").strip(" -.:").strip()
        if not name or len(name) < 2:
            continue

        category = guess_category(name)
        unit_lower = (unit or "").lower()
        quantity: float = 1
        if number:
            amount = float(number)
            if unit_lower in QUICK_ADD_UNITS and CATEGORY_UNITS.get(category) == "g":
                quantity = round(amount * QUICK_ADD_UNITS[unit_lower], 1)
            elif unit_lower in QUICK_ADD_UNITS:
                # a weight was given but the category is count-based - keep the count
                quantity = amount
            else:
                # the "unit" was actually the start of the name (e.g. "2 apples")
                quantity = amount
                if unit and unit_lower not in QUICK_ADD_UNITS:
                    name = f"{unit} {name}".strip()
                    category = guess_category(name)
        elif unit and not number:
            # no leading number at all - the regex's unit group is really part of the name
            name = f"{unit} {name}".strip()
            category = guess_category(name)

        # default sensible quantity for weight-based categories with no explicit weight
        if CATEGORY_UNITS.get(category) == "g" and (not number or unit_lower not in QUICK_ADD_UNITS):
            quantity = 500 if quantity == 1 else quantity

        results.append(
            {"title": name.title(), "quantity": quantity, "category": category}
        )
    return results


@router.get("/api/quick-add/parse")
def quick_add_parse(text: str = ""):
    """Parse a free-text / voice-dictated add request into reviewable structured items."""
    return {"items": parse_quick_add(text)}
