from typing import Optional

from fastapi import APIRouter, Form, HTTPException

import inventory
from api_common import (
    CATEGORIES,
    convert_quantity,
    effective_threshold,
    guess_category,
    normalize_unit,
    retrain_classifier,
)

router = APIRouter()


# --- Shopping list ---
@router.get("/api/shopping-list")
def list_shopping_items():
    return inventory.get_shopping_list()


@router.post("/api/shopping-list")
def add_shopping_item(
    title: str = Form(...),
    category: Optional[str] = Form(None),
    quantity: float = Form(1),
    unit: Optional[str] = Form(None),
    store: Optional[str] = Form(None),
    aisle: Optional[str] = Form(None),
    unit_price: Optional[float] = Form(None),
    substitution: Optional[str] = Form(None),
):
    resolved_category = category if category in CATEGORIES else guess_category(title)
    inventory.add_shopping_list_item(
        title,
        resolved_category,
        quantity,
        normalize_unit(unit, resolved_category),
        store,
        aisle,
        unit_price,
        substitution,
    )
    return {"status": "ok"}


@router.patch("/api/shopping-list/{item_id}")
def patch_shopping_item(item_id: int, checked: bool = Form(...)):
    inventory.set_shopping_item_checked(item_id, checked)
    return {"status": "ok"}


@router.patch("/api/shopping-list/{item_id}/quantity")
def patch_shopping_item_quantity(item_id: int, quantity: float = Form(...)):
    inventory.update_shopping_item_quantity(item_id, quantity)
    return {"status": "ok"}


@router.patch("/api/shopping-list/{item_id}/details")
def patch_shopping_item_details(
    item_id: int,
    unit: str = Form("count"),
    store: Optional[str] = Form(None),
    aisle: Optional[str] = Form(None),
    unit_price: Optional[float] = Form(None),
    substitution: Optional[str] = Form(None),
):
    inventory.update_shopping_item_details(
        item_id,
        normalize_unit(unit, "Groceries"),
        store,
        aisle,
        unit_price,
        substitution,
    )
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
        threshold = effective_threshold(item, settings)
        minimum = 1 if item["unit"] in {"count", "kg", "l"} else 500
        suggested_quantity = max(minimum, (threshold * 2) - item["quantity"])
        inventory.add_shopping_list_item(
            item["title"], item["category"], suggested_quantity, item["unit"]
        )
    after = len(inventory.get_shopping_list())
    return {"added": after - before}


@router.post("/api/shopping-list/clear-checked")
def clear_checked():
    inventory.clear_checked_shopping_items()
    return {"status": "ok"}


@router.post("/api/shopping-list/complete")
def complete_shopping_trip(payload: dict):
    """Move checked purchases into inventory, record their spend, then remove them from
    the shopping list. An optional store limits completion to that store's checked rows."""
    requested_store = (payload.get("store") or "").strip()
    checked = [row for row in inventory.get_shopping_list() if row["checked"]]
    if requested_store == "__unassigned__":
        checked = [row for row in checked if not (row.get("store") or "").strip()]
    elif requested_store:
        checked = [
            row for row in checked
            if (row.get("store") or "").strip().casefold() == requested_store.casefold()
        ]

    completed_ids = []
    completed_rows = []
    total_spend = 0.0
    added_new_inventory_item = False
    for row in checked:
        category = row["category"] if row.get("category") in CATEGORIES else guess_category(row["title"])
        unit = normalize_unit(row.get("unit"), category)
        quantity = float(row.get("quantity") or 0)
        if quantity <= 0:
            continue

        existing = inventory.find_item_by_alias(row["title"])
        merge_quantity = quantity
        if existing:
            try:
                merge_quantity = convert_quantity(quantity, unit, existing["unit"])
            except ValueError:
                existing = None
        if existing is None:
            existing = inventory.find_item_by_title(row["title"], category, unit)
        if existing is None:
            compatible = inventory.find_item_by_title(row["title"], category)
            if compatible:
                try:
                    merge_quantity = convert_quantity(quantity, unit, compatible["unit"])
                    existing = compatible
                except ValueError:
                    pass

        if existing:
            new_total = existing["quantity"] + merge_quantity
            inventory.update_item(
                existing["id"],
                existing["title"],
                existing["category"],
                new_total,
                existing.get("notes"),
                custom_threshold=existing.get("custom_threshold"),
                expiration_date=existing.get("expiration_date"),
                storage_location=existing.get("storage_location"),
                unit=existing["unit"],
            )
            inventory.log_usage_event(
                existing["id"], existing["title"], existing["category"],
                "restock", merge_quantity, new_total,
            )
        else:
            inventory.add_item(row["title"], category, quantity, None, unit=unit)
            added_new_inventory_item = True
            created = inventory.find_item_by_title(row["title"], category, unit)
            if created:
                inventory.log_usage_event(
                    created["id"], created["title"], created["category"],
                    "add", quantity, created["quantity"],
                )

        unit_price = row.get("unit_price")
        if unit_price is not None and float(unit_price) > 0:
            line_total = quantity * float(unit_price)
            total_spend += line_total
            inventory.add_purchase(
                row["title"], category, quantity, line_total,
                source=f"shopping:{row.get('store') or 'unspecified'}",
            )
        completed_ids.append(row["id"])
        completed_rows.append(row)

    trip_store = requested_store if requested_store not in {"", "__unassigned__"} else None
    trip_id = inventory.record_shopping_trip(completed_rows, total_spend, trip_store)
    inventory.delete_shopping_items(completed_ids)
    if added_new_inventory_item:
        retrain_classifier()
    return {
        "completed": len(completed_ids),
        "total_spend": round(total_spend, 2),
        "store": requested_store or None,
        "trip_id": trip_id or None,
    }


@router.get("/api/shopping-trips")
def list_shopping_trips(limit: int = 20):
    return inventory.get_shopping_trips(max(1, min(limit, 100)))


@router.post("/api/shopping-trips/{trip_id}/repeat")
def repeat_shopping_trip(trip_id: int):
    trip = inventory.get_shopping_trip(trip_id)
    if not trip:
        raise HTTPException(404, "Shopping trip not found")
    for row in trip["items"]:
        inventory.add_shopping_list_item(
            row["title"],
            row.get("category"),
            float(row.get("quantity") or 1),
            row.get("unit") or "count",
            row.get("store"),
            row.get("aisle"),
            row.get("unit_price"),
            row.get("substitution"),
        )
    return {"added": len(trip["items"]), "trip_id": trip_id}
