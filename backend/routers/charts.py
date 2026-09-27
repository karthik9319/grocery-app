from fastapi import APIRouter

import inventory
from api_common import CATEGORIES

router = APIRouter()


# --- Charts ---
@router.get("/api/charts/category-counts")
def chart_category_counts():
    return {cat: len(inventory.get_items_by_category(cat)) for cat in CATEGORIES}


@router.get("/api/charts/stock-by-item")
def chart_stock_by_item(category: str):
    items = inventory.get_items_by_category(category)
    return [
        {"title": item["title"], "quantity": item["quantity"], "unit": item.get("unit", "count")}
        for item in sorted(items, key=lambda item: item["title"].lower())
    ]


@router.get("/api/charts/added-over-time")
def chart_added_over_time(category: str):
    items = inventory.get_items_by_category(category)
    totals: dict = {}
    for item in items:
        day = item["created_at"][:10]
        totals[day] = totals.get(day, 0) + 1
    return [{"date": k, "items": v} for k, v in sorted(totals.items())]
