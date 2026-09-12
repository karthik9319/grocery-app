from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

import inventory
from api_common import (
    BASE_DIR,
    CATEGORIES,
    _remove_image_file,
    auto_fetch_image,
    retrain_classifier,
    save_upload,
    write_backup,
)

router = APIRouter()


# --- Items ---
@router.get("/api/items")
def list_items(category: Optional[str] = None):
    if category:
        return inventory.get_items_by_category(category)
    return [item for cat in CATEGORIES for item in inventory.get_items_by_category(cat)]


@router.post("/api/items")
def create_item(
    title: str = Form(...),
    category: str = Form(...),
    quantity: float = Form(...),
    notes: Optional[str] = Form(None),
    custom_threshold: Optional[float] = Form(None),
    expiration_date: Optional[str] = Form(None),
    price: Optional[float] = Form(None),
    image: Optional[UploadFile] = File(None),
):
    # An alias (e.g. "soda" for a "Coca-Cola" item) always wins first, merging into the
    # canonical item regardless of whatever category was picked in the form.
    aliased = inventory.find_item_by_alias(title)
    existing = aliased or inventory.find_item_by_title(title, category)
    if price is not None and price > 0:
        inventory.add_purchase(title, category, quantity, price, source="manual")
    if existing:
        new_total = existing["quantity"] + quantity
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
        inventory.log_usage_event(
            existing["id"], existing["title"], existing["category"], "restock", quantity, new_total
        )
        return {"status": "merged", "id": existing["id"], "quantity": new_total}

    image_path = save_upload(image) if image is not None else auto_fetch_image(title)
    inventory.add_item(title, category, quantity, image_path, notes, custom_threshold, expiration_date)
    created = inventory.find_item_by_title(title, category)
    if created:
        inventory.log_usage_event(
            created["id"], created["title"], created["category"], "add", quantity, created["quantity"]
        )
    retrain_classifier()
    return {"status": "added"}


@router.delete("/api/items/clear")
def clear_items(category: Optional[str] = None):
    """Wipe the entire inventory, or just one category if given. Registered BEFORE
    /api/items/{item_id} so the literal "clear" path segment isn't swallowed by that
    route's int path-converter (which would otherwise 422 on a non-numeric id)."""
    if category is not None and category not in CATEGORIES:
        raise HTTPException(400, f"Unknown category: {category}")
    deleted_rows = inventory.clear_items(category)
    backup_file = write_backup(deleted_rows, f"clear-{category or 'all'}")
    for row in deleted_rows:
        image_path = row.get("image_path")
        if image_path:
            path = BASE_DIR / image_path
            if path.exists():
                try:
                    path.unlink()
                except OSError:
                    pass
        for photo in row.get("_photos", []):
            photo_path = BASE_DIR / photo["image_path"]
            if photo_path.exists():
                try:
                    photo_path.unlink()
                except OSError:
                    pass
    return {"deleted": len(deleted_rows), "backup": backup_file}


@router.put("/api/items/{item_id}")
def update_item(
    item_id: int,
    title: str = Form(...),
    category: str = Form(...),
    quantity: float = Form(...),
    notes: Optional[str] = Form(None),
    custom_threshold: Optional[float] = Form(None),
    expiration_date: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
):
    new_image_path = None
    if image is not None:
        new_image_path = save_upload(image)
        items = inventory.get_items_by_category(category)
        old_item = next((i for i in items if i["id"] == item_id), None)
        if old_item and old_item.get("image_path"):
            old_path = BASE_DIR / old_item["image_path"]
            if old_path.exists():
                try:
                    old_path.unlink()
                except OSError:
                    pass
    inventory.update_item(
        item_id, title, category, quantity, notes, new_image_path, custom_threshold, expiration_date
    )
    return {"status": "updated"}


@router.patch("/api/items/{item_id}/quantity")
def patch_quantity(item_id: int, quantity: float = Form(...)):
    old = inventory.get_item(item_id)
    inventory.update_quantity(item_id, quantity)
    if old:
        delta = quantity - float(old["quantity"])
        if delta != 0:
            inventory.log_usage_event(
                item_id, old["title"], old["category"],
                "consume" if delta < 0 else "restock", delta, quantity,
            )
    return {"status": "ok"}


@router.patch("/api/items/{item_id}/use")
def use_item(item_id: int, amount: float = Form(1)):
    try:
        inventory.move_to_in_use(item_id, amount)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    it = inventory.get_item(item_id)
    if it:
        inventory.log_usage_event(item_id, it["title"], it["category"], "use", amount, it["quantity"])
    return {"status": "ok"}


@router.patch("/api/items/{item_id}/return")
def return_item(item_id: int, amount: float = Form(1)):
    try:
        inventory.move_from_in_use(item_id, amount)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    it = inventory.get_item(item_id)
    if it:
        inventory.log_usage_event(item_id, it["title"], it["category"], "return", amount, it["quantity"])
    return {"status": "ok"}


@router.delete("/api/items/{item_id}")
def remove_item(item_id: int):
    all_items = [item for cat in CATEGORIES for item in inventory.get_items_by_category(cat)]
    deleted = next((i for i in all_items if i["id"] == item_id), None)
    if not deleted:
        raise HTTPException(404, "Item not found")
    deleted_photos = inventory.delete_item(item_id)
    _remove_image_file(deleted.get("image_path"))
    for photo in deleted_photos:
        _remove_image_file(photo["image_path"])
    write_backup([deleted], "delete-item")
    inventory.log_usage_event(
        item_id, deleted["title"], deleted["category"], "remove",
        float(deleted["quantity"]) + float(deleted.get("in_use_quantity") or 0), 0,
    )
    return deleted


@router.post("/api/items/restore")
def restore_item(item: dict):
    inventory.add_item(
        item["title"],
        item["category"],
        item["quantity"],
        item.get("image_path"),
        item.get("notes"),
        item.get("custom_threshold"),
        item.get("expiration_date"),
        item.get("uuid"),
        in_use_quantity=item.get("in_use_quantity", 0),
    )
    return {"status": "restored"}


# --- Bulk operations (atomic - all-or-nothing in one DB transaction) ---
@router.post("/api/items/bulk-delete")
def bulk_delete_items(ids: list[int]):
    """Atomically delete multiple items in one transaction (all or none), back them up
    first, and clean up their image files. Returns the count deleted."""
    deleted_rows = inventory.bulk_delete_items(ids)
    if deleted_rows:
        write_backup(deleted_rows, "bulk-delete")
    for row in deleted_rows:
        _remove_image_file(row.get("image_path"))
        for photo in row.get("_photos", []):
            _remove_image_file(photo["image_path"])
    return {"deleted": len(deleted_rows)}


@router.post("/api/items/bulk-move")
def bulk_move_items(payload: dict):
    """Atomically move multiple items to another category in one transaction."""
    ids = payload.get("ids") or []
    category = payload.get("category")
    if category not in CATEGORIES:
        raise HTTPException(400, f"Unknown category: {category}")
    moved = inventory.bulk_move_items(ids, category)
    return {"moved": moved}
