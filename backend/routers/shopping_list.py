from typing import Optional

from fastapi import APIRouter, Form

import inventory
from api_common import CATEGORIES, effective_threshold

router = APIRouter()


# --- Shopping list ---
@router.get("/api/shopping-list")
def list_shopping_items():
    return inventory.get_shopping_list()


@router.post("/api/shopping-list")
def add_shopping_item(title: str = Form(...), category: Optional[str] = Form(None)):
    inventory.add_shopping_list_item(title, category)
    return {"status": "ok"}


@router.patch("/api/shopping-list/{item_id}")
def patch_shopping_item(item_id: int, checked: bool = Form(...)):
    inventory.set_shopping_item_checked(item_id, checked)
    return {"status": "ok"}


@router.delete("/api/shopping-list/{item_id}")
def delete_shopping_item(item_id: int):
    inventory.delete_shopping_item(item_id)
    return {"status": "ok"}


@router.post("/api/shopping-list/add-low-stock")
def add_low_stock_to_shopping_list():
    settings = inventory.get_settings()
    all_items = [item for cat in CATEGORIES for item in inventory.get_items_by_category(cat)]
    low_stock_items = [item for item in all_items if item["quantity"] <= effective_threshold(item, settings)]
    before = len(inventory.get_shopping_list())
    for item in low_stock_items:
        inventory.add_shopping_list_item(item["title"], item["category"])
    after = len(inventory.get_shopping_list())
    return {"added": after - before}


@router.post("/api/shopping-list/clear-checked")
def clear_checked():
    inventory.clear_checked_shopping_items()
    return {"status": "ok"}
