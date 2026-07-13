from fastapi import APIRouter, HTTPException
from typing import Dict
import inventory

router = APIRouter()

@router.patch("/meal-plan/{entry_id}")
async def patch_meal_plan_entry(entry_id: int, payload: Dict):
    entry = inventory.get_meal_plan_entry(entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Meal plan entry not found")
    if "done" in payload:
        entry["done"] = bool(payload["done"])
        inventory.update_meal_plan_entry(entry_id, **entry)
    return entry
