from typing import Optional

from fastapi import APIRouter, Form, HTTPException

import inventory
from api_common import MEAL_SLOTS

router = APIRouter()


# --- Weekly meal planner ---
@router.get("/api/meal-plan")
def get_meal_plan(start: str, end: str):
    return inventory.get_meal_plan_range(start, end)


@router.post("/api/meal-plan")
def add_meal_plan_entry(
    date: str = Form(...),
    meal_slot: str = Form(...),
    title: str = Form(...),
    notes: Optional[str] = Form(None),
    done: Optional[str] = Form(None),
):
    if meal_slot not in MEAL_SLOTS:
        raise HTTPException(400, f"meal_slot must be one of {MEAL_SLOTS}")
    entry_id = inventory.add_meal_plan_entry(date, meal_slot, title, notes, done is not None and done.lower() == "true")
    return {"id": entry_id, "status": "added"}


@router.put("/api/meal-plan/{entry_id}")
def update_meal_plan_entry(
    entry_id: int,
    date: str = Form(...),
    meal_slot: str = Form(...),
    title: str = Form(...),
    notes: Optional[str] = Form(None),
    done: Optional[str] = Form(None),
):
    if meal_slot not in MEAL_SLOTS:
        raise HTTPException(400, f"meal_slot must be one of {MEAL_SLOTS}")
    inventory.update_meal_plan_entry(
        entry_id,
        date,
        meal_slot,
        title,
        notes,
        None if done is None else done.lower() == "true",
    )
    return {"status": "updated"}


@router.patch("/api/meal-plan/{entry_id}")
def patch_meal_plan_entry(entry_id: int, done: bool = Form(...)):
    """Toggle just the done flag on a meal-plan entry without touching its other fields."""
    entry = inventory.get_meal_plan_entry(entry_id)
    if not entry:
        raise HTTPException(404, "Meal plan entry not found")
    inventory.update_meal_plan_entry(
        entry_id,
        entry["date"],
        entry["meal_slot"],
        entry["title"],
        entry.get("notes"),
        done,
    )
    return {"status": "ok"}


@router.delete("/api/meal-plan/{entry_id}")
def delete_meal_plan_entry(entry_id: int):
    inventory.delete_meal_plan_entry(entry_id)
    return {"status": "ok"}
