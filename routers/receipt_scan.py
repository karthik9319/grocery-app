from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, File, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

import inventory
import receipt
from api_common import CATEGORY_UNITS, estimate_shelf_life_days, known_item_category

router = APIRouter()


def alias_match(title: str) -> Optional[dict]:
    """Return the canonical item (as a dict with title/category/item_id) if any known
    alias is found as a SUBSTRING of title, else None. Unlike inventory.find_item_by_alias
    (exact match, used for merge-on-add when a user types a title), this is substring-
    based to cope with messy OCR'd receipt lines that carry extra words (e.g. "COKE 12PK"
    should still match an alias of plain "coke")."""
    lower = title.lower()
    for alias in inventory.get_all_aliases():
        if alias["alias"].lower() in lower:
            return alias
    return None


# --- Receipt scan ---
@router.post("/api/receipt/scan")
async def scan_receipt(image: UploadFile = File(...)):
    try:
        pil_image = Image.open(image.file).convert("RGB")
    except UnidentifiedImageError:
        raise HTTPException(400, "Could not read that file as an image.")
    raw_text = receipt.ocr_receipt_image(pil_image)
    parsed = receipt.parse_receipt_text(raw_text)

    results = []
    for c in parsed:
        # An alias match wins first (e.g. "COKE 12PK" matching an alias "coke" of a
        # tracked "Coca-Cola" item) - use the CANONICAL item's real title/category
        # instead of the raw OCR text, since it's genuinely the same tracked item.
        aliased = alias_match(c["title"])
        if aliased:
            category = aliased["category"]
            title = aliased["title"]
        else:
            category = known_item_category(c["title"])
            title = c["title"]
            if category is None:
                # Not a recognized Groceries/Vegetables/Household/Snacks item (e.g. store
                # name/address, a garbled OCR line, or something outside the defined
                # categories) - skip it rather than guessing/defaulting to "Groceries".
                continue
        is_weight_unit = CATEGORY_UNITS[category] == "g"
        if is_weight_unit:
            quantity = c["weight_grams"] if c["weight_grams"] is not None else 500
        else:
            quantity = c["quantity"] if c["quantity"] is not None else 1
        expiration_date = (
            date.today() + timedelta(days=estimate_shelf_life_days(title, category))
        ).isoformat()
        results.append(
            {
                "title": title,
                "category": category,
                "quantity": quantity,
                "price": c.get("price"),
                "expiration_date": expiration_date,
            }
        )
    return {"candidates": results}
