"""FastAPI backend for the Grocery & Vegetable Tracker.

Reuses inventory.py (SQLite CRUD) and receipt.py (OCR) unchanged. This module is
intentionally small: app creation, middleware, CORS, the /images mount, and wiring up
every router in routers/*.py. Shared constants/helpers used by those routers live in
api_common.py - see prompt.md for the split's rationale (routers must not import from
this module, since this module imports them, which would otherwise be a circular
import).
"""
import logging
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

import inventory
from api_common import (
    FRONTEND_DIST,
    IMAGES_DIR,
    detect_import_kind,
    logger,
    retrain_classifier,
    write_icloud_snapshot,
)
from routers import (
    backups,
    charts,
    duplicates,
    export_import,
    favorites,
    insights,
    item_media,
    items,
    lookup,
    meal_plan,
    meta,
    purchases,
    receipt_scan,
    shopping_list,
    storage_locations,
    summary,
    tunnel,
)
from routers.lookup import parse_quick_add  # re-exported: tests import this from `api`

# Kept accessible as module attributes for backward compatibility (tests import
# `api.parse_quick_add` / `api.detect_import_kind` directly).
__all__ = ["app", "parse_quick_add", "detect_import_kind"]

inventory.init_db()
retrain_classifier()
write_icloud_snapshot()

app = FastAPI(title="Grocery & Vegetable Tracker API")


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log every request with its status and latency, and log (not swallow) any unhandled
    exception so real failures are visible instead of silent."""
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        elapsed = (time.perf_counter() - start) * 1000
        logger.exception("%s %s failed after %.0fms", request.method, request.url.path, elapsed)
        raise
    elapsed = (time.perf_counter() - start) * 1000
    level = logging.WARNING if response.status_code >= 500 else logging.INFO
    logger.log(
        level, "%s %s -> %s (%.0fms)", request.method, request.url.path, response.status_code, elapsed
    )
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/images", StaticFiles(directory=str(IMAGES_DIR)), name="images")

app.include_router(meta.router)
app.include_router(lookup.router)
app.include_router(items.router)
app.include_router(insights.router)
app.include_router(item_media.router)
app.include_router(summary.router)
app.include_router(favorites.router)
app.include_router(shopping_list.router)
app.include_router(meal_plan.router)
app.include_router(receipt_scan.router)
app.include_router(charts.router)
app.include_router(purchases.router)
app.include_router(export_import.router)
app.include_router(backups.router)
app.include_router(duplicates.router)
app.include_router(storage_locations.router)
app.include_router(tunnel.router)


@app.on_event("shutdown")
def _stop_tunnel_on_shutdown():
    tunnel.tunnel_stop()


# --- Serve the built frontend (single-origin mode, e.g. behind a Cloudflare Tunnel) ---
# Only active when frontend/dist exists (i.e. `npm run build` was run). Registered LAST
# so it never shadows the /api/* or /images/* routes above - Starlette matches routes in
# registration order, and this catch-all only runs if nothing earlier matched.
if FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="frontend-assets")

    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str):
        """SPA fallback: any non-API, non-asset path returns index.html so client-side
        routing (React) can handle it, instead of a 404 on refresh/deep link."""
        candidate = FRONTEND_DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")
