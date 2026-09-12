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
    totals: dict = {}
    for item in items:
        totals[item["title"]] = totals.get(item["title"], 0) + item["quantity"]
    return [{"title": k, "quantity": v} for k, v in sorted(totals.items(), key=lambda kv: -kv[1])]


@router.get("/api/charts/added-over-time")
def chart_added_over_time(category: str):
    items = inventory.get_items_by_category(category)
    totals: dict = {}
    for item in items:
        day = item["created_at"][:10]
        totals[day] = totals.get(day, 0) + item["quantity"]
    return [{"date": k, "quantity": v} for k, v in sorted(totals.items())]
