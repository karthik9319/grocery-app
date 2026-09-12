from fastapi import APIRouter, Form, HTTPException

import inventory
from api_common import auto_fetch_image

router = APIRouter()


# --- Favorites ---
@router.get("/api/favorites")
def list_favorites():
    return inventory.get_favorites()


@router.post("/api/favorites")
def add_favorite(title: str = Form(...), category: str = Form(...), default_quantity: float = Form(...)):
    inventory.add_favorite(title, category, default_quantity)
    return {"status": "ok"}


@router.delete("/api/favorites")
def delete_favorite(title: str, category: str):
    inventory.remove_favorite(title, category)
    return {"status": "ok"}


@router.post("/api/favorites/{favorite_id}/quick-add")
def quick_add_favorite(favorite_id: int):
    favorites = inventory.get_favorites()
    fav = next((f for f in favorites if f["id"] == favorite_id), None)
    if not fav:
        raise HTTPException(404, "Favorite not found")
    existing = inventory.find_item_by_title(fav["title"], fav["category"])
    if existing:
        new_qty = existing["quantity"] + fav["default_quantity"]
        inventory.update_quantity(existing["id"], new_qty)
        inventory.log_usage_event(
            existing["id"], existing["title"], existing["category"], "restock",
            fav["default_quantity"], new_qty,
        )
    else:
        inventory.add_item(
            fav["title"], fav["category"], fav["default_quantity"], auto_fetch_image(fav["title"])
        )
        created = inventory.find_item_by_title(fav["title"], fav["category"])
        if created:
            inventory.log_usage_event(
                created["id"], created["title"], created["category"], "add",
                fav["default_quantity"], created["quantity"],
            )
    return {"status": "ok"}
