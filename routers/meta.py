from fastapi import APIRouter, Form
from fastapi.responses import JSONResponse

import inventory
from api_common import CATEGORIES, CATEGORY_ICONS, CATEGORY_UNITS, PALETTE, logger

router = APIRouter()


# --- Meta ---
@router.get("/api/health")
def health_check():
    """Liveness/readiness probe: confirms the process is up AND the database is reachable
    (runs a trivial query), returning basic counts. Returns 503 if the DB can't be read."""
    try:
        total = inventory.get_total_count()
    except Exception:
        logger.exception("Health check DB read failed")
        return JSONResponse(status_code=503, content={"status": "unhealthy", "database": "error"})
    return {"status": "ok", "database": "ok", "item_total_quantity": total}


@router.get("/api/meta")
def get_meta():
    return {
        "categories": CATEGORIES,
        "icons": CATEGORY_ICONS,
        "units": CATEGORY_UNITS,
        "palette": PALETTE,
    }


# --- Settings ---
@router.get("/api/settings")
def get_settings():
    return inventory.get_settings()


@router.put("/api/settings")
def put_settings(count_threshold: float = Form(...), weight_threshold: float = Form(...)):
    inventory.update_settings(count_threshold, weight_threshold)
    return inventory.get_settings()
