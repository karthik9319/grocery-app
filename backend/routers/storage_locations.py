from fastapi import APIRouter, Form, HTTPException

import inventory

router = APIRouter()


# --- Storage locations (Fridge/Freezer/Pantry/Cabinet by default, user-editable) ---
@router.get("/api/storage-locations")
def list_storage_locations():
    return inventory.get_storage_locations()


@router.post("/api/storage-locations")
def create_storage_location(name: str = Form(...), icon: str = Form("📦")):
    name = name.strip()
    if not name:
        raise HTTPException(400, "Name cannot be empty")
    try:
        return inventory.add_storage_location(name, icon)
    except ValueError as exc:
        raise HTTPException(409, str(exc))


@router.put("/api/storage-locations/{location_id}")
def update_storage_location(location_id: int, name: str = Form(...), icon: str = Form("📦")):
    name = name.strip()
    if not name:
        raise HTTPException(400, "Name cannot be empty")
    try:
        inventory.update_storage_location(location_id, name, icon)
    except ValueError as exc:
        raise HTTPException(409, str(exc))
    return {"status": "updated"}


@router.delete("/api/storage-locations/{location_id}")
def delete_storage_location(location_id: int):
    inventory.delete_storage_location(location_id)
    return {"status": "deleted"}
