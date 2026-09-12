from fastapi import APIRouter, File, Form, HTTPException, UploadFile

import inventory
from api_common import BASE_DIR, CATEGORIES, save_upload

router = APIRouter()


# --- Aliases (synonyms - e.g. "soda" merges into a tracked "Coca-Cola" item) ---
@router.get("/api/items/{item_id}/aliases")
def list_aliases(item_id: int):
    return inventory.get_aliases_for_item(item_id)


@router.post("/api/items/{item_id}/aliases")
def create_alias(item_id: int, alias: str = Form(...)):
    alias = alias.strip()
    if not alias:
        raise HTTPException(400, "Alias cannot be empty")
    try:
        return inventory.add_alias(item_id, alias)
    except ValueError as exc:
        raise HTTPException(409, str(exc))


@router.delete("/api/items/{item_id}/aliases/{alias_id}")
def remove_alias_endpoint(item_id: int, alias_id: int):
    inventory.remove_alias(alias_id)
    return {"status": "ok"}


# --- Photos (gallery - multiple photos per item, beyond the single cover image) ---
@router.get("/api/items/{item_id}/photos")
def list_item_photos(item_id: int):
    return inventory.get_item_photos(item_id)


@router.post("/api/items/{item_id}/photos")
def add_item_photo(item_id: int, image: UploadFile = File(...)):
    image_path = save_upload(image)
    photo = inventory.add_item_photo(item_id, image_path)
    # If the item has no cover photo yet, use the first gallery photo as its cover too,
    # so it actually shows up as the item's thumbnail without an extra manual step.
    all_items = [i for cat in CATEGORIES for i in inventory.get_items_by_category(cat)]
    item = next((i for i in all_items if i["id"] == item_id), None)
    if item and not item.get("image_path"):
        inventory.update_item(
            item_id,
            item["title"],
            item["category"],
            item["quantity"],
            item.get("notes"),
            image_path,
            item.get("custom_threshold"),
            item.get("expiration_date"),
        )
    return photo


@router.post("/api/items/{item_id}/photos/{photo_id}/cover")
def set_cover_photo(item_id: int, photo_id: int):
    """Promote an existing gallery photo to be the item's main cover image (shown on the
    item card everywhere)."""
    photo = inventory.get_item_photo(photo_id)
    if not photo or photo["item_id"] != item_id:
        raise HTTPException(404, "Photo not found")
    all_items = [i for cat in CATEGORIES for i in inventory.get_items_by_category(cat)]
    item = next((i for i in all_items if i["id"] == item_id), None)
    if not item:
        raise HTTPException(404, "Item not found")
    inventory.update_item(
        item_id,
        item["title"],
        item["category"],
        item["quantity"],
        item.get("notes"),
        photo["image_path"],
        item.get("custom_threshold"),
        item.get("expiration_date"),
    )
    return {"status": "ok"}


@router.delete("/api/items/{item_id}/photos/{photo_id}")
def delete_item_photo_endpoint(item_id: int, photo_id: int):
    photo = inventory.delete_item_photo(photo_id)
    if not photo:
        raise HTTPException(404, "Photo not found")
    path = BASE_DIR / photo["image_path"]
    if path.exists():
        try:
            path.unlink()
        except OSError:
            pass
    # If this photo was being used as the item's cover, clear that reference too (the
    # underlying file is now gone) rather than leaving a broken image reference.
    all_items = [i for cat in CATEGORIES for i in inventory.get_items_by_category(cat)]
    item = next((i for i in all_items if i["id"] == item_id), None)
    if item and item.get("image_path") == photo["image_path"]:
        inventory.clear_item_cover(item_id)
    return {"status": "ok"}
