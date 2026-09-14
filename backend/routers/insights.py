from fastapi import APIRouter

import inventory
from api_common import CATEGORIES

router = APIRouter()


@router.get("/api/items/{item_id}/history")
def item_history(item_id: int):
    return inventory.get_usage_events(item_id)


@router.get("/api/insights/predictions")
def usage_predictions():
    """Run-out predictions from real consumption history: for each item with enough
    history, days-until-empty = current on-hand total / average daily consumption. Only
    confident estimates are returned, soonest-first."""
    all_items = [item for cat in CATEGORIES for item in inventory.get_items_by_category(cat)]
    results = []
    for item in all_items:
        rate = inventory.get_consumption_rate(item["id"])
        if not rate or rate["rate_per_day"] <= 0:
            continue
        on_hand = float(item["quantity"]) + float(item.get("in_use_quantity") or 0)
        results.append({
            "item": item,
            "days_left": round(on_hand / rate["rate_per_day"], 1),
            "rate_per_day": rate["rate_per_day"],
        })
    results.sort(key=lambda r: r["days_left"])
    return results
