from typing import Optional

from fastapi import APIRouter

import inventory

router = APIRouter()


# --- Purchases / spending ---
@router.get("/api/purchases")
def list_purchases(limit: Optional[int] = None):
    return inventory.get_purchases(limit)


@router.get("/api/purchases/summary")
def purchases_summary():
    return {
        "total_spend": inventory.get_total_spend(),
        "spend_over_time": inventory.get_spend_over_time(),
        "spend_by_item": inventory.get_spend_by_item(),
    }


@router.get("/api/purchases/last-price")
def last_price(title: str):
    return {"unit_price": inventory.get_last_price(title)}
