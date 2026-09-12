from fastapi import APIRouter

import inventory
from api_common import CATEGORIES, EXPIRY_WARNING_DAYS, days_until_expiration, effective_threshold

router = APIRouter()


# --- Summary / dashboard ---
@router.get("/api/summary")
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
